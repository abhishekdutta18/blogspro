/**
 * build-static.js — renders every published post (BlogsPro API) to <site>/p/<slug>.html.
 *
 * Pages are built from <site>/post-template.html, which the Astro frontend emits
 * (frontend/src/pages/post-template.astro), so pipeline pages share the site design.
 *
 * Safety rules:
 *  - Never overwrites a page this script did not generate (the Astro-built
 *    archive pages). Generated pages carry <meta name="generator" content="blogspro-ssg">.
 *  - All text fields are HTML-escaped; JSON-LD is serialized with JSON.stringify.
 *  - If the template is missing, nothing is written and the script exits non-zero.
 *
 * Env: BP_SITE_DIR overrides the site root (default: the folder above scripts/).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listPublicDocuments } from './lib/vps-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_URL = 'https://blogspro.in';
const GENERATOR_MARKER = 'content="blogspro-ssg"';
const DEFAULT_IMAGE = `${SITE_URL}/og-default.jpg`;

/** Escapes text for HTML element content and quoted attributes. */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Same slug rule the previous generator used, so existing URLs keep working. */
export function slugify(title, fallback) {
  const slug = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return slug || fallback;
}

/** True when it is safe to (re)write `existingHtml` — i.e. no file yet, or one we generated. */
export function canOverwrite(existingHtml) {
  return existingHtml === null || existingHtml.includes(GENERATOR_MARKER);
}

/** Formats an ISO timestamp like the Astro archive ("Oct 24, 2026"). */
export function formatDate(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(time);
}

/** Converts a BlogsPro API post document into the fields the template needs. */
export function toPost(doc) {
  const docId = String(doc.id);
  const title = doc.title || 'Untitled';
  return {
    docId,
    title,
    slug: slugify(title, docId),
    excerpt: doc.excerpt || '',
    content: doc.content || '',
    category: doc.category || 'Research',
    author: doc.authorName || 'BlogsPro Research Desk',
    image: doc.coverImage || DEFAULT_IMAGE,
    publishedIso: doc.createdAt || doc.publishedAt || new Date().toISOString(),
    published: doc.published === true
  };
}

/** Fills the Astro post template for one post. Pure: returns the page HTML. */
export function renderPost(template, post) {
  const url = `${SITE_URL}/p/${post.slug}.html`;
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: post.image,
    author: { '@type': 'Person', name: post.author },
    publisher: { '@type': 'Organization', name: 'BlogsPro', url: SITE_URL },
    datePublished: post.publishedIso,
    url
  }).replace(/</g, '\\u003c');

  const tokens = {
    __BP_TITLE_URI__: encodeURIComponent(post.title),
    __BP_URL_URI__: encodeURIComponent(url),
    __BP_TITLE__: escapeHtml(post.title),
    __BP_EXCERPT__: escapeHtml(post.excerpt),
    __BP_CATEGORY__: escapeHtml(post.category),
    __BP_AUTHOR__: escapeHtml(post.author),
    __BP_DATE__: escapeHtml(formatDate(post.publishedIso)),
    __BP_URL__: escapeHtml(url),
    __BP_IMAGE__: escapeHtml(post.image),
    __BP_JSONLD__: `<script type="application/ld+json">${jsonLd}</script>`,
    __BP_CONTENT__: post.content
  };

  // Content goes last so tokens that happen to appear inside article text are left alone.
  let html = template.replace(/<meta[^>]*data-template-only[^>]*>/g, '');
  for (const [token, value] of Object.entries(tokens)) {
    if (token === '__BP_CONTENT__') continue;
    html = html.split(token).join(value);
  }
  return html.split('__BP_CONTENT__').join(tokens.__BP_CONTENT__);
}

async function fetchPublishedDocs() {
  const docs = await listPublicDocuments('posts');
  if (docs === null) throw new Error('Failed to fetch posts from the BlogsPro API.');
  return docs;
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
}

async function buildStaticPosts() {
  const siteDir = process.env.BP_SITE_DIR || path.join(__dirname, '..');
  const outDir = path.join(siteDir, 'p');
  const templatePath = path.join(siteDir, 'post-template.html');

  const template = readIfExists(templatePath);
  if (!template) {
    console.error(`SSG: template not found at ${templatePath}; deploy the frontend build first. Nothing written.`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Fetching posts from the BlogsPro API...');
  const posts = (await fetchPublishedDocs()).map(toPost).filter(post => post.published);
  if (posts.length === 0) {
    console.log('No published posts found.');
    return;
  }

  let written = 0;
  let skipped = 0;
  for (const post of posts) {
    const outPath = path.join(outDir, `${post.slug}.html`);
    if (!canOverwrite(readIfExists(outPath))) {
      skipped += 1;
      console.log(`- Skipped p/${post.slug}.html (built by the frontend, not by this script)`);
      continue;
    }
    fs.writeFileSync(outPath, renderPost(template, post));
    written += 1;
    console.log(`✓ Generated: p/${post.slug}.html`);
  }
  console.log(`\nBuilt ${written} page(s), left ${skipped} frontend page(s) untouched.`);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  buildStaticPosts().catch(err => {
    console.error('SSG Error:', err);
    process.exit(1);
  });
}
