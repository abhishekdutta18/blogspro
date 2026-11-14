/**
 * sync-articles-from-firestore.mjs — saves every published Firestore post to
 * frontend/src/data/firestore-posts.json so the static site carries the full text
 * (merged by frontend/src/lib/articleContent.ts) and survives Firestore outages.
 *
 * Usage: node scripts/sync-articles-from-firestore.mjs
 * Cost: one Firestore read per published post.
 * Safety: on any error, or zero posts, the existing snapshot is left untouched.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { toPost } from './build-static.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(ROOT, 'frontend/src/data/firestore-posts.json');
const ARCHIVE_PATH = path.join(ROOT, 'frontend/src/data/articles.ts');
const QUERY_URL = 'https://firestore.googleapis.com/v1/projects/blogspro-ai/databases/(default)/documents:runQuery';

async function fetchPublishedPosts() {
  const res = await fetch(QUERY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'posts' }],
        where: { fieldFilter: { field: { fieldPath: 'published' }, op: 'EQUAL', value: { booleanValue: true } } }
      }
    })
  });
  const body = await res.json().catch(() => null);
  const rows = Array.isArray(body) ? body : [];
  const error = (!res.ok && (body?.error || rows[0]?.error)) || rows.find(row => row.error)?.error;
  if (error || !res.ok) {
    const hint = (error?.code ?? res.status) === 429
      ? ' Firestore quota is exhausted (billing is disabled on blogspro-ai). Re-enable billing or retry after the daily reset (midnight US Pacific).'
      : '';
    throw new Error(`Firestore query failed: ${error?.code ?? res.status} ${(error?.message ?? '').replace(/\.$/, '')}.${hint}`);
  }
  return rows.filter(row => row.document).map(row => toPost(row.document));
}

function archiveSlugs() {
  return [...fs.readFileSync(ARCHIVE_PATH, 'utf8').matchAll(/"slug":\s*"([^"]+)"/g)].map(m => m[1]);
}

async function main() {
  const posts = await fetchPublishedPosts();
  if (posts.length === 0) {
    console.error('Firestore returned no published posts; snapshot left unchanged.');
    process.exit(1);
  }

  const snapshot = posts
    .map(({ docId, slug, title, content }) => ({ docId, slug, title, content }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);

  const bySlug = new Set(snapshot.flatMap(p => [p.slug, p.docId]));
  const missing = archiveSlugs().filter(slug => !bySlug.has(slug));
  console.log(`Saved ${snapshot.length} published post(s) to ${path.relative(ROOT, SNAPSHOT_PATH)}.`);
  console.log(missing.length ? `No Firestore match for ${missing.length} archive article(s):\n  ${missing.join('\n  ')}` : 'Every archive article has a Firestore match.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
