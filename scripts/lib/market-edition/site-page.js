/**
 * Site page — renders an edition-pipeline piece (the weekly review) in the live site's own design, so the page
 * reads as part of blogspro.in rather than a standalone briefing. It mirrors the Astro front end on main:
 *   - colour tokens and article type from frontend/src/styles/global.css (light default, dark via the OS);
 *   - masthead and section nav from components/Header.astro, footer from components/Footer.astro;
 *   - title block and byline from components/ArticleView.astro.
 * SITE below copies frontend/src/data/siteConfig.ts (name, tagline, description, nav); keep the two in sync.
 *
 * The page stays self-contained (inline CSS, SVG charts, no inline script) apart from the site's fonts and
 * share-button assets. Every value is escaped; `body` is the already-escaped output of renderEditionBody.
 * The publication name appears only in the site chrome (masthead, footer), never inside <article>.
 */

import { CHART_STYLES } from './charts.js';
import { escapeHtml } from './edition-template.js';
import { SHARE_BUTTON } from '../share-button.js';

export const SITE = Object.freeze({
  name: 'BlogsPro',
  tagline: 'Fintech · Compliance · Strategy',
  description: 'Sharp analysis on financial technology, regulatory compliance, and market growth strategy for institutional practitioners and operators.',
  nav: Object.freeze([
    Object.freeze({ label: 'Research', href: '/#research' }),
    Object.freeze({ label: 'Policy calendar', href: '/#policy' }),
    Object.freeze({ label: 'Markets', href: '/#markets' }),
    Object.freeze({ label: 'About', href: '/about.html' }),
  ]),
});

const FONTS = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap';
const BYLINE = 'Markets desk';
const SOURCES_NOTE = 'Prices from Yahoo Finance and may be delayed. Headlines link to their publishers. Times are IST.';

// Tokens are global.css verbatim; the second block maps the edition body's names (--bg, --pos, ...) onto them.
const STYLES = `
:root{color-scheme:light;--paper:#f7f4ee;--sunk:#efebe3;--ink:#1b1a17;--ink-2:#47443e;--ink-3:#6b675f;--rule:#ddd7cb;--rule-strong:#1b1a17;--accent:#8c1d18;--up:#1d6b45;--down:#b42318}
@media (prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#151412;--sunk:#1d1b18;--ink:#ece8e0;--ink-2:#bdb7ab;--ink-3:#8f897e;--rule:#34312c;--rule-strong:#ece8e0;--accent:#e8836f;--up:#5cc493;--down:#f08a78}}
:root{--bg:var(--paper);--pos:var(--up);--neg:var(--down);--axis:var(--ink-3);--grid:var(--rule);--serif:Newsreader,Georgia,Cambria,serif;--sans:"IBM Plex Sans",system-ui,-apple-system,sans-serif}
*,*::before,*::after{box-sizing:border-box}
html{background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;background:var(--paper);font-family:var(--sans);font-feature-settings:'kern','liga';line-height:1.5}
::selection{background:var(--accent);color:var(--paper)}*:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
a{color:inherit}.wrap{width:100%;max-width:72rem;margin:0 auto;padding:0 1rem}
.skip{position:absolute;left:-999px}.skip:focus{left:.5rem;top:.5rem;background:var(--paper);padding:.5rem .75rem}
.masthead{border-bottom:1px solid var(--rule)}.mast-row{display:flex;align-items:flex-end;justify-content:space-between;gap:1.5rem;padding:1.5rem 0 1rem}
.wordmark{text-decoration:none}.wordmark b{display:block;font:600 2rem/1 var(--serif);letter-spacing:-.025em}
.wordmark small{display:block;margin-top:.375rem;font-size:.75rem;color:var(--ink-3);letter-spacing:.025em}
.mast-links{display:flex;gap:1.25rem;font-size:.875rem;flex-shrink:0}.mast-links a{text-decoration:none;text-underline-offset:4px;color:var(--ink-2)}
.mast-links a:hover{text-decoration:underline;color:var(--ink)}.mast-links .sub{color:var(--accent);font-weight:500}
.sections{border-top:1px solid var(--rule);overflow-x:auto;margin:0 -1rem}.sections ul{display:flex;gap:1.5rem;margin:0;padding:.625rem 1rem;list-style:none;font-size:.875rem;color:var(--ink-2);white-space:nowrap}
.sections a,.site-foot a{text-decoration:none;text-underline-offset:4px}.sections a:hover,.site-foot a:hover{text-decoration:underline;color:var(--ink)}
main{flex:1}.piece{padding:2.5rem 0}.piece-head{max-width:46rem;margin:0 auto}
.kicker{font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.14em;color:var(--accent);text-decoration:none;text-underline-offset:4px}.kicker:hover{text-decoration:underline}
h1{margin:.75rem 0 0;font:600 2.2rem/1.08 var(--serif);letter-spacing:-.025em;text-wrap:balance}
.standfirst{margin:1.25rem 0 0;font:400 1.25rem/1.375 var(--serif);color:var(--ink-2)}
.byline{margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--rule);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem;font-size:.875rem}
.byline p{margin:0;color:var(--ink-2)}.byline strong{color:var(--ink);font-weight:500}.byline .when{color:var(--ink-3)}
.share{display:flex;align-items:center;gap:1rem;color:var(--ink-3)}.share a{text-decoration:none;text-underline-offset:4px}.share a:hover{color:var(--ink);text-decoration:underline}.share .bp-share{margin:0}
.prose-article{max-width:68ch;margin:2.5rem auto 0;font-family:var(--serif);font-size:1.1875rem;line-height:1.7;color:var(--ink)}
.prose-article p{margin:1.15em 0 0}.prose-article a{color:var(--accent);text-decoration:underline;text-underline-offset:3px;overflow-wrap:anywhere}
.prose-article section{margin-top:3rem}.prose-article section:first-child{margin-top:0}
.prose-article h2{margin:0 0 1.5rem;padding-top:.75rem;border-top:2px solid var(--rule-strong);font:600 1.6rem/1.25 var(--serif);letter-spacing:-.01em}
.prose-article h3{font:600 1.25rem/1.3 var(--serif);margin:0}.prose-article h3.sub{margin:1.6em 0 .25em}
.prose-article ul,.prose-article ol{padding-left:1.4em}.prose-article li+li{margin-top:.4em}
.prose-article .stories li{margin-bottom:1.25rem}.prose-article .stories p{margin-top:.25rem}
.prose-article .source,.prose-article .stance,.prose-article .charts,.prose-article table,.prose-article details{font-family:var(--sans)}
.source{font-size:.8rem;color:var(--ink-3)}.note{padding:.75rem 1rem;border-left:3px solid var(--accent);color:var(--ink-2)}
.quotes,.calls{width:100%;border-collapse:collapse;font-size:.92rem;font-variant-numeric:tabular-nums;margin:0 0 1.75rem}
.quotes caption{text-align:left;font-weight:600;padding:.25rem 0 .4rem;color:var(--ink)}.asof{font-weight:400;font-size:.8rem;color:var(--ink-3)}
.quotes th,.quotes td{padding:.45rem .5rem;border-bottom:1px solid var(--rule);text-align:right}.quotes th[scope=row],.quotes thead th:first-child{text-align:left;font-weight:500}
.quotes thead th,.calls thead th{font-size:.7rem;font-weight:600;color:var(--ink-3);text-transform:uppercase;letter-spacing:.1em;border-bottom:1px solid var(--rule-strong)}
.calls th,.calls td{padding:.5rem;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}.call{font-weight:600;text-transform:capitalize;white-space:nowrap}
.up{color:var(--up)}.down{color:var(--down)}.flat,.na{color:var(--ink-3)}
.stance{color:var(--ink-2);font-size:.95rem}.badge{display:inline-block;padding:.1rem .6rem;border-radius:999px;background:var(--ink);color:var(--paper);font-weight:600;text-transform:capitalize;margin-right:.5rem}
details{margin-top:1rem;color:var(--ink-2);font-size:.95rem}summary{cursor:pointer}.board li{margin:.5rem 0}
.site-foot{margin-top:5rem;border-top:1px solid var(--rule);font-size:.875rem}.foot-grid{display:grid;gap:2rem;padding:2.5rem 0}
.foot-name{font:600 1.25rem/1.2 var(--serif)}.foot-grid p{margin:.5rem 0 0;max-width:28rem;color:var(--ink-2);line-height:1.6}
.foot-grid ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;color:var(--ink-2)}
.fine{padding-bottom:2rem;font-size:.75rem;color:var(--ink-3)}.fine p{margin:.25rem 0 0}
@media (min-width:40rem){.wrap{padding:0 1.5rem}.sections{margin:0}.sections ul{padding:.625rem 0}.wordmark b{font-size:2.4rem}
h1{font-size:3rem}.standfirst{font-size:1.4rem}.piece{padding:3.5rem 0}.foot-grid{grid-template-columns:1fr auto}.foot-grid ul{flex-direction:column}}
@media (max-width:40rem){.calls thead{display:none}.calls tr{display:grid;grid-template-columns:1fr auto;gap:.25rem .75rem;padding:.75rem 0;border-bottom:1px solid var(--rule)}
.calls th,.calls td{padding:0;border:0}.calls td:last-child{grid-column:1/-1;color:var(--ink-2)}}
@media (max-width:30rem){.mast-links{gap:.875rem}.quotes{font-size:.82rem}.quotes th,.quotes td{padding:.35rem .25rem}}
@media print{.sections,.mast-links,.share,.skip,.foot-grid ul{display:none}.piece{padding-top:1rem}.prose-article{max-width:none}
section,figure,table,.stories li{break-inside:avoid}}`;

const navItems = (extra = []) => [...SITE.nav, ...extra]
  .map((item) => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`).join('');

function masthead() {
  return `<header class="masthead"><div class="wrap">
<div class="mast-row"><a class="wordmark" href="/" aria-label="${escapeHtml(SITE.name)} home"><b>${escapeHtml(SITE.name)}</b><small>${escapeHtml(SITE.tagline)}</small></a>
<div class="mast-links"><a href="/login.html">Sign in</a><a class="sub" href="/#newsletter">Subscribe</a></div></div>
<nav class="sections" aria-label="Sections"><ul>${navItems()}</ul></nav>
</div></header>`;
}

function shareLinks(title, canonicalUrl) {
  if (!canonicalUrl) return `<div class="share">${SHARE_BUTTON}</div>`;
  const url = encodeURIComponent(canonicalUrl);
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${url}`;
  const linkedin = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
  return `<div class="share">${SHARE_BUTTON}` +
    `<a href="${escapeHtml(x)}" target="_blank" rel="noopener noreferrer">X</a>` +
    `<a href="${escapeHtml(linkedin)}" target="_blank" rel="noopener noreferrer">LinkedIn</a></div>`;
}

function siteFooter(year) {
  return `<footer class="site-foot"><div class="wrap">
<div class="foot-grid"><div><div class="foot-name">${escapeHtml(SITE.name)}</div><p>${escapeHtml(SITE.description)}</p></div>
<ul>${navItems([{ label: 'Sitemap', href: '/sitemap.xml' }])}</ul></div>
<div class="fine"><p>${escapeHtml(SOURCES_NOTE)}</p><p>© ${year} ${escapeHtml(SITE.name)}. Analysis, not investment advice.</p></div>
</div></footer>`;
}

/** Full HTML page for an edition-pipeline piece, in the site's design. Same inputs as renderEditionPage. */
export function renderSitePage({ edition, title, summary, timeLabel, body, canonicalUrl, now = new Date() }) {
  const pageTitle = `${title} — ${SITE.name}`;
  const canonical = canonicalUrl
    ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">\n<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f7f4ee" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#151412" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(pageTitle)}</title>
<meta name="description" content="${escapeHtml(summary)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${escapeHtml(SITE.name)}">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(summary)}">
${canonical}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>${STYLES}${CHART_STYLES}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${masthead()}
<main id="main"><div class="wrap">
<div class="piece">
<header class="piece-head">
<a class="kicker" href="/#research">${escapeHtml(edition.label)}</a>
<h1>${escapeHtml(title)}</h1>
${summary ? `<p class="standfirst">${escapeHtml(summary)}</p>` : ''}
<div class="byline"><p><strong>${BYLINE}</strong><span class="when"> · ${escapeHtml(timeLabel)}</span></p>${shareLinks(title, canonicalUrl)}</div>
</header>
<article class="prose-article">
${body}
</article>
</div>
</div></main>
${siteFooter(now.getFullYear())}
</body>
</html>`;
}
