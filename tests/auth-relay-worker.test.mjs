/**
 * The auth worker is an OAuth relay only: it owns the registered callback URL, exchanges the
 * code and hands a signed identity to the VPS API. It must work with no Firebase settings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../scripts/auth-proxy-worker.js';

const RELAY_ENV = Object.freeze({
  GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret',
  GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret',
  OAUTH_BRIDGE_SECRET: 'bridge-secret-for-tests-only-0123456789'
});

const get = (path, env = RELAY_ENV) => worker.fetch(new Request(`https://auth.example${path}`), env);

test('health answers without any configuration', async () => {
  const res = await get('/health', {});
  assert.equal(res.status, 200);
});

test('a login started here is sent to the VPS, which owns the state cookie', async () => {
  const res = await get('/auth/login/github?redirect=https://evil.example');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://blogspro.in/auth/login/github');
});

test('a provider error returns to the login page', async () => {
  const res = await get('/auth/callback/google?error=access_denied');
  assert.match(res.headers.get('location'), /login\.html\?error=oauth&reason=denied$/);
});

test('a callback without a code is refused before any exchange', async () => {
  const res = await get('/auth/callback/github?state=abc');
  assert.match(res.headers.get('location'), /reason=exchange$/);
});

test('without the bridge secret the relay reports misconfiguration instead of 404', async () => {
  const { OAUTH_BRIDGE_SECRET: _omit, ...env } = RELAY_ENV;
  const res = await get('/auth/callback/github?code=x&state=abc', env);
  assert.equal(res.status, 503);
});

test('old Firebase routes are gone', async () => {
  for (const path of ['/auth/me', '/api/data/posts', '/api/diag/env', '/auth/callback/twitter']) {
    assert.equal((await get(path)).status, 404, path);
  }
});
