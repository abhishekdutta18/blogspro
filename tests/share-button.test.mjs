/**
 * Share button tests — every generated-page template carries the button once, and its script shares the
 * canonical URL through the share sheet, falls back to copying, and shows the URL when copying is blocked.
 * The script runs in a node:vm sandbox with a stub DOM, so no browser is needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { SHARE_BUTTON } from '../scripts/lib/share-button.js';
import { renderEditionPage } from '../scripts/lib/market-edition/edition-template.js';
import { getBriefingTemplate } from '../scripts/lib/briefing-template.js';
import { getTerminalV2Template } from '../scripts/lib/terminal-v2-template.js';
import { getBaseTemplate } from '../scripts/lib/templates.js';

const PAGE = { title: 'T', excerpt: 'E', content: 'Body text.', dateLabel: '23 November 2026', freq: 'daily', fileName: 'x.html' };

const count = (html, needle) => html.split(needle).length - 1;

test('every generated-page template includes the share button exactly once', () => {
  const pages = {
    edition: renderEditionPage({ edition: { label: 'Morning brief' }, title: 'T', summary: 'S', timeLabel: '08:00 IST', body: '<p>b</p>', canonicalUrl: 'https://blogspro.in/a.html' }),
    briefing: getBriefingTemplate(PAGE),
    terminal: getTerminalV2Template({ ...PAGE, freq: 'hourly' }),
    base: getBaseTemplate({ ...PAGE, freq: 'weekly' }),
  };
  for (const [name, html] of Object.entries(pages)) {
    assert.equal(count(html, 'class="bp-share-btn"'), 1, `${name} page`);
  }
});

test('the button starts hidden so a page without JavaScript never shows a dead button', () => {
  assert.match(SHARE_BUTTON, /<button type="button" class="bp-share-btn" hidden>/);
});

/** Runs the snippet's script against a stub DOM; returns the button, status element and copied text. */
function runScript({ canonical = null, share, clipboard, secure = true }) {
  const script = SHARE_BUTTON.match(/<script>([\s\S]*?)<\/script>/)[1];
  const button = { hidden: true, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; } };
  const status = { textContent: '' };
  const box = { querySelector: (sel) => (sel === 'button' ? button : status) };
  const copied = [];
  const document = {
    title: 'Page title',
    querySelector: (sel) => (sel === 'link[rel="canonical"]' && canonical ? { href: canonical } : null),
    querySelectorAll: () => [box],
  };
  const navigator = {
    ...(share ? { share } : {}),
    ...(clipboard ? { clipboard: { writeText: (t) => { copied.push(t); return clipboard(t); } } } : {}),
  };
  const location = { origin: 'https://blogspro.in', pathname: '/briefings/daily/x.html' };
  vm.runInNewContext(script, { document, navigator, location, isSecureContext: secure, window: { isSecureContext: secure }, setTimeout: () => 0, clearTimeout: () => {} });
  return { button, status, copied, click: () => button.listeners.click() };
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

test('without a share sheet it copies the page address (no query or hash) and says so', async () => {
  const page = runScript({ clipboard: () => Promise.resolve() });
  page.click();
  await tick();
  assert.deepEqual(page.copied, ['https://blogspro.in/briefings/daily/x.html']);
  assert.equal(page.status.textContent, 'Link copied');
});

test('when copying is blocked it shows the URL so the reader can copy it by hand', async () => {
  const page = runScript({ clipboard: () => Promise.reject(new Error('denied')) });
  page.click();
  await tick();
  assert.equal(page.status.textContent, 'https://blogspro.in/briefings/daily/x.html');

  const insecure = runScript({ clipboard: () => Promise.resolve(), secure: false });
  insecure.click();
  await tick();
  assert.equal(insecure.status.textContent, 'https://blogspro.in/briefings/daily/x.html');
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
