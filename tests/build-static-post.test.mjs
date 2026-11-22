import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPost } from '../scripts/build-static.js';

test('toPost maps a BlogsPro API document to a renderable post', () => {
  const post = toPost({
    id: 'abc123', title: 'RTGS Liquidity Watch', excerpt: 'Short', content: '<p>Body</p>',
    category: 'Banking', authorName: 'Desk', coverImage: 'https://cdn.example/x.jpg',
    createdAt: '2026-11-01T10:00:00.000Z', published: true
  });
  assert.deepEqual(post, {
    docId: 'abc123', title: 'RTGS Liquidity Watch', slug: 'rtgs-liquidity-watch', excerpt: 'Short',
    content: '<p>Body</p>', category: 'Banking', author: 'Desk', image: 'https://cdn.example/x.jpg',
    publishedIso: '2026-11-01T10:00:00.000Z', published: true
  });
});

test('toPost fills defaults and falls back to the id for the slug', () => {
  const post = toPost({ id: 'only-id', title: '!!!' });
  assert.equal(post.slug, 'only-id');
  assert.equal(post.category, 'Research');
  assert.equal(post.published, false);
  assert.match(post.image, /og-default\.jpg$/);
});
