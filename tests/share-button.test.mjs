/**
 * Share button tests — every generated-page template carries the button once and loads the shared script
 * and stylesheet; the browser script (js/share-button.js) shares the canonical URL through the share sheet,
 * falls back to copying, and shows and selects the URL when copying is blocked. The script runs in a node:vm
 * sandbox with a stub DOM, so no browser is needed. Also covers retrofitting already-published pages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SHARE_BUTTON, insertShareButton } from '../scripts/lib/share-button.js';
import { renderEditionPage } from '../scripts/lib/market-edition/edition-template.js';
import { getBriefingTemplate } from '../scripts/lib/briefing-template.js';
import { getTerminalV2Template } from '../scripts/lib/terminal-v2-template.js';
import { getBaseTemplate } from '../scripts/lib/templates.js';

const SCRIPT = fs.readFileSync(new URL('../js/share-button.js', import.meta.url), 'utf8');
const PAGE = { title: 'T', excerpt: 'E', content: 'Body text.', dateLabel: '23 November 2026', freq: 'daily', fileName: 'x.html' };
const count = (html, needle) => html.split(needle).length - 1;

test('every generated-page template includes the share button once, with its script and stylesheet', () => {
  const pages = {
    edition: renderEditionPage({ edition: { label: 'Morning brief' }, title: 'T', summary: 'S', timeLabel: '08:00 IST', body: '<p>b</p>', canonicalUrl: 'https://blogspro.in/a.html' }),
    briefing: getBriefingTemplate(PAGE),
    terminal: getTerminalV2Template({ ...PAGE, freq: 'hourly' }),
    base: getBaseTemplate({ ...PAGE, freq: 'weekly' }),
  };
  for (const [name, html] of Object.entries(pages)) {
    assert.equal(count(html, 'class="bp-share-btn"'), 1, `${name} button`);
    assert.equal(count(html, '/js/share-button.js'), 1, `${name} script`);
    assert.equal(count(html, '/css/share-button.css'), 1, `${name} stylesheet`);
  }
});

test('the snippet has no inline script or style, and the button starts hidden', () => {
  assert.match(SHARE_BUTTON, /<button type="button" class="bp-share-btn" hidden>/);
  assert.doesNotMatch(SHARE_BUTTON, /<script>|<style>|style="/);
  assert.match(SHARE_BUTTON, /<script src="\/js\/share-button\.js\?v=\d+" defer><\/script>/);
});

/** Runs the browser script against a stub DOM; returns the button, status element, copied text and selection. */
function runScript({ canonical = null, share, clipboard, secure = true, href = 'https://blogspro.in/briefings/daily/x.html?id=7#top' }) {
  const button = { hidden: true, listeners: {}, addEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || 0) + 1; this.click = fn; } };
  const status = { textContent: '' };
  const box = { dataset: {}, querySelector: (sel) => (sel === 'button' ? button : status) };
  const copied = [];
  const selected = [];
  const document = {
    title: 'Page title',
    querySelector: (sel) => (sel === 'link[rel="canonical"]' && canonical !== null
      ? { href: canonical || href, getAttribute: () => canonical } : null),
    querySelectorAll: () => [box],
    createRange: () => ({ selectNodeContents: (node) => selected.push(node.textContent) }),
  };
  const navigator = {
    ...(share ? { share } : {}),
    ...(clipboard ? { clipboard: { writeText: (t) => { copied.push(t); return clipboard(t); } } } : {}),
  };
  const window = { isSecureContext: secure, getSelection: () => ({ removeAllRanges() {}, addRange() {} }) };
  const context = { document, navigator, location: { href }, window, setTimeout: () => 0, clearTimeout: () => {} };
  vm.runInNewContext(SCRIPT, context);
  return { button, status, copied, selected, click: () => button.click(), rerun: () => vm.runInNewContext(SCRIPT, context) };
}

const tick = () => new Promise((r) => setImmediate(r));

test('the script reveals the button and shares the canonical URL through the share sheet', async () => {
  const shared = [];
  // Copy out of the sandbox realm: its objects have another Object.prototype, which strict deepEqual rejects.
  const page = runScript({ canonical: 'https://blogspro.in/briefings/hourly/a.html', share: (d) => { shared.push({ ...d }); return Promise.resolve(); } });
  assert.equal(page.button.hidden, false);
  page.click();
  await tick();
  assert.deepEqual(shared, [{ title: 'Page title', url: 'https://blogspro.in/briefings/hourly/a.html' }]);
});

test('without a canonical link it copies the address with its query (post.html?id=…) but not the hash', async () => {
  const page = runScript({ clipboard: () => Promise.resolve() });
  page.click();
  await tick();
  assert.deepEqual(page.copied, ['https://blogspro.in/briefings/daily/x.html?id=7']);
  assert.equal(page.status.textContent, 'Link copied');

  const empty = runScript({ canonical: '', clipboard: () => Promise.resolve() });
  empty.click();
  await tick();
  assert.deepEqual(empty.copied, ['https://blogspro.in/briefings/daily/x.html?id=7'], 'an empty canonical href is ignored');
});

test('when copying is blocked it shows the URL and selects it for a manual copy', async () => {
  const page = runScript({ clipboard: () => Promise.reject(new Error('denied')) });
  page.click();
  await tick();
  assert.equal(page.status.textContent, 'https://blogspro.in/briefings/daily/x.html?id=7');
  assert.deepEqual(page.selected, ['https://blogspro.in/briefings/daily/x.html?id=7']);

  const insecure = runScript({ clipboard: () => Promise.resolve(), secure: false });
  insecure.click();
  await tick();
  assert.equal(insecure.status.textContent, 'https://blogspro.in/briefings/daily/x.html?id=7');
});

test('a cancelled share sheet stays quiet; a failed one falls back to copying', async () => {
  const cancelled = runScript({ share: () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), clipboard: () => Promise.resolve() });
  cancelled.click();
  await tick();
  assert.deepEqual(cancelled.copied, []);
  assert.equal(cancelled.status.textContent, '');

  const failed = runScript({ share: () => Promise.reject(new Error('NotAllowed')), clipboard: () => Promise.resolve() });
  failed.click();
  await tick();
  assert.equal(failed.status.textContent, 'Link copied');
});

test('loading the script twice binds the button once', () => {
  const page = runScript({ clipboard: () => Promise.resolve() });
  page.rerun();
  assert.equal(page.button.listeners.click, 1);
});

test('insertShareButton retrofits each published layout once, after its title and standfirst', () => {
  const layouts = {
    edition: ['<h1>T</h1>\n<p class="lede">Lede.</p>\n<article>', '<p class="lede">Lede.</p>'],
    briefing: ['<h1>T</h1>\n            <div class="abstract">Abs.</div>\n        </header>', '<div class="abstract">Abs.</div>'],
    base: ['<h1>T</h1>\n            <div class="excerpt">Ex.</div>\n', '<div class="excerpt">Ex.</div>'],
    astro: ['<header><h1 class="mt-3">T</h1><p class="mt-5 font-serif">Ex.</p><div>meta</div></header><div>body</div>', null],
    bare: ['<h1>T</h1><section>body</section>', '</h1>'],
  };
  for (const [name, [html, anchor]] of Object.entries(layouts)) {
    const out = insertShareButton(html);
    assert.equal(count(out, 'class="bp-share-btn"'), 1, name);
    if (anchor) assert.ok(out.indexOf(anchor) + anchor.length === out.indexOf('<div class="bp-share">'), `${name}: placed right after ${anchor}`);
    else assert.ok(out.indexOf('<div class="bp-share">') < out.indexOf('</header>'), `${name}: placed inside the header`);
    assert.equal(insertShareButton(out), out, `${name}: second run changes nothing`);
  }
  assert.equal(insertShareButton('<p>no title</p>'), '<p>no title</p>', 'a page without a title is left alone');
  const astroPost = '<header><h1>T</h1><button type="button" id="copyLinkBtn">Copy link</button></header>';
  assert.equal(insertShareButton(astroPost), astroPost, 'a post page with its own share bar is left alone');
});
