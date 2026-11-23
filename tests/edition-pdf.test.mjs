/**
 * Edition PDF tests: browser discovery, the renderer against a fake browser (offline, no JS, atomic write,
 * never throws), the print styles and PDF link on the page, and one real render when a Chrome is available.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { playwrightChromiums, renderPdf, resolveBrowserPath } from '../scripts/lib/market-edition/edition-pdf.js';
import { renderEditionPage } from '../scripts/lib/market-edition/edition-template.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-'));
const EDITION = { id: 'close', label: 'Market close' };
const page = (extra = {}) => renderEditionPage({
  edition: EDITION, title: 'Nifty edges up', summary: 'Gains held.', timeLabel: '23 Nov 2026, 16:00 IST',
  body: '<section><h2>Markets</h2><svg viewBox="0 0 10 10"><rect width="5" height="5"/></svg></section>', canonicalUrl: 'https://x/a.html', ...extra,
});

test('resolveBrowserPath prefers PDF_CHROME_PATH, then PUPPETEER_EXECUTABLE_PATH, then a system browser', () => {
  const exists = (p) => ['/usr/bin/chromium', '/opt/c'].includes(p);
  assert.equal(resolveBrowserPath({ PDF_CHROME_PATH: '/opt/c' }, exists), '/opt/c');
  assert.equal(resolveBrowserPath({ PUPPETEER_EXECUTABLE_PATH: '/opt/c' }, exists), '/opt/c');
  assert.equal(resolveBrowserPath({ PDF_CHROME_PATH: '/missing' }, exists), '/usr/bin/chromium');
  assert.equal(resolveBrowserPath({}, exists), '/usr/bin/chromium');
  assert.equal(resolveBrowserPath({}, () => false, tmpDir()), undefined, 'falls back to puppeteer\'s own browser');
});

test('playwrightChromiums lists Playwright Chromium builds, newest revision first, for the arm64 VPS', () => {
  const home = tmpDir();
  const root = path.join(home, '.cache', 'ms-playwright');
  for (const d of ['chromium-1140', 'chromium-1200', 'firefox-1400', 'chromium_headless_shell-1200']) fs.mkdirSync(path.join(root, d), { recursive: true });
  const found = playwrightChromiums(home);
  assert.equal(found[0], path.join(root, 'chromium-1200', 'chrome-linux', 'chrome'));
  assert.ok(found.every((p) => p.includes(`${path.sep}chromium-1`)));
  assert.equal(found.length, 6);
  const bin = path.join(root, 'chromium-1200', 'chrome-linux', 'chrome');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, '');
  assert.equal(resolveBrowserPath({}, (p) => p === bin, home), bin);
  assert.deepEqual(playwrightChromiums(path.join(home, 'nope')), []);
});

function fakeBrowser({ failPdf = false } = {}) {
  const log = { requests: [], closed: false, js: null, media: null, options: null, html: null };
  const handlers = {};
  const pageObj = {
    setJavaScriptEnabled: async (v) => { log.js = v; },
    setRequestInterception: async () => {},
    on: (event, fn) => { handlers[event] = fn; },
    setContent: async (html) => {
      log.html = html;
      for (const url of ['data:image/png;base64,AA', 'https://evil.example/x.js', '/js/share-button.js?v=1']) {
        handlers.request({ url: () => url, continue: () => log.requests.push(['continue', url]), abort: () => log.requests.push(['abort', url]) });
      }
    },
    emulateMediaType: async (m) => { log.media = m; },
    pdf: async (options) => {
      log.options = options;
      if (failPdf) throw new Error('renderer crashed');
      fs.writeFileSync(options.path, '%PDF-1.7 fake');
    },
  };
  const launch = async () => ({ newPage: async () => pageObj, close: async () => { log.closed = true; } });
  return { launch, log };
}

test('renderPdf renders offline with JS off, writes atomically and closes the browser', async () => {
  const dir = tmpDir();
  const outPath = path.join(dir, 'x.pdf');
  const { launch, log } = fakeBrowser();
  const result = await renderPdf({ html: page(), outPath, label: 'Market close', launch, env: {} });
  assert.equal(result.ok, true);
  assert.equal(fs.readFileSync(outPath, 'utf8'), '%PDF-1.7 fake');
  assert.deepEqual(fs.readdirSync(dir), ['x.pdf'], 'no temp file left behind');
  assert.equal(log.js, false);
  assert.equal(log.media, 'print');
  assert.deepEqual(log.requests, [['continue', 'data:image/png;base64,AA'], ['abort', 'https://evil.example/x.js'], ['abort', '/js/share-button.js?v=1']]);
  assert.equal(log.options.format, 'A4');
  assert.equal(log.options.printBackground, true);
  assert.match(log.options.footerTemplate, /Market close/);
  assert.match(log.options.footerTemplate, /pageNumber/);
  assert.equal(log.closed, true);
});

test('renderPdf escapes the footer label and never mentions the publication', async () => {
  const { launch, log } = fakeBrowser();
  await renderPdf({ html: page(), outPath: path.join(tmpDir(), 'x.pdf'), label: '<b>Close</b>', launch, env: {} });
  assert.match(log.options.footerTemplate, /&lt;b&gt;Close&lt;\/b&gt;/);
  assert.doesNotMatch(`${log.options.headerTemplate}${log.options.footerTemplate}`, /blogspro/i);
});

test('renderPdf reports failure instead of throwing, removes partial output and still closes the browser', async () => {
  const dir = tmpDir();
  const { launch, log } = fakeBrowser({ failPdf: true });
  const result = await renderPdf({ html: page(), outPath: path.join(dir, 'x.pdf'), label: 'x', launch, env: {} });
  assert.equal(result.ok, false);
  assert.match(result.reason, /renderer crashed/);
  assert.deepEqual(fs.readdirSync(dir), []);
  assert.equal(log.closed, true);
  const noBrowser = await renderPdf({ html: page(), outPath: path.join(dir, 'y.pdf'), label: 'x', launch: async () => { throw new Error('no chrome'); }, env: {} });
  assert.deepEqual(noBrowser, { ok: false, reason: 'no chrome' });
});

test('edition pages carry print styles and link the PDF only when one exists', () => {
  const without = page();
  assert.match(without, /@media print/);
  assert.match(without, /@page\{size:A4/);
  assert.doesNotMatch(without, /Download PDF/);
  const withPdf = page({ pdfHref: 'swarm-hourly-1.pdf' });
  assert.match(withPdf, /<a href="swarm-hourly-1\.pdf" download>Download PDF<\/a>/);
  assert.match(page({ pdfHref: '"><script>' }), /href="&quot;&gt;&lt;script&gt;"/);
});

const realBrowser = (() => {
  try {
    return resolveBrowserPath(process.env) || fs.existsSync(path.join(os.homedir(), '.cache', 'puppeteer'));
  } catch {
    return false;
  }
})();

test('renderPdf produces a real PDF with Chrome', { skip: !realBrowser && 'no Chrome on this machine', timeout: 90_000 }, async () => {
  const outPath = path.join(tmpDir(), 'real.pdf');
  const result = await renderPdf({ html: page(), outPath, label: 'Market close', env: process.env });
  assert.equal(result.ok, true, result.reason);
  const head = fs.readFileSync(outPath).subarray(0, 5).toString();
  assert.equal(head, '%PDF-');
  assert.ok(result.bytes > 1000);
});
