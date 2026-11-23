/**
 * Edition page — renders a market edition as a standalone HTML page. Every value is escaped: the text comes
 * from a model and from news feeds, so nothing is ever inserted as HTML. Market figures come from the quote
 * snapshot, not from the model, so the table is right even when the commentary is missing.
 */

import { PERIODS, formatLastTrade, latestQuoteTime } from './market-data.js';
import { CHART_STYLES, divergingBarChart, lineChart } from './charts.js';
import { SHARE_BUTTON } from '../share-button.js';

const NUMBER = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function signed(value, suffix = '') {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${NUMBER.format(Math.abs(value))}${suffix}`;
}

function direction(value) {
  if (value === null || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

function quoteRow(q) {
  if (!q.ok) return `<tr><th scope="row">${escapeHtml(q.name)}</th><td colspan="3" class="na">Unavailable</td></tr>`;
  const dir = direction(q.change);
  return `<tr><th scope="row">${escapeHtml(q.name)}</th><td>${NUMBER.format(q.price)}</td>` +
    `<td class="${dir}">${signed(q.change)}</td><td class="${dir}">${signed(q.changePct, '%')}</td></tr>`;
}

function marketTables(groups, period) {
  return groups.map((g) => `
    <table class="quotes">
      <caption>${escapeHtml(g.title)}${latestQuoteTime(g) ? ` <span class="asof">as of ${escapeHtml(formatLastTrade(latestQuoteTime(g)))}</span>` : ''}</caption>
      <thead><tr><th scope="col">Instrument</th><th scope="col">Last</th><th scope="col">Change</th><th scope="col">${escapeHtml(period.column)}</th></tr></thead>
      <tbody>${g.quotes.map(quoteRow).join('')}</tbody>
    </table>`).join('');
}

function section(title, inner) {
  return inner ? `<section><h2>${escapeHtml(title)}</h2>${inner}</section>` : '';
}

const paragraphs = (list = []) => list.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
const bullets = (list = []) => (list.length ? `<ul>${list.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : '');
const subsection = (title, list) => (list?.length ? `<h3 class="sub">${escapeHtml(title)}</h3>${paragraphs(list)}` : '');

// Volatility index: a % move in VIX is not an equity move, so it stays out of the index bars.
const NON_EQUITY = new Set(['^INDIAVIX']);

function dayMoves(markets, ids) {
  return markets
    .filter((g) => ids.includes(g.id))
    .flatMap((g) => g.quotes)
    .filter((q) => q.ok && !NON_EQUITY.has(q.symbol))
    .map((q) => ({ label: q.name, value: q.changePct }));
}

/** Charts above the tables. Currencies, yields and commodities stay table-only: "up" means different things there. */
function marketCharts(markets, histories, period) {
  const indices = divergingBarChart({ title: 'Equity indices', caption: period.caption, items: dayMoves(markets, ['india', 'global']) });
  const sectors = divergingBarChart({ title: 'NSE sectors', caption: period.caption, items: dayMoves(markets, ['sectors']) });
  const lines = histories.map((h) => lineChart({ title: h.name, points: h.points })).filter(Boolean).join('');
  const bars = [indices, sectors].filter(Boolean).join('');
  return [bars && `<div class="charts">${bars}</div>`, lines && `<div class="charts two">${lines}</div>`].filter(Boolean).join('');
}

function whatHappened(text) {
  if (!text) return '';
  return [
    subsection('India', text.india),
    subsection('Global markets', text.global),
    subsection('Rupee, rates and commodities', text.macro),
  ].join('');
}

function storyItem(story) {
  const title = /^https?:\/\//i.test(story.link || '')
    ? `<a href="${escapeHtml(story.link)}" rel="noopener nofollow" target="_blank">${escapeHtml(story.title)}</a>`
    : escapeHtml(story.title);
  const analysis = story.analysis ? `<p>${escapeHtml(story.analysis)}</p>` : '';
  return `<li><h3>${title}</h3><span class="source">${escapeHtml(story.source)}</span>${analysis}</li>`;
}

function sectorCalls(sectors = []) {
  if (sectors.length === 0) return '';
  const rows = sectors.map((s) => `<tr><th scope="row">${escapeHtml(s.name)}</th><td><span class="call ${escapeHtml(s.call)}">${escapeHtml(s.call)}</span></td><td>${escapeHtml(s.reason)}</td></tr>`).join('');
  return `<h3 class="sub">Sector calls</h3><table class="calls"><thead><tr><th scope="col">Sector</th><th scope="col">Call</th><th scope="col">Why</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function boardDetails(board) {
  if (!board?.takes?.length) return '';
  const items = board.takes.map((t) =>
    `<li><strong>${escapeHtml(t.persona)}</strong>: ${escapeHtml(t.stance)}, conviction ${t.conviction}/5. ${escapeHtml(t.points.join(' '))}</li>`).join('');
  return `<details><summary>How the analyst board voted</summary><ul class="board">${items}</ul></details>`;
}

function viewSection(view, board) {
  const consensus = board?.consensus;
  const badge = consensus
    ? `<p class="stance"><span class="badge">${escapeHtml(consensus.stance)}</span> Analyst board ${escapeHtml(consensus.agreement)} (${consensus.voters} of 3 views)</p>`
    : '';
  if (!badge && !view) return '';
  const risks = view?.risks?.length ? `<h3 class="sub">What would change our view</h3>${paragraphs(view.risks)}` : '';
  return section('Our view', `${badge}${paragraphs(view?.thesis)}${sectorCalls(view?.sectors)}${risks}${boardDetails(board)}`);
}

/** The article body (everything below the header); also stored as the edition's content. */
export function renderEditionBody({ markets, headlines, text, board, histories = [], period = PERIODS.session }) {
  const stories = text?.news?.length ? text.news : headlines.slice(0, 8);
  const missing = text ? '' : '<p class="note">Commentary is unavailable for this edition; prices and headlines are live.</p>';
  return [
    missing,
    section('Markets', `${marketCharts(markets, histories, period)}${marketTables(markets, period)}`),
    section('What happened', whatHappened(text)),
    section('News that matters', stories.length ? `<ol class="stories">${stories.map(storyItem).join('')}</ol>` : ''),
    viewSection(text?.view || null, board),
    section('What to watch', bullets(text?.view?.watch)),
  ].join('\n');
}

const STYLES = `
:root{--bg:#f7f4ee;--ink:#1d1b18;--ink-2:#4a463f;--ink-3:#77716a;--rule:#ddd6c8;--accent:#9a2a1f;--pos:#2a78d6;--neg:#c4452c;--axis:#77716a;--grid:#e6e0d4;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#151412;--ink:#eeeae2;--ink-2:#c4beb3;--ink-3:#948d82;--rule:#36322c;--accent:#e0806f;--pos:#3987e5;--neg:#e0634a;--axis:#948d82;--grid:#2a2723}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 4rem}a{color:var(--accent)}
.home{font-size:.9rem;text-decoration:none}.kicker{margin:2rem 0 .25rem;color:var(--accent);font-size:.75rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
h1,h2,h3{font-family:Georgia,"Times New Roman",serif;line-height:1.25}h1{font-size:2rem;margin:.25rem 0 1rem}
h2{font-size:1.35rem;margin:2.5rem 0 1rem;padding-top:1rem;border-top:2px solid var(--ink)}h3{font-size:1.05rem;margin:0}
.lede{font-size:1.15rem;color:var(--ink-2)}.note{padding:.75rem 1rem;border-left:3px solid var(--accent);color:var(--ink-2)}
.quotes{width:100%;border-collapse:collapse;margin:0 0 1.5rem;font-variant-numeric:tabular-nums;font-size:.95rem}
.quotes caption{text-align:left;font-weight:700;padding:.25rem 0;color:var(--ink-2)}
.quotes th,.quotes td{padding:.4rem .5rem;border-bottom:1px solid var(--rule);text-align:right}.quotes th[scope=row],.quotes thead th:first-child{text-align:left;font-weight:500}
.quotes thead th{font-size:.75rem;color:var(--ink-3);font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.asof{font-weight:400;font-size:.8rem;color:var(--ink-3)}.up{color:var(--pos)}.down{color:var(--neg)}.na{color:var(--ink-3)}
.stories{padding-left:1.25rem}.stories li{margin-bottom:1.25rem}.source{font-size:.8rem;color:var(--ink-3)}.stories p{margin:.25rem 0 0}
.badge{display:inline-block;padding:.1rem .6rem;border-radius:999px;background:var(--ink);color:var(--bg);font-weight:700;text-transform:capitalize;margin-right:.5rem}
.stance{color:var(--ink-2)}details{margin-top:1rem;color:var(--ink-2)}summary{cursor:pointer}.board li{margin:.5rem 0}
h3.sub{font-size:1.1rem;margin:1.75rem 0 .5rem}
.calls{width:100%;border-collapse:collapse;font-size:.92rem;margin:.5rem 0 1rem}.calls th,.calls td{padding:.5rem;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}
.calls thead th{font-size:.75rem;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}.call{font-weight:700;text-transform:capitalize;white-space:nowrap}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--rule);font-size:.8rem;color:var(--ink-3)}
@media (max-width:30rem){h1{font-size:1.6rem}.quotes{font-size:.85rem}.quotes th,.quotes td{padding:.35rem .3rem}}`;

/** Full HTML page for an edition. */
export function renderEditionPage({ edition, title, summary, timeLabel, body, canonicalUrl }) {
  const pageTitle = `${title} — ${edition.label}`;
  const canonical = canonicalUrl ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(summary)}">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(summary)}">
${canonical}
<style>${STYLES}${CHART_STYLES}</style>
</head>
<body>
<main>
<a class="home" href="/">← BlogsPro</a>
<p class="kicker">${escapeHtml(edition.label)} · ${escapeHtml(timeLabel)}</p>
<h1>${escapeHtml(title)}</h1>
${summary ? `<p class="lede">${escapeHtml(summary)}</p>` : ''}
${SHARE_BUTTON}
<article>
${body}
</article>
<footer>Prices from Yahoo Finance and may be delayed. Headlines link to their publishers. Times are IST. This briefing is for information only and is not investment advice.</footer>
</main>
</body>
</html>`;
}
