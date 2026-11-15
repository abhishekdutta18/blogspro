/**
 * HTML hardening for LLM-generated article content.
 *
 * Model output is untrusted: it can carry <script>, event handlers, javascript: URLs, or closing
 * tags that escape the article container. The pipeline itself still writes a little structural
 * HTML into article bodies (sector wrappers, <details id="meta-excerpt">, headings), so this
 * module keeps an allowlist of tags, rebuilds each kept tag from validated attributes only, and
 * escapes everything else as text.
 *
 * Kept tags are swapped for opaque tokens (Unicode private-use sentinels) so later markdown
 * regexes in parseMD only ever see escaped text and can never rewrite inside an attribute.
 */

const TOKEN_OPEN = '';
const TOKEN_CLOSE = '';
const TOKEN_RE = /(\d+)/g;
const SENTINEL_RE = /[]/g;

const ALLOWED_TAGS = new Set([
  'div', 'section', 'article', 'aside', 'header', 'footer', 'details', 'summary',
  'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'sup', 'sub', 'span', 'abbr', 'time',
  'blockquote', 'q', 'cite', 'code', 'pre', 'kbd', 'figure', 'figcaption',
  'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col', 'a',
]);
const VOID_TAGS = new Set(['br', 'hr', 'col']);
/** Removed together with their content: shown as text they would only be noise. */
const DROP_WITH_CONTENT_RE =
  /<(script|style|iframe|frame|frameset|object|embed|noscript|template|textarea|xmp|noembed|svg|math)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;

const TAG_RE = /<(\/?)([a-z][a-z0-9-]*)((?:\s+[^\s"'<>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/gi;
const ATTR_RE = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const GLOBAL_ATTRS = new Set(['id', 'class', 'title', 'style', 'lang']);
const TAG_ATTRS = {
  a: ['href'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], details: ['open'],
  ol: ['start'], time: ['datetime'], col: ['span'], colgroup: ['span'],
};
const NUMERIC_ATTRS = new Set(['colspan', 'rowspan', 'start', 'span']);
const BOOLEAN_ATTRS = new Set(['open']);
const DATA_ATTR_RE = /^data-[a-z0-9-]+$/;
const MAX_NUMERIC_DIGITS = 4;

/** No positioning/size properties: they enable overlays that impersonate site UI. */
const SAFE_CSS_PROPS = new Set([
  'display', 'color', 'background-color', 'font-weight', 'font-style', 'font-size', 'font-family',
  'text-align', 'text-decoration', 'text-transform', 'letter-spacing', 'line-height', 'opacity',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius',
]);
/** Literal values plus colour/var functions only — no url(), expression(), escapes or comments. */
const SAFE_CSS_VALUE_RE = /^(?:[#a-z0-9\s.,%+'-]|(?:rgba?|hsla?|var)\([#a-z0-9\s.,%+-]*\))+$/i;

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);
const SCHEME_RE = /^([a-z][a-z0-9+.-]*):/i;
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n',
  sol: '/', lpar: '(', rpar: ')', nbsp: ' ',
};

/** Escape a value for HTML text or a double-quoted attribute. null/undefined render as ''. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escape free text but keep well-formed entities the model wrote (&amp;, &#8377;) rendering as before. */
function escapeText(text) {
  return text
    .replace(/&(?!(?:#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Decode entities the way a browser would inside an attribute (numeric ones even without a
 * trailing ';'), so obfuscations like `java&#x09;script:` are judged on what the browser sees.
 */
function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (match, ref) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? match;
  });
}

const MAX_DECODE_PASSES = 5;

/**
 * Decode until stable: text is entity-escaped before markdown links are parsed, so a URL may
 * arrive double-encoded (`&amp;#115;`). Judging the fully decoded form is the strict choice.
 */
function decodeFully(value) {
  let current = value;
  for (let i = 0; i < MAX_DECODE_PASSES; i++) {
    const next = decodeEntities(current);
    if (next === current) return current;
    current = next;
  }
  return current;
}

/**
 * Validate a link target. Returns an attribute-safe href, or null when the URL is empty or uses
 * any scheme other than http, https or mailto. Relative paths and #fragments are allowed.
 */
export function safeUrl(raw) {
  const url = decodeFully(String(raw ?? '')).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!url) return null;
  const scheme = url.match(SCHEME_RE);
  if (scheme && !SAFE_SCHEMES.has(scheme[1].toLowerCase())) return null;
  return escapeHtml(url.replace(/\s/g, '%20'));
}

function cleanStyle(css) {
  return css.split(';').map(decl => decl.trim()).filter(decl => {
    const colon = decl.indexOf(':');
    if (colon < 1) return false;
    const prop = decl.slice(0, colon).trim().toLowerCase();
    return SAFE_CSS_PROPS.has(prop) && SAFE_CSS_VALUE_RE.test(decl.slice(colon + 1).trim());
  }).join('; ');
}

function isAllowedAttribute(tag, name) {
  return GLOBAL_ATTRS.has(name) || DATA_ATTR_RE.test(name) || (TAG_ATTRS[tag] || []).includes(name);
}

/** Returns the rebuilt `name="value"` pair, or null to drop the attribute. */
function cleanAttribute(tag, name, rawValue) {
  if (!isAllowedAttribute(tag, name)) return null;
  if (BOOLEAN_ATTRS.has(name)) return name;
  const value = decodeEntities(rawValue);
  if (NUMERIC_ATTRS.has(name)) {
    const digits = value.trim();
    return new RegExp(`^\\d{1,${MAX_NUMERIC_DIGITS}}$`).test(digits) ? `${name}="${digits}"` : null;
  }
  if (name === 'href') {
    const href = safeUrl(value);
    return href ? `href="${href}"` : null;
  }
  if (name === 'style') {
    const css = cleanStyle(value);
    return css ? `style="${css}"` : null;
  }
  return `${name}="${escapeHtml(value)}"`;
}

function cleanAttributes(tag, rawAttrs) {
  const seen = new Set();
  const kept = [];
  for (const m of rawAttrs.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const pair = cleanAttribute(tag, name, m[2] ?? m[3] ?? m[4] ?? '');
    if (pair) kept.push(pair);
  }
  if (tag === 'a' && kept.some(pair => pair.startsWith('href='))) kept.push('target="_blank"', 'rel="noopener noreferrer"');
  return kept.length ? ` ${kept.join(' ')}` : '';
}

/** Anchor markup for a markdown link, shielded so later regexes cannot touch the href. */
export function renderLink(label, url, stash) {
  const href = safeUrl(url);
  if (!href) return label;
  return `${stash(`<a href="${href}" target="_blank" rel="noopener noreferrer">`)}${label}${stash('</a>')}`;
}

/**
 * Neutralise untrusted markup in `text`.
 * @returns {{ text: string, stash: (html: string) => string, restore: (html: string) => string }}
 *   `text` holds escaped text plus tokens for the surviving tags; `stash` registers further
 *   trusted markup behind a token; `restore` swaps every token back for its markup.
 */
export function shieldMarkup(text) {
  const tags = [];
  const stash = html => `${TOKEN_OPEN}${tags.push(html) - 1}${TOKEN_CLOSE}`;
  const openStack = [];
  const source = String(text ?? '')
    .replace(SENTINEL_RE, '')
    .replace(COMMENT_RE, '')
    .replace(DROP_WITH_CONTENT_RE, '');

  let out = '';
  let cursor = 0;
  for (const m of source.matchAll(TAG_RE)) {
    out += escapeText(source.slice(cursor, m.index));
    cursor = m.index + m[0].length;
    out += shieldTag(m, openStack, stash);
  }
  out += escapeText(source.slice(cursor));
  // Close what the model left open so it cannot swallow the template markup that follows.
  out += openStack.reverse().map(tag => stash(`</${tag}>`)).join('');

  const restore = html => html.replace(TOKEN_RE, (_, i) => tags[Number(i)] ?? '');
  return { text: out, stash, restore };
}

function shieldTag([whole, slash, rawName, rawAttrs], openStack, stash) {
  const tag = rawName.toLowerCase();
  if (!ALLOWED_TAGS.has(tag)) return escapeText(whole);
  if (slash) {
    const at = openStack.lastIndexOf(tag);
    if (at === -1) return ''; // orphan closer: it would close the template's own container
    openStack.length = at;
    return stash(`</${tag}>`);
  }
  if (!VOID_TAGS.has(tag)) openStack.push(tag);
  return stash(`<${tag}${cleanAttributes(tag, rawAttrs)}>`);
}
