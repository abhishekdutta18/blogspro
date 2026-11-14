import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, readTimeFor, withFullText } from '../frontend/src/lib/articleContent.ts';

const words = n => `<p>${Array.from({ length: n }, () => 'word').join(' ')}</p>`;

test('countWords ignores tags, scripts and entities', () => {
  assert.equal(countWords('<h2>Two words</h2><script>var x = 1</script>&nbsp;<p>three more here</p>'), 5);
});

test('readTimeFor rounds at 220 wpm with a 1 minute floor', () => {
  assert.equal(readTimeFor(words(40)), '1 min read');
  assert.equal(readTimeFor(words(2200)), '10 min read');
});

test('withFullText swaps in longer snapshot text matched by slug, keeping curated fields', () => {
  const article = { slug: 'rtgs-explained', title: 'Curated', content: words(150), readTime: '7 min read' };
  const merged = withFullText(article, [{ docId: 'abc', slug: 'rtgs-explained', title: 'Old', content: words(1800) }]);
  assert.equal(merged.title, 'Curated');
  assert.equal(countWords(merged.content), 1800);
  assert.equal(merged.readTime, '8 min read');
  assert.equal(countWords(article.content), 150, 'input not mutated');
});

test('withFullText keeps current text when the snapshot is shorter or missing', () => {
  const article = { slug: 's', content: words(300), readTime: '12 min read' };
  assert.equal(countWords(withFullText(article, [{ docId: 'd', slug: 's', title: '', content: words(10) }]).content), 300);
  assert.equal(withFullText(article, []).readTime, '1 min read');
});

test('withFullText also matches on Firestore doc id', () => {
  const merged = withFullText({ slug: 'doc-7', content: words(5) }, [{ docId: 'doc-7', slug: 'other', title: '', content: words(500) }]);
  assert.equal(countWords(merged.content), 500);
});
