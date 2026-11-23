/**
 * Adds the share-link button to article pages that were published before it existed.
 * Usage: node scripts/add-share-button.js [--dry-run] <dir> [<dir> ...]
 * Walks each directory (relative to the current working directory) for *.html files, skipping index.html
 * listing pages, and inserts the button once per page (see insertShareButton). Pages that already have it
 * are left alone, so it is safe to re-run. Prints one line per changed page and a summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import { insertShareButton } from './lib/share-button.js';

function htmlFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return htmlFiles(full);
    return entry.name.endsWith('.html') && entry.name !== 'index.html' ? [full] : [];
  });
}

function main(args) {
  const dryRun = args.includes('--dry-run');
  const dirs = args.filter((a) => a !== '--dry-run').map((d) => path.resolve(process.cwd(), d));
  if (dirs.length === 0) {
    console.error('Usage: node scripts/add-share-button.js [--dry-run] <dir> [<dir> ...]');
    process.exit(2);
  }
  const totals = { changed: 0, unchanged: 0 };
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`⚠️ Skipping missing directory ${dir}`);
      continue;
    }
    for (const file of htmlFiles(dir)) {
      const html = fs.readFileSync(file, 'utf8');
      const updated = insertShareButton(html);
      if (updated === html) { totals.unchanged += 1; continue; }
      totals.changed += 1;
      console.log(`${dryRun ? 'would add' : 'added'}: ${path.relative(process.cwd(), file)}`);
      if (!dryRun) fs.writeFileSync(file, updated);
    }
  }
  console.log(`${dryRun ? 'Dry run: ' : ''}${totals.changed} page(s) ${dryRun ? 'to change' : 'changed'}, ${totals.unchanged} unchanged.`);
}

main(process.argv.slice(2));
