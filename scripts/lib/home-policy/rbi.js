/**
 * Reserve Bank of India data for the homepage Policy section:
 *   - policy rates and the USD/INR rate from the "Current Rates" box on https://www.rbi.org.in/
 *   - recent press releases from https://rbi.org.in/pressreleases_rss.xml, minus daily operations notices
 * Both are external pages, so values are range-checked and links must point back to rbi.org.in.
 */

// The homepage labels, in display order. Matching is on the page's visible text.
const RATES = Object.freeze([
  { key: 'repo', match: 'Policy Repo Rate', label: 'Policy repo rate' },
  { key: 'sdf', match: 'Standing Deposit Facility Rate', label: 'Standing deposit facility' },
  { key: 'msf', match: 'Marginal Standing Facility Rate', label: 'Marginal standing facility' },
  { key: 'bank', match: 'Bank Rate', label: 'Bank rate' },
  { key: 'crr', match: 'CRR', label: 'Cash reserve ratio' },
  { key: 'slr', match: 'SLR', label: 'Statutory liquidity ratio' },
]);
const MAX_RATE = 30; // percent; anything above is a parse error, not a policy rate
const MAX_RELEASES = 5;
const TITLE_MAX = 160;
// Daily liquidity and auction notices outnumber everything else in the feed and say nothing about policy.
const ROUTINE = /money market operations|\bauction\b|treasury bills?|reserve money|lending and deposit rates|weekly statistical|\bVRR\b|\bVRRR\b|cut-off/i;
const RBI_LINK = /^https?:\/\/(?:www\.)?rbi\.org\.in\//i;
const IST_OFFSET = '+0530'; // the feed's pubDate has no zone; RBI publishes in IST

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" });

function decodeEntities(text) {
  return text.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return ENTITIES[name.toLowerCase()] ?? whole;
    const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

/** Visible text of an HTML page: no scripts or styles, tags as spaces, whitespace collapsed. */
export function htmlToText(html) {
  const withoutCode = String(html).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  return decodeEntities(withoutCode.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readRate(text, { key, match, label }) {
  const found = text.match(new RegExp(`(?:^| )${escapeRegExp(match)} : (\\d{1,2}(?:\\.\\d{1,4})?) ?%`));
  const value = found ? Number(found[1]) : NaN;
  return value > 0 && value <= MAX_RATE ? { key, label, value } : null;
}

/** { rates: [{ key, label, value }], usdInr } from the RBI homepage, or null without a usable repo rate. */
export function parseRbiRates(html) {
  const text = htmlToText(html);
  const rates = RATES.map((rate) => readRate(text, rate)).filter(Boolean);
  if (!rates.some((r) => r.key === 'repo')) return null;
  const usd = Number(text.match(/INR \/ 1 USD : (\d{2,3}\.\d{1,4})/)?.[1]);
  return { rates, usdInr: Number.isFinite(usd) ? usd : null };
}

function tag(item, name) {
  const raw = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '';
  return decodeEntities(raw.replace(/^\s*<!\[CDATA\[|\]\]>\s*$/g, '')).replace(/\s+/g, ' ').trim();
}

function toRelease(item) {
  const title = tag(item, 'title').slice(0, TITLE_MAX);
  const link = tag(item, 'link');
  const time = Date.parse(`${tag(item, 'pubDate')} ${IST_OFFSET}`);
  if (!title || ROUTINE.test(title) || !RBI_LINK.test(link) || !Number.isFinite(time)) return null;
  return { title, href: link.replace(/^http:/i, 'https:'), time };
}

/** The newest non-routine press releases from the RBI RSS feed: [{ title, href, time }]. */
export function parseRbiReleases(xml) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.map(toRelease).filter(Boolean).sort((a, b) => b.time - a.time).slice(0, MAX_RELEASES);
}
