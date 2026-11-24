/**
 * Site page tests: the weekly review's site-design template (scripts/lib/market-edition/site-page.js).
 * Covers the site chrome, escaping of model-written text, share links, the brand-free article body, and that
 * only pieces whose definition asks for the site layout get it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, renderSitePage } from '../scripts/lib/market-edition/site-page.js';
import { EDITIONS, getEdition } from '../scripts/lib/market-edition/editions.js';

const NOW = new Date('2026-11-22T01:00:00Z');
const BASE = Object.freeze({
  edition: { id: 'weekly', label: 'Weekly review' },
  title: 'Banks led a five-session rally',
  summary: 'Nifty rose 2% over the week.',
  timeLabel: '22 Nov 2026, 06:30 IST',
  body: '<section><h2>Markets</h2><p>Body text.</p></section>',
  canonicalUrl: 'https://blogspro.in/articles/weekly/swarm-weekly-1.html',
  now: NOW,
});

const articleOf = (page) => page.slice(page.indexOf('<article'), page.indexOf('</article>'));

test('renders the site masthead, section nav and footer from the site config', () => {
  const page = renderSitePage(BASE);
  assert.match(page, /<header class="masthead">/);
  for (const item of SITE.nav) assert.ok(page.includes(`<a href="${item.href}">${item.label}</a>`), item.label);
  assert.match(page, /<a href="\/sitemap.xml">Sitemap<\/a>/);
  assert.match(page, /© 2026 BlogsPro\. Analysis, not investment advice\./);
  assert.match(page, /family=Newsreader/);
  assert.match(page, /--paper:#f7f4ee/);
});

test('title block follows the site article layout', () => {
  const page = renderSitePage(BASE);
  assert.match(page, /<a class="kicker" href="\/#research">Weekly review<\/a>/);
  assert.match(page, /<h1>Banks led a five-session rally<\/h1>/);
  assert.match(page, /<p class="standfirst">Nifty rose 2% over the week\.<\/p>/);
  assert.match(page, /<strong>Markets desk<\/strong><span class="when"> · 22 Nov 2026, 06:30 IST<\/span>/);
  assert.match(page, /<title>Banks led a five-session rally — BlogsPro<\/title>/);
});

test('model-written title and summary are escaped everywhere they appear', () => {
  const page = renderSitePage({ ...BASE, title: '<script>alert(1)</script> & "q"', summary: '<img src=x onerror=alert(1)>' });
  assert.ok(!page.includes('<script>alert(1)'), 'raw script tag');
  assert.ok(!page.includes('<img src=x'), 'raw img tag');
  assert.match(page, /<h1>&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;q&quot;<\/h1>/);
});

test('share links carry the encoded canonical URL and title, and are omitted without a URL', () => {
  const page = renderSitePage({ ...BASE, title: 'Rates & "rupee"' });
  assert.match(page, /<link rel="canonical" href="https:\/\/blogspro.in\/articles\/weekly\/swarm-weekly-1.html">/);
  assert.ok(page.includes('text=Rates%20%26%20%22rupee%22&amp;url=https%3A%2F%2Fblogspro.in%2Farticles%2Fweekly%2Fswarm-weekly-1.html'));
  assert.ok(page.includes('linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fblogspro.in'));
  const bare = renderSitePage({ ...BASE, canonicalUrl: undefined });
  assert.ok(!bare.includes('rel="canonical"'));
  assert.ok(!bare.includes('twitter.com'));
  assert.match(bare, /bp-share-btn/);
});

test('the publication name stays in the chrome, never inside the article', () => {
  assert.ok(!articleOf(renderSitePage(BASE)).includes(SITE.name));
});

test('no summary means no standfirst', () => {
  assert.ok(!renderSitePage({ ...BASE, summary: '' }).includes('class="standfirst"'));
});

test('only the weekly review asks for the site layout', () => {
  assert.equal(getEdition('weekly').layout, 'site');
  assert.equal(getEdition('daily').layout, undefined);
  assert.ok(EDITIONS.every((e) => e.layout === undefined));
});
