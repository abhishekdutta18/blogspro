/**
 * Share button markup for generated article pages, plus a helper that adds it to pages already published.
 * The behaviour lives in /js/share-button.js and the look in /css/share-button.css (both deployed with the
 * site): no inline script or style, so a future Content-Security-Policy only needs to allow the site's own
 * files. Nothing is interpolated, so the snippet carries no page data and needs no escaping.
 */

// Bump when js/share-button.js or css/share-button.css changes, so cached copies are refetched.
const ASSET_VERSION = 1;

/** The share button snippet; place it once per page, under the title and standfirst. */
export const SHARE_BUTTON = `<div class="bp-share"><button type="button" class="bp-share-btn" hidden>Share link</button><span class="bp-share-status" role="status" aria-live="polite"></span></div>
<link rel="stylesheet" href="/css/share-button.css?v=${ASSET_VERSION}">
<script src="/js/share-button.js?v=${ASSET_VERSION}" defer></script>`;

// Pages that already have share controls: this button, or the Astro post layout's own "Copy link" bar.
const ALREADY_SHAREABLE = Object.freeze(['bp-share-btn', 'id="copyLinkBtn"']);

// The standfirst each template puts right under its title: edition lede, briefing abstract, manuscript excerpt.
const STANDFIRST = /^\s*<(p|div) class="(?:lede|abstract|excerpt)">[\s\S]*?<\/\1>/;

/**
 * `html` with the share button added once: after the standfirst that follows the first <h1>, else at the end
 * of the header that holds the <h1>, else right after the <h1>. Pages that already have it (or the Astro post
 * layout's own share bar), or have no <h1>, come back unchanged, so running it twice is safe.
 */
export function insertShareButton(html) {
  if (ALREADY_SHAREABLE.some((marker) => html.includes(marker))) return html;
  const h1Start = html.indexOf('<h1');
  const h1End = html.indexOf('</h1>', h1Start);
  if (h1Start === -1 || h1End === -1) return html;
  const afterTitle = h1End + '</h1>'.length;

  const standfirst = html.slice(afterTitle).match(STANDFIRST);
  if (standfirst) return splice(html, afterTitle + standfirst[0].length);

  const headerOpen = html.lastIndexOf('<header', h1Start);
  const headerClose = html.indexOf('</header>', afterTitle);
  const titleInHeader = headerOpen !== -1 && html.lastIndexOf('</header>', h1Start) < headerOpen;
  if (titleInHeader && headerClose !== -1) return splice(html, headerClose);

  return splice(html, afterTitle);
}

function splice(html, at) {
  return `${html.slice(0, at)}${SHARE_BUTTON}${html.slice(at)}`;
}
