/**
 * sync-articles.mjs — saves every published post from the BlogsPro API to
 * frontend/src/data/posts-snapshot.json so the static site carries the full text
 * (merged by frontend/src/lib/articleContent.ts) and survives API outages.
 *
 * Usage: node scripts/sync-articles.mjs   (BLOGSPRO_API_URL overrides https://blogspro.in)
 * Cost: one request to the public posts endpoint.
 * Safety: on any error, or zero posts, the existing snapshot is left untouched.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toPost } from './build-static.js';
import { listPublicDocuments } from './lib/vps-store.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(ROOT, 'frontend/src/data/posts-snapshot.json');
const ARCHIVE_PATH = path.join(ROOT, 'frontend/src/data/articles.ts');

async function fetchPublishedPosts() {
  const docs = await listPublicDocuments('posts');
  if (docs === null) throw new Error('Could not read posts from the BlogsPro API (/api/public/data/posts).');
  return docs.map(toPost).filter(post => post.published);
}

function archiveSlugs() {
  return [...fs.readFileSync(ARCHIVE_PATH, 'utf8').matchAll(/"slug":\s*"([^"]+)"/g)].map(m => m[1]);
}

async function main() {
  const posts = await fetchPublishedPosts();
  if (posts.length === 0) {
    console.error('The API returned no published posts; snapshot left unchanged.');
    process.exit(1);
  }

  const snapshot = posts
    .map(({ docId, slug, title, content }) => ({ docId, slug, title, content }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

  const bySlug = new Set(snapshot.flatMap(p => [p.slug, p.docId]));
  const missing = archiveSlugs().filter(slug => !bySlug.has(slug));
  console.log(`Saved ${snapshot.length} published post(s) to ${path.relative(ROOT, SNAPSHOT_PATH)}.`);
  console.log(missing.length ? `No API match for ${missing.length} archive article(s):\n  ${missing.join('\n  ')}` : 'Every archive article has an API match.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
