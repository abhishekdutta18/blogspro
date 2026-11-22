/**
 * Market edition pipeline — replaces the hourly swarm with three daily editions (08:00, 16:00, 22:00 IST).
 * Order: live quotes and headlines (no AI), the view board (3 persona calls), then one writer call.
 * About 4 AI calls per edition, against roughly 30 for the old hourly pulse.
 * If the AI calls fail the edition still publishes prices and headlines, marked as missing commentary;
 * if the data fetches fail too there is nothing true to publish, so it throws.
 */

import { getEdition, resolveEdition } from './editions.js';
import { fetchMarketSnapshot, snapshotToText } from './market-data.js';
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

function countWords(...parts) {
  return parts.flat().join(' ').split(/\s+/).filter(Boolean).length;
}

/**
 * Builds one edition. `askAI` and `fetchImpl` are injectable for tests.
 * Returns the fields the tome generator publishes, plus `renderPage(canonicalUrl)` for the final HTML.
 */
export async function generateMarketEdition({ askAI, env = process.env, now = new Date(), editionId, fetchImpl = fetch }) {
  const edition = (editionId && getEdition(editionId)) || resolveEdition(now);
  const timeLabel = formatIst(now);
  console.log(`🗞️ [Edition] Building ${edition.label} for ${timeLabel}`);

  const [markets, headlines] = await Promise.all([fetchMarketSnapshot({ fetchImpl }), fetchHeadlines({ fetchImpl })]);
  const quotesOk = markets.reduce((n, g) => n + g.quotes.filter((q) => q.ok).length, 0);
  console.log(`📈 [Edition] ${quotesOk} quotes, ${headlines.length} headlines`);
  if (quotesOk === 0 && headlines.length === 0) throw new Error('EDITION_NO_DATA: every quote and news feed failed');

  const marketText = snapshotToText(markets, now.getTime());
  const board = await runViewBoard({ askAI, env, edition, marketText, headlinesText: headlinesToText(headlines) });
  let text = null;
  try {
    text = await writeEdition({ askAI, env, edition, dateLabel: timeLabel, marketText, headlines, board });
  } catch (error) {
    console.warn(`⚠️ [Edition] Publishing without commentary: ${error.message}`);
  }

  const title = text?.title || `${edition.label}: markets at ${timeLabel}`;
  const summary = text?.summary || `Live prices and the latest market headlines for the ${edition.label.toLowerCase()}.`;
  const body = renderEditionBody({ markets, headlines, text, board });
  return {
    edition: { id: edition.id, label: edition.label },
    title,
    excerpt: summary,
    final: body,
    wordCount: countWords(summary, text?.market || [], text?.view || []),
    hasCommentary: Boolean(text),
    stance: board.consensus?.stance || null,
    renderPage: (canonicalUrl) => renderEditionPage({ edition, title, summary, timeLabel, body, canonicalUrl }),
  };
}
