/**
 * Market edition pipeline — replaces the hourly swarm with three daily editions (08:00, 16:00, 22:00 IST).
 * Order: live quotes, one-month histories and headlines (no AI), the view board (3 persona calls), then three
 * writer section calls (overview, news, view) for a ~3,500-word edition. About 6 AI calls per edition.
 * If the AI calls fail the edition still publishes prices and headlines, marked as missing commentary;
 * if the data fetches fail too there is nothing true to publish, so it throws.
 */

import { getEdition, resolveEdition } from './editions.js';
import { fetchHistories, fetchMarketSnapshot, snapshotToText } from './market-data.js';
import { fetchHeadlines } from './news-feed.js';
import { runViewBoard } from './view-board.js';
import { headlinesToText, writeEdition } from './edition-writer.js';
import { renderEditionBody, renderEditionPage } from './edition-template.js';

const TIME_LABEL = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
});

export function formatIst(date) {
  return `${TIME_LABEL.format(date).replace(' at ', ', ')} IST`;
}

// Below this the edition is noticeably thin (a section failed or the model under-wrote); logged, still published.
const MIN_EXPECTED_WORDS = 2500;

function countWords(...parts) {
  return parts.flat(Infinity).filter((p) => typeof p === 'string').join(' ').split(/\s+/).filter(Boolean).length;
}

/** Every model-written string in the edition, for the word count. */
function editionText(text) {
  if (!text) return [];
  const view = text.view;
  return [
    text.summary, text.india, text.global, text.macro,
    (text.news || []).map((s) => s.analysis),
    view ? [view.thesis, view.sectors.map((s) => s.reason), view.risks, view.watch] : [],
  ];
}

const sectorNamesFrom = (markets) => markets.find((g) => g.id === 'sectors')?.quotes.filter((q) => q.ok).map((q) => q.name) || [];

/**
 * Builds one edition. `askAI` and `fetchImpl` are injectable for tests.
 * Returns the fields the tome generator publishes, plus `renderPage(canonicalUrl)` for the final HTML.
 */
export async function generateMarketEdition({ askAI, env = process.env, now = new Date(), editionId, fetchImpl = fetch, extraContext = '' }) {
  const edition = (editionId && getEdition(editionId)) || resolveEdition(now);
  const timeLabel = formatIst(now);
  console.log(`🗞️ [Edition] Building ${edition.label} for ${timeLabel}`);

  const [markets, histories, headlines] = await Promise.all([
    fetchMarketSnapshot({ fetchImpl, period: edition.period }), fetchHistories({ fetchImpl }), fetchHeadlines({ fetchImpl }),
  ]);
  const quotesOk = markets.reduce((n, g) => n + g.quotes.filter((q) => q.ok).length, 0);
  console.log(`📈 [Edition] ${quotesOk} quotes, ${headlines.length} headlines`);
  if (quotesOk === 0 && headlines.length === 0) throw new Error('EDITION_NO_DATA: every quote and news feed failed');

  // extraContext (the weekly review's digest of the week's editions) rides with the data every prompt sees.
  const marketText = [snapshotToText(markets, now.getTime(), edition.period), extraContext].filter(Boolean).join('\n\n');
  const board = await runViewBoard({ askAI, env, edition, marketText, headlinesText: headlinesToText(headlines) });
  // writeEdition reports section failures in its result; this catch is for anything unexpected (a prompt bug).
  let written = { text: null, replies: [] };
  try {
    written = await writeEdition({
      askAI, env, edition, dateLabel: timeLabel, marketText, headlines, board, sectorNames: sectorNamesFrom(markets),
    });
  } catch (error) {
    console.warn(`⚠️ [Edition] Publishing without commentary: ${error.message}`);
  }
  const { text } = written;

  const title = text?.title || `${edition.label}: markets at ${timeLabel}`;
  const summary = text?.summary || `Live prices and the latest market headlines for the ${edition.label.toLowerCase()}.`;
  const body = renderEditionBody({ markets, headlines, text, board, histories, period: edition.period });
  const wordCount = countWords(editionText(text));
  if (text && wordCount < MIN_EXPECTED_WORDS) {
    console.warn(`⚠️ [Edition] Only ${wordCount} words (expected ~3,500): news ${text.news ? 'ok' : 'missing'}, view ${text.view ? 'ok' : 'missing'}`);
  }
  return {
    edition: { id: edition.id, label: edition.label },
    title,
    excerpt: summary,
    final: body,
    wordCount,
    hasCommentary: Boolean(text),
    stance: board.consensus?.stance || null,
    // `pdfHref`: link to the page's PDF copy, passed only once that PDF has been written.
    renderPage: (canonicalUrl, { pdfHref } = {}) => renderEditionPage({ edition, title, summary, timeLabel, body, canonicalUrl, pdfHref }),
    // Everything the page was built from, for saveEditionSnapshot: kept off the web root, never published.
    snapshot: { edition: edition.id, timeLabel, text, board, markets, headlines, histories, replies: written.replies },
  };
}
