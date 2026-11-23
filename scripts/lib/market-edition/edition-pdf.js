/**
 * PDF copies of edition pages (market editions, daily strategy, weekly review). An edition page is self-contained:
 * inline CSS, inline SVG charts, escaped text. So the renderer loads it with JavaScript off and every network
 * request blocked, which keeps a render fast, deterministic and unable to reach anything. The page's own print
 * styles (edition-template.js) do the layout; this module only drives headless Chrome.
 *
 * Chrome: PDF_CHROME_PATH, else PUPPETEER_EXECUTABLE_PATH, else a system Chromium/Chrome, else Playwright's Chromium
 * (~/.cache/ms-playwright; the only ready-made linux-arm64 build, which the Oracle A1 VPS needs), else puppeteer's
 * own download. Snap Chromium is not searched: its private /tmp hides puppeteer's profile directory.
 * A missing browser or a failed render returns { ok: false } and never throws: the HTML edition still publishes.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { escapeHtml } from './edition-template.js';

const RENDER_TIMEOUT_MS = 60_000;
const ALLOWED_URL = /^(data|about):/i;

export const BROWSER_CANDIDATES = Object.freeze([
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]);

/**
 * Browser executable to launch, or undefined to let puppeteer use its own download.
 * @param {Record<string, string | undefined>} env
 * @param {(p: string) => boolean} exists
 * @returns {string | undefined}
 */
export function resolveBrowserPath(env = process.env, exists = fs.existsSync, home = os.homedir()) {
  const configured = [env.PDF_CHROME_PATH, env.PUPPETEER_EXECUTABLE_PATH].filter(Boolean);
  return [...configured, ...BROWSER_CANDIDATES, ...playwrightChromiums(home)].find((p) => exists(p));
}

const PLAYWRIGHT_BINARIES = Object.freeze(['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']);

/** Playwright Chromium executables under ~/.cache/ms-playwright, newest revision first ([] when none). */
export function playwrightChromiums(home = os.homedir()) {
  const root = path.join(home, '.cache', 'ms-playwright');
  let dirs;
  try {
    dirs = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
  } catch {
    return [];
  }
  const revision = (d) => Number(d.slice('chromium-'.length));
  return dirs.sort((a, b) => revision(b) - revision(a)).flatMap((d) => PLAYWRIGHT_BINARIES.map((bin) => path.join(root, d, bin)));
}

async function launchPuppeteer(executablePath) {
  const { default: puppeteer } = await import('puppeteer');
  // --no-sandbox: Ubuntu's AppArmor blocks Chrome's user-namespace sandbox for non-snap installs. The page is our
  // own escaped HTML with JavaScript disabled and the network blocked, so the sandbox guards very little here.
  return puppeteer.launch({ headless: true, executablePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}

function footerTemplate(label) {
  return `<div style="width:100%;font-size:8px;color:#77716a;padding:0 14mm;display:flex;justify-content:space-between">` +
    `<span>${escapeHtml(label)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

function removeQuietly(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // nothing to clean up
  }
}

/**
 * Renders `html` to `outPath` (written via a temp file and rename, so a sync never ships half a PDF).
 * @param {{ html: string, outPath: string, label: string, env?: object, launch?: Function, timeoutMs?: number }} options
 * @returns {Promise<{ ok: true, path: string, bytes: number } | { ok: false, reason: string }>}
 */
export async function renderPdf({ html, outPath, label, env = process.env, launch = launchPuppeteer, timeoutMs = RENDER_TIMEOUT_MS }) {
  const tmpPath = `${outPath}.${process.pid}.tmp`;
  let browser;
  try {
    browser = await launch(resolveBrowserPath(env));
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (request) => (ALLOWED_URL.test(request.url()) ? request.continue() : request.abort()));
    await page.setContent(html, { waitUntil: 'load', timeout: timeoutMs });
    await page.emulateMediaType('print');
    await page.pdf({
      path: tmpPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(label),
      timeout: timeoutMs,
    });
    fs.renameSync(tmpPath, outPath);
    return { ok: true, path: outPath, bytes: fs.statSync(outPath).size };
  } catch (error) {
    removeQuietly(tmpPath);
    return { ok: false, reason: error.message };
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
