/**
 * articleContent — merges full article text exported from Firestore
 * (src/data/firestore-posts.json, written by scripts/sync-articles-from-firestore.mjs)
 * into the curated archive, and derives honest read times from the real text.
 */

/** One published Firestore post, as saved by the sync script. */
export interface PostSnapshot {
  docId: string;
  slug: string;
  title: string;
  content: string;
}

interface HasSlugAndContent {
  slug: string;
  content: string;
}

const WORDS_PER_MINUTE = 220;

/** Visible words in an HTML fragment. */
export function countWords(html: string): number {
  const text = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
  return text.split(/\s+/).filter(Boolean).length;
}

/** "N min read" from the text itself, never less than 1. */
export function readTimeFor(html: string): string {
  const minutes = Math.max(1, Math.round(countWords(html) / WORDS_PER_MINUTE));
  return `${minutes} min read`;
}

/**
 * Returns the article with the snapshot's text when the snapshot has a post with the
 * same slug (or doc id) and more words than the current text. The curated title,
 * excerpt and metadata are kept; read time is always recomputed.
 */
export function withFullText<T extends HasSlugAndContent>(article: T, snapshot: readonly PostSnapshot[]): T & { readTime: string } {
  const post = snapshot.find(p => p.slug === article.slug || p.docId === article.slug);
  const content = post && countWords(post.content) > countWords(article.content) ? post.content : article.content;
  return { ...article, content, readTime: readTimeFor(content) };
}
