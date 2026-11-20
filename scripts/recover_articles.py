"""
recover_articles.py — rebuilds full article text from git history when Firestore is
unreachable (billing disabled on blogspro-ai).

The SEO cron used to commit p/<slug>.html with the full Firestore body inside
<div class="article-content">. For every article listed in frontend/src/data/articles.ts
this picks the committed version with the longest body, sanitizes it with an allowlist
(the site renders article HTML unescaped), converts the old dark-theme chart widgets into
plain tables, and writes frontend/src/data/recovered-posts.json, which
frontend/src/lib/articleContent.ts merges in after any live Firestore snapshot.

Usage:  python3 -I scripts/recover_articles.py [--out PATH]
Stdlib only; reads git history, never touches the network.
"""
import argparse
import html as html_lib
import json
import re
import subprocess
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ARCHIVE = ROOT / 'frontend/src/data/articles.ts'
DEFAULT_OUT = ROOT / 'frontend/src/data/recovered-posts.json'
MAX_REVISIONS = 120
MIN_WORDS = 200

VOID = {'br', 'hr', 'img', 'input', 'meta', 'link', 'source', 'wbr', 'col', 'area', 'base', 'embed', 'param', 'track'}
ALLOWED = {'p', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'blockquote', 'cite', 'sup', 'sub',
           'code', 'pre', 'br', 'hr', 'a', 'small', 'div', 'figure', 'figcaption',
           'table', 'caption', 'thead', 'tbody', 'tr', 'th', 'td'}
DROPPED = {'script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input', 'button', 'select',
           'textarea', 'noscript', 'template', 'link', 'meta', 'img', 'video', 'audio', 'canvas'}
SAFE_URL = re.compile(r'^(https?://|mailto:|#)', re.I)
UNIT_JUNK = re.compile(r'\s+[^\s\d,]*(?:,[^\s\d,]*)+$')  # "1.25 $,%,min,%" -> "1.25" (old widget bug)
SVG_NOTE = '<p><em>The chart for this figure could not be recovered from the archive.</em></p>'


# ── Minimal DOM ──────────────────────────────────────────────────────────────

class Element:
    def __init__(self, tag, attrs):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def classes(self):
        return (self.attrs.get('class') or '').split()

    def elements(self):
        return [c for c in self.children if isinstance(c, Element)]

    def text_leaves(self):
        """Non-empty text pieces in document order (whitespace-collapsed)."""
        out = []
        for child in self.children:
            if isinstance(child, Element):
                out.extend(child.text_leaves())
            elif child.strip():
                out.append(' '.join(child.split()))
        return out

    def find_all(self, tag):
        for child in self.elements():
            if child.tag == tag:
                yield child
            yield from child.find_all(tag)


class TreeBuilder(HTMLParser):
    """Builds an Element tree, tolerating unclosed and stray end tags."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Element('#root', {})
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Element(tag, attrs))

    def handle_endtag(self, tag):
        for depth in range(len(self.stack) - 1, 0, -1):
            if self.stack[depth].tag == tag:
                del self.stack[depth:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(markup):
    builder = TreeBuilder()
    builder.feed(markup)
    builder.close()
    return builder.root


def escape(text):
    return html_lib.escape(text, quote=False)


def serialize_raw(node):
    if not isinstance(node, Element):
        return escape(node)
    attrs = ''.join(f' {k}="{html_lib.escape(v or "")}"' for k, v in node.attrs.items())
    inner = ''.join(serialize_raw(c) for c in node.children)
    return f'<{node.tag}{attrs}>' if node.tag in VOID else f'<{node.tag}{attrs}>{inner}</{node.tag}>'


# ── Page extraction ──────────────────────────────────────────────────────────

def find_article_content(node):
    for child in node.elements():
        if child.tag == 'div' and 'article-content' in child.classes():
            return child
        found = find_article_content(child)
        if found:
            return found
    return None


def extract_body(page):
    """Raw inner HTML of div.article-content, or None when the page has none."""
    content = find_article_content(parse(page))
    return None if content is None else ''.join(serialize_raw(c) for c in content.children)


def page_title(page):
    match = re.search(r'<title>(.*?)</title>', page, re.S)
    title = html_lib.unescape(match.group(1)).strip() if match else ''
    return re.sub(r'\s+[—–-]\s+BlogsPro$', '', title)


# ── Sanitizing ───────────────────────────────────────────────────────────────

def clean_attrs(node):
    if node.tag == 'a':
        href = (node.attrs.get('href') or '').strip()
        if not SAFE_URL.match(href):
            return ''
        external = href.lower().startswith('http')
        return f' href="{html_lib.escape(href)}"' + (' rel="noopener noreferrer nofollow" target="_blank"' if external else '')
    if node.tag in ('td', 'th'):
        return ''.join(f' {k}="{node.attrs[k]}"' for k in ('colspan', 'rowspan') if (node.attrs.get(k) or '').isdigit())
    return ''


def clean_node(node):
    if not isinstance(node, Element):
        return escape(node)
    if node.tag in DROPPED:
        return ''
    if 'bp-chart-block' in node.classes():
        return chart_to_figure(node)
    inner = ''.join(clean_node(c) for c in node.children)
    if node.tag not in ALLOWED:
        return inner
    return f'<{node.tag}{clean_attrs(node)}>' if node.tag in VOID else f'<{node.tag}{clean_attrs(node)}>{inner}</{node.tag}>'


def clean_article_html(markup):
    """Allowlist-sanitized article HTML; chart widgets become tables or captioned notes."""
    return ''.join(clean_node(c) for c in parse(markup).children).strip()


# ── Chart widgets ────────────────────────────────────────────────────────────

def is_header(node):
    """The title/subtitle/description stack: 1–3 divs holding only text."""
    kids = node.elements()
    return node.tag == 'div' and 0 < len(kids) <= 3 and all(k.tag == 'div' and not k.elements() for k in kids)


def chart_parts(block):
    parts = {'header': [], 'source': '', 'series': [], 'groups': []}
    for child in block.elements():
        leaves = child.text_leaves()
        style = child.attrs.get('style') or ''
        if not parts['header'] and not parts['groups'] and is_header(child):
            parts['header'] = leaves
        elif leaves and leaves[0].startswith('Source'):
            parts['source'] = ' '.join(leaves)
        elif 'flex-wrap' in style and not parts['series']:
            parts['series'] = [' '.join(span.text_leaves()) for span in child.elements() if span.text_leaves()]
        elif child.tag not in ('svg', 'table') and leaves:
            parts['groups'].append(leaves)
    return parts


def group_row(leaves, series):
    """[category, s1, v1, s2, v2] -> [category, v1, v2] when the labels match the legend."""
    if series and len(leaves) == 1 + 2 * len(series) and leaves[1::2] == series:
        return [leaves[0], *leaves[2::2]], True
    return leaves, False


def rows_table(groups, series):
    rows, matched = [], False
    for leaves in groups:
        row, is_series_row = group_row([UNIT_JUNK.sub('', cell) for cell in leaves], series)
        rows.append(row)
        matched = matched or is_series_row
    if not rows:
        return ''
    width = max(len(r) for r in rows)
    head = '<thead><tr><th></th>' + ''.join(f'<th>{escape(s)}</th>' for s in series) + '</tr></thead>' if matched else ''
    body = ''.join('<tr>' + ''.join(f'<td>{escape(c)}</td>' for c in r + [''] * (width - len(r))) + '</tr>' for r in rows)
    return f'<table>{head}<tbody>{body}</tbody></table>'


def chart_to_figure(block):
    parts = chart_parts(block)
    caption = ''
    if parts['header']:
        title, *rest = parts['header']
        caption = f'<figcaption><strong>{escape(title)}</strong>' + (f'<br>{escape(" · ".join(rest))}' if rest else '') + '</figcaption>'
    tables = list(block.find_all('table'))
    if tables:
        body = ''.join(clean_node(t) for t in tables)
    elif any(True for _ in block.find_all('svg')):
        legend = f'<p>Series: {escape(", ".join(parts["series"]))}</p>' if parts['series'] else ''
        body = SVG_NOTE + legend
    else:
        body = rows_table(parts['groups'], parts['series'])
    source = f'<p><small>{escape(parts["source"])}</small></p>' if parts['source'] else ''
    return f'<figure>{caption}{body}{source}</figure>'


# ── Git history ──────────────────────────────────────────────────────────────

def git(*args):
    return subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True, errors='replace', check=True).stdout


def word_count(markup):
    return len(html_lib.unescape(re.sub(r'<[^>]+>', ' ', markup)).split())


def best_version(slug):
    """(clean_html, title, commit, date) of the committed page with the longest body, or None."""
    path = f'p/{slug}.html'
    best = None
    for line in git('log', '--format=%h %ad', '--date=short', f'-n{MAX_REVISIONS}', '--', path).splitlines():
        commit, date = line.split()
        page = git('show', f'{commit}:{path}')
        body = extract_body(page)
        if body is None:
            continue
        cleaned = clean_article_html(body)
        if best is None or word_count(cleaned) > word_count(best[0]):
            best = (cleaned, page_title(page), commit, date)
    return best


def archive_slugs():
    return re.findall(r'"slug":\s*"([^"]+)"', ARCHIVE.read_text(encoding='utf-8'))


def recover(slugs):
    posts = []
    for slug in slugs:
        found = best_version(slug)
        words = word_count(found[0]) if found else 0
        if not found or words < MIN_WORDS:
            print(f'  skip  {slug}: {words} words in history', file=sys.stderr)
            continue
        content, title, commit, date = found
        posts.append({'docId': slug, 'slug': slug, 'title': title, 'content': content,
                      'recoveredFrom': {'commit': commit, 'date': date}})
        print(f'  ok    {slug}: {words} words from {commit} ({date})', file=sys.stderr)
    return posts


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    parser.add_argument('--out', type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    slugs = archive_slugs()
    if not slugs:
        sys.exit(f'No slugs found in {ARCHIVE}')
    posts = recover(slugs)
    if not posts:
        sys.exit('Nothing recovered; existing file left untouched.')
    args.out.write_text(json.dumps(sorted(posts, key=lambda p: p['slug']), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Wrote {len(posts)}/{len(slugs)} articles to {args.out.relative_to(ROOT)}', file=sys.stderr)


if __name__ == '__main__':
    main()
