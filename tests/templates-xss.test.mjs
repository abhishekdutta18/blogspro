// XSS hardening for scripts/lib/templates.js — LLM output is untrusted input.
// Run: node --test tests/templates-xss.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMD, renderBody, getBaseTemplate, getEmailTemplate, getApexTemplate } from '../scripts/lib/templates.js';
import { escapeHtml, safeUrl } from '../scripts/lib/html-sanitizer.js';
import { getBriefingTemplate } from '../scripts/lib/briefing-template.js';
import { getTerminalV2Template } from '../scripts/lib/terminal-v2-template.js';

/** Every tag in the output, with double-quoted values blanked so we only see attribute names. */
function tagShells(html) {
  return (html.match(/<[a-z][^>]*>/gi) || []).map(t => t.replace(/"[^"]*"/g, '""'));
}

function assertNoActiveContent(html) {
  assert.doesNotMatch(html, /<script\b/i, 'script tag survived');
  assert.doesNotMatch(html, /<(img|iframe|object|embed|svg|math|style|base|form|input|meta|link)\b/i, 'dangerous tag survived');
  for (const shell of tagShells(html)) {
    assert.doesNotMatch(shell, /\son[a-z]+\s*=/i, `event handler survived in ${shell}`);
  }
  assert.doesNotMatch(html, /href="\s*(javascript|vbscript|data):/i, 'unsafe href survived');
}

// ── body: raw HTML from the model ─────────────────
test('script tags are removed with their content', () => {
  const out = parseMD('Intro\n\n<script>alert(document.cookie)</script>\n\nOutro');
  assertNoActiveContent(out);
  assert.doesNotMatch(out, /alert/);
  assert.match(out, /Intro/);
  assert.match(out, /Outro/);
});

test('img onerror is escaped into inert text', () => {
  const out = parseMD('Look <img src=x onerror="alert(1)"> here');
  assertNoActiveContent(out);
  assert.match(out, /&lt;img/);
});

test('event handlers are stripped from allowed tags but the tag survives', () => {
  const out = parseMD('<div class="note" onclick="alert(1)" onmouseover=alert(2)>hi</div>');
  assertNoActiveContent(out);
  assert.match(out, /<div class="note">hi<\/div>/);
});

test('block-level lines that used to pass through verbatim are sanitized', () => {
  for (const line of [
    '<section onload=alert(1)>x</section>',
    '<span style="x" onfocus=alert(1) tabindex=1>x</span>',
    '<h2 onclick=alert(1)>Title</h2>',
    '<table><tr><td><img src=x onerror=alert(1)></td></tr></table>',
  ]) assertNoActiveContent(parseMD(line));
});

test('unknown and dangerous tags never render as elements', () => {
  const out = parseMD('<iframe src="https://evil.example"></iframe><svg onload=alert(1)><circle/></svg><form action=x><input name=a></form>');
  assertNoActiveContent(out);
});

test('style attributes keep safe declarations and drop the rest', () => {
  const out = parseMD('<div style="color:red; background:url(javascript:alert(1)); position:fixed">x</div>');
  assert.match(out, /<div style="color:red">x<\/div>/);
  assert.doesNotMatch(out, /url\(|position/);
});

test('style obfuscated with entities or escapes is dropped', () => {
  const out = parseMD('<div style="background:&#117;rl(x)">a</div><div style="background:u\\72l(x)">b</div>');
  assert.doesNotMatch(out, /style=/);
});

test('orphan closing tags cannot break out of the article container', () => {
  const out = parseMD('Text</section></main><aside>fake sidebar</aside>');
  assert.doesNotMatch(out, /<\/section>|<\/main>/);
});

test('unclosed tags are closed at the end of the fragment', () => {
  const out = parseMD('<div class="x">open forever');
  assert.equal((out.match(/<div\b/g) || []).length, (out.match(/<\/div>/g) || []).length);
});

test('HTML comments are dropped', () => {
  const out = parseMD('A <!-- [AUDIT] purged --> B\n\nC <!-- unterminated');
  assert.doesNotMatch(out, /<!--|AUDIT|unterminated/);
});

test('token sentinels in the input cannot forge restored tags', () => {
  const out = parseMD('0<b>x</b>1');
  assert.doesNotMatch(out, /[]/);
  assertNoActiveContent(out);
});

// ── body: markdown links ──────────────────────────
test('javascript: and friends never become hrefs', () => {
  for (const url of [
    'javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)',
    'java&#x09;script:alert(1)', 'javascript&colon;alert(1)', 'java&#115cript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox(1)',
  ]) {
    const out = parseMD(`See [click me](${url}) now`);
    assertNoActiveContent(out);
    assert.doesNotMatch(out, /<a\b/, `anchor rendered for ${url}`);
    assert.match(out, /click me/, 'link text is kept');
  }
});

test('quotes in a link URL cannot break out of the href attribute', () => {
  const out = parseMD('[x](https://ok.example/" onmouseover="alert(1))');
  assertNoActiveContent(out);
});

test('markdown inside attribute values cannot inject attributes', () => {
  const out = parseMD('<span title="[x](https://a.example onmouseover=alert(1)//) and --- and **b**">t</span>');
  assertNoActiveContent(out);
  assert.equal(tagShells(out).filter(s => s.startsWith('<span')).length, 1);
  assert.doesNotMatch(out, /<hr|<a\b|<strong/);
});

test('table cells are sanitized too', () => {
  const out = parseMD('| Metric | Source |\n|---|---|\n| <img src=x onerror=alert(1)> | [s](javascript:alert(1)) |');
  assertNoActiveContent(out);
  assert.match(out, /<table>/);
});

test('safe links render with noopener', () => {
  const out = parseMD('Read [the report](https://example.com/a?b=1&c=2) today');
  assert.match(out, /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">the report<\/a>/);
});

test('safeUrl accepts http(s), mailto and relative URLs only', () => {
  assert.equal(safeUrl('https://x.example/p'), 'https://x.example/p');
  assert.equal(safeUrl('mailto:desk@x.example'), 'mailto:desk@x.example');
  assert.equal(safeUrl('/articles/weekly/a.html'), '/articles/weekly/a.html');
  assert.equal(safeUrl('#sector-macro'), '#sector-macro');
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('  '), null);
});

// ── normal content renders exactly as before ──────
test('headings, bold, bullets and dividers are unchanged', () => {
  assert.equal(parseMD('## Macro Outlook'), '<h2>Macro Outlook</h2>');
  assert.equal(parseMD('### Rates'), '<h3>Rates</h3>');
  assert.equal(parseMD('- one\n- two'), '<ul><li>one</li><li>two</li></ul>');
  assert.equal(parseMD('---'), ''); // a bare dash line is treated as an orphan table separator
  assert.match(parseMD('Above --- below'), /Above <hr class="institutional-divider"> below/);
  assert.equal(
    parseMD('The **delta** is 14%.'),
    '<p style="color:var(--nexus-text-muted); line-height:1.7;">The <strong>delta</strong> is 14%.</p>',
  );
});

test('tables keep delta formatting and show numbers exactly as written', () => {
  const out = parseMD('| Metric | Value | Change |\n|---|---|---|\n| Repo | 6.5 | +0.25 |\n| GDP | 4200 | -1.2 |');
  assert.equal(out, [
    '<div class="table-container"><table><thead><tr><th>Metric</th><th>Value</th><th>Change</th></tr></thead><tbody>',
    '<tr><td>Repo</td><td>6.5</td><td><span style="color:#00D166; font-weight:700;">▲ 0.25</span></td></tr>',
    '<tr><td>GDP</td><td>4200</td><td><span style="color:#FF3B30; font-weight:700;">▼ 1.2</span></td></tr>',
    '</tbody></table></div>',
  ].join(''));
});

test('table cells never gain a currency the model did not write', () => {
  const [rate, index, big, dollars, rupees, pct] = rowCells('6.25', '92.5', '1,755', '$92.5', '₹1,620', '6.71%');
  assert.deepEqual([rate, index, big, dollars, rupees, pct], ['6.25', '92.5', '1,755', '$92.5', '₹1,620', '6.71%']);
});

/** Body cells of a one-row table whose single data row is `cells`. */
function rowCells(...cells) {
  const header = cells.map((_, i) => `H${i}`);
  const out = parseMD(`| ${header.join(' | ')} |\n|${header.map(() => '---').join('|')}|\n| ${cells.join(' | ')} |`);
  return [...out.matchAll(/<td>(.*?)<\/td>/g)].map(m => m[1]);
}

test('only signed numbers in table cells get delta styling', () => {
  const [up, down, pct, bps, arrowUp, arrowDown, unicodeMinus] =
    rowCells('+0.25', '-1.2', '+8.3%', '-18bps', '▲ 2%', '▼ 0.4%', '−3.5');
  assert.equal(up, '<span style="color:#00D166; font-weight:700;">▲ 0.25</span>');
  assert.equal(down, '<span style="color:#FF3B30; font-weight:700;">▼ 1.2</span>');
  assert.equal(pct, '<span style="color:#00D166; font-weight:700;">▲ 8.3%</span>');
  assert.equal(bps, '<span style="color:#FF3B30; font-weight:700;">▼ 18bps</span>');
  assert.equal(arrowUp, '<span style="color:#00D166; font-weight:700;">▲ 2%</span>');
  assert.equal(arrowDown, '<span style="color:#FF3B30; font-weight:700;">▼ 0.4%</span>');
  assert.equal(unicodeMinus, '<span style="color:#FF3B30; font-weight:700;">▼ 3.5</span>');
});

test('hyphens and pluses in ordinary table text are left alone', () => {
  const [label, date, quarter, plus, dash, ratio] =
    rowCells('10Y G-Sec', '2026-11-15', 'Q2-2026', 'AA+ rated', '-', 'Debt-to-GDP 82%');
  assert.equal(label, '10Y G-Sec');
  assert.equal(date, '2026-11-15');
  assert.equal(quarter, 'Q2-2026');
  assert.equal(plus, 'AA+ rated');
  assert.equal(dash, '-');
  assert.equal(ratio, 'Debt-to-GDP 82%');
});

test('links with hyphenated URLs in table cells stay links', () => {
  const [cell] = rowCells('[RBI note](https://rbi.org.in/press-release-2026)', 'x'); // tables need 2+ columns
  assert.equal(cell, '<a href="https://rbi.org.in/press-release-2026" target="_blank" rel="noopener noreferrer">RBI note</a>');
});

test('pipeline wrappers and the hidden meta excerpt survive intact', () => {
  const md = [
    '<div id="sector-macro" class="institutional-sector" data-vertical-id="macro">',
    '<h2>GLOBAL MACRO</h2>',
    '<details id="meta-excerpt" style="display:none">Executive Abstract: summary.</details>',
    '',
    'Body text.',
    '</div>',
  ].join('\n');
  const out = parseMD(md);
  assert.match(out, /^<div id="sector-macro" class="institutional-sector" data-vertical-id="macro">/);
  assert.match(out, /<details id="meta-excerpt" style="display:none">Executive Abstract: summary\.<\/details>/);
  assert.equal((out.match(/<div\b/g) || []).length, (out.match(/<\/div>/g) || []).length);
});

test('plain-text comparisons and entities read the same as before', () => {
  const out = parseMD('Rates (>8.4% nominal) & spreads < 50bps; R&amp;D');
  assert.match(out, /\(&gt;8\.4% nominal\) &amp; spreads &lt; 50bps; R&amp;D/);
});

// ── charts stay intact ────────────────────────────
test('renderBody restores chart SVG without escaping it', () => {
  const out = renderBody('Intro\n\n<chart-data>[["A", 1], ["B", 2]]</chart-data>\n\nOutro <script>x</script>');
  assert.match(out, /<figure class="bp-chart"/);
  assert.match(out, /<svg\b/);
  assert.doesNotMatch(out, /&lt;svg|&lt;figure|chart-data|<script/);
});

// ── template interpolations ───────────────────────
const HOSTILE = {
  title: 'Fed\'s "Higher" Path</title><script>alert(1)</script>',
  excerpt: '<img src=x onerror=alert(1)>',
  dateLabel: '<svg onload=alert(1)>',
  freq: 'weekly<script>',
  content: '## Body\n\nSafe text.',
};

for (const [name, render] of [['getBaseTemplate', getBaseTemplate], ['getEmailTemplate', getEmailTemplate], ['getApexTemplate', getApexTemplate]]) {
  test(`${name} escapes payload fields`, () => {
    const html = render(HOSTILE);
    assert.doesNotMatch(html, /<script>alert|<img src=x|<svg onload|weekly<script/i);
    assert.match(html, /Fed&#39;s &quot;Higher&quot; Path&lt;\/title&gt;&lt;script&gt;/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(html, /<h2>Body<\/h2>/);
  });

  test(`${name} renders missing optional fields as empty, not "undefined"`, () => {
    const html = render({ title: 'T', content: 'x', freq: 'weekly' });
    assert.doesNotMatch(html, />\s*undefined\s*</);
  });
}

test('getApexTemplate renders charts server-side', () => {
  const html = getApexTemplate({ title: 'T', excerpt: 'E', content: '<chart-data>[["A", 1], ["B", 2]]</chart-data>', freq: 'weekly' });
  assert.match(html, /<figure class="bp-chart"/);
  assert.doesNotMatch(html, /&lt;chart-data/);
});

// ── daily briefing template ───────────────────────
test('getBriefingTemplate escapes payload fields and sanitizes the body', () => {
  const html = getBriefingTemplate({ ...HOSTILE, content: '## Body\n\n<img src=x onerror=alert(1)> text' });
  assertNoActiveContent(html.match(/<article>([\s\S]*?)<\/article>/)[1]);
  assert.doesNotMatch(html, /<script>alert|<svg onload|weekly<script/i);
  assert.match(html, /Fed&#39;s &quot;Higher&quot; Path&lt;\/title&gt;&lt;script&gt;/);
  assert.match(html, /WEEKLY&lt;SCRIPT&gt; Pulse • &lt;svg onload=alert\(1\)&gt;/);
  assert.match(html, /<h2>Body<\/h2>/);
});

test('getBriefingTemplate escapes live news items in both shapes', () => {
  const fromString = getBriefingTemplate({ title: 'T', content: 'x', freq: 'daily', liveNews: 'Rates hold | <img src=x onerror=alert(1)>' });
  assert.match(fromString, /<div>Rates hold<\/div><div>&lt;img src=x onerror=alert\(1\)&gt;<\/div>/);

  const fromObject = getBriefingTemplate({
    title: 'T', content: 'x', freq: 'daily',
    liveNews: { rbi: '<script>a()</script>', sebi: 'Neutral.', summary: 'local | GLOBAL: Fed <b>holds</b> | ECB cuts' },
  });
  assert.match(fromObject, /<strong>RBI:<\/strong> &lt;script&gt;a\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(fromObject, /SEBI:/);
  assert.match(fromObject, /<strong>GLOBAL:<\/strong> Fed &lt;b&gt;holds&lt;\/b&gt;/);
  assert.match(fromObject, /<strong>GLOBAL:<\/strong> ECB cuts/);
});

test('getBriefingTemplate omits the news block for the stable baseline', () => {
  const html = getBriefingTemplate({ title: 'T', content: 'x', freq: 'daily', liveNews: 'Pulse Baseline: Stable.' });
  assert.doesNotMatch(html, /LIVE_DATA_STREAM_PRIMED/);
});

test('getBriefingTemplate renders charts server-side', () => {
  const html = getBriefingTemplate({ title: 'T', content: '<chart-data>[["A", 1], ["B", 2]]</chart-data>', freq: 'daily' });
  assert.match(html, /<figure class="bp-chart"/);
  assert.doesNotMatch(html, /&lt;chart-data/);
});

// ── hourly terminal template ──────────────────────
test('getTerminalV2Template escapes payload fields and sanitizes the body', () => {
  const html = getTerminalV2Template({ ...HOSTILE, content: '## Body\n\n<img src=x onerror=alert(1)> text' });
  assertNoActiveContent(html.match(/<article>([\s\S]*?)<\/article>/)[1]);
  assert.doesNotMatch(html, /<script>alert|<svg onload|weekly<script/i);
  assert.match(html, /<title>Fed&#39;s &quot;Higher&quot; Path&lt;\/title&gt;/);
  assert.match(html, /TIMESTAMP: &lt;SVG ONLOAD=ALERT\(1\)&gt;/);
  assert.match(html, /WEEKLY&lt;SCRIPT&gt; STRATEGIC UPDATE/);
  assert.match(html, /<h2>Body<\/h2>/);
});

test('getTerminalV2Template escapes live news items in both shapes', () => {
  const fromString = getTerminalV2Template({ title: 'T', content: 'x', freq: 'hourly', dateLabel: 'd', liveNews: 'Calm | <img src=x onerror=alert(1)>' });
  assert.match(fromString, /<span class="news-tag">LIVE_WIRE<\/span> &lt;img src=x onerror=alert\(1\)&gt;/);

  const fromObject = getTerminalV2Template({
    title: 'T', content: 'x', freq: 'hourly', dateLabel: 'd',
    liveNews: { rbi: 'Repo held | <script>a()</script>', sebi: 'Neutral.', summary: 'l | GLOBAL: Fed <b>holds</b>' },
  });
  assert.match(fromObject, /<div class="news-item"><span class="news-tag">RBI<\/span> Repo held<\/div>/);
  assert.match(fromObject, /<span class="news-tag">RBI<\/span> &lt;script&gt;a\(\)&lt;\/script&gt;/);
  assert.match(fromObject, /<span class="news-tag">GLOBAL<\/span> Fed &lt;b&gt;holds&lt;\/b&gt;/);
  assert.doesNotMatch(fromObject, /news-tag">SEBI/);
});

test('getTerminalV2Template strips a hallucinated document shell and survives missing content', () => {
  const html = getTerminalV2Template({ title: 'T', freq: 'hourly', dateLabel: 'd', content: '<!DOCTYPE html><html><head><title>x</title></head><body>## Inner</body></html>' });
  assert.match(html, /<h2>Inner<\/h2>/);
  assert.doesNotMatch(html.match(/<article>([\s\S]*?)<\/article>/)[1], /DOCTYPE|&lt;html/);
  assert.doesNotThrow(() => getTerminalV2Template({ title: 'T', freq: 'hourly', dateLabel: 'd' }));
});

test('getTerminalV2Template renders charts server-side', () => {
  const html = getTerminalV2Template({ title: 'T', content: '<chart-data>[["A", 1], ["B", 2]]</chart-data>', freq: 'hourly', dateLabel: 'd' });
  assert.match(html, /<figure class="bp-chart"/);
  assert.doesNotMatch(html, /&lt;chart-data/);
});

test('escapeHtml covers the five significant characters', () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});
