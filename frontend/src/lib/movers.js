/**
 * Text and rows for the Top and bottom performers section (components/IndexMovers.astro). The text helpers
 * are pure and tested in tests/insight-charts.test.mjs; moverRow builds a list item with textContent only.
 */

const CURRENCY_LOCALE = Object.freeze({ INR: 'en-IN', USD: 'en-US', JPY: 'ja-JP' });
const IST = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

/** "+3.21%" / "-0.40%": the sign travels with the number so colour is never the only cue. */
export const formatChange = (pct) => `${pct > 0 ? '+' : pct < 0 ? '-' : ''}${Math.abs(pct).toFixed(2)}%`;

/** "₹1,234.50", "$412.10", "￥2,345" in the index's currency, or "" without a price. */
export function formatPrice(price, currency) {
  if (!Number.isFinite(price)) return '';
  const locale = CURRENCY_LOCALE[currency] ?? 'en-US';
  return currency
    ? new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: currency === 'JPY' ? 0 : 2 }).format(price)
    : price.toFixed(2);
}

/** "31 of 50 rose, 18 fell · Nasdaq-100 members; …" for an index. */
export function breadthText(index) {
  const counts = Number.isFinite(index.count) && Number.isFinite(index.advancers) && Number.isFinite(index.decliners)
    ? `${index.advancers} of ${index.count} rose, ${index.decliners} fell`
    : '';
  const updated = `prices at ${IST.format(new Date(index.fetchedAt))} IST`;
  return [counts, updated, index.note].filter(Boolean).join(' · ');
}

/** "Updated 23 Nov, 15:30 IST" for the file, or a plain label without a time. */
export const moversLabel = (generatedAt) => (Number.isFinite(generatedAt) ? `Updated ${IST.format(new Date(generatedAt))} IST` : 'Today');

/** One <li>: name and symbol on the left, price and signed change on the right. */
export function moverRow(mover, currency) {
  const li = document.createElement('li');
  li.className = 'flex items-baseline justify-between gap-4 py-2';
  const left = document.createElement('span');
  left.className = 'min-w-0 truncate';
  const name = Object.assign(document.createElement('span'), { className: 'font-medium', textContent: mover.name });
  const symbol = Object.assign(document.createElement('span'), { className: 'ml-2 font-mono text-xs text-ink-3', textContent: mover.symbol });
  left.append(name, symbol);
  const right = document.createElement('span');
  right.className = 'shrink-0 text-right font-mono num';
  const price = Object.assign(document.createElement('span'), { className: 'mr-3 text-ink-2', textContent: formatPrice(mover.price, currency) });
  const change = Object.assign(document.createElement('span'), { className: mover.changePct >= 0 ? 'text-up' : 'text-down', textContent: formatChange(mover.changePct) });
  right.append(price, change);
  li.append(left, right);
  return li;
}
