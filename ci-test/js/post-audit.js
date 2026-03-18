// post-audit.js
export function runAudit(postId) {
  if (!postId) throw new Error('postId required');
  return { postId, status: 'ok' };
}
