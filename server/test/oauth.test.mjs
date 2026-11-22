import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizeUrl, isStateValid, stateCookie, randomState, pickGithubEmail,
  exchangeGoogleCode, fetchGithubIdentity, OAuthError
} from '../src/oauth.js';

const jsonResponse = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test('google authorize URL asks for a code with openid scope', () => {
  const url = new URL(buildAuthorizeUrl('google', { clientId: 'cid', redirectUri: 'https://w/auth/callback/google', state: 's1' }));
  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('scope'), 'openid email profile');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://w/auth/callback/google');
  assert.equal(url.searchParams.get('state'), 's1');
});

test('state is valid only for the same provider and value', () => {
  const state = randomState();
  const cookie = `other=1; ${stateCookie('github', state).split(';')[0]}`;
  assert.equal(isStateValid(cookie, 'github', state), true);
  assert.equal(isStateValid(cookie, 'google', state), false);
  assert.equal(isStateValid(cookie, 'github', 'forged'), false);
  assert.equal(isStateValid('', 'github', state), false);
  assert.equal(isStateValid(cookie, 'github', null), false);
});

test('random state is url-safe and unique', () => {
  const a = randomState();
  assert.match(a, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(a, randomState());
});

test('pickGithubEmail prefers primary verified and never returns unverified', () => {
  assert.equal(pickGithubEmail([
    { email: 'x@a.com', primary: false, verified: true },
    { email: 'p@a.com', primary: true, verified: true }
  ]), 'p@a.com');
  assert.equal(pickGithubEmail([
    { email: 'p@a.com', primary: true, verified: false },
    { email: 'v@a.com', primary: false, verified: true }
  ]), 'v@a.com');
  assert.equal(pickGithubEmail([{ email: 'p@a.com', primary: true, verified: false }]), null);
  assert.equal(pickGithubEmail(null), null);
});

test('exchangeGoogleCode returns the id_token and sends the secret server-side', async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, body: init.body.toString() }; return jsonResponse({ id_token: 'idt' }); };
  const token = await exchangeGoogleCode({ code: 'c', clientId: 'cid', clientSecret: 'sec', redirectUri: 'r', fetchImpl });
  assert.equal(token, 'idt');
  assert.equal(sent.url, 'https://oauth2.googleapis.com/token');
  assert.match(sent.body, /grant_type=authorization_code/);
  assert.match(sent.body, /client_secret=sec/);
});

test('exchange failure raises OAuthError with reason "exchange"', async () => {
  const fetchImpl = async () => jsonResponse({ error: 'invalid_grant' }, 400);
  await assert.rejects(
    exchangeGoogleCode({ code: 'c', clientId: 'a', clientSecret: 'b', redirectUri: 'r', fetchImpl }),
    err => err instanceof OAuthError && err.reason === 'exchange'
  );
});

test('GitHub 200 response carrying an error is still a failure', async () => {
  const fetchImpl = async () => jsonResponse({ error: 'bad_verification_code' });
  await assert.rejects(
    fetchGithubIdentity({ code: 'c', clientId: 'a', clientSecret: 'b', redirectUri: 'r', fetchImpl }),
    err => err.reason === 'exchange'
  );
});

test('fetchGithubIdentity builds a namespaced uid and lowercases the email', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/access_token')) return jsonResponse({ access_token: 'tok' });
    if (url.endsWith('/user')) return jsonResponse({ id: 42, login: 'octo', name: null });
    return jsonResponse([{ email: 'Octo@Example.com', primary: true, verified: true }]);
  };
  const identity = await fetchGithubIdentity({ code: 'c', clientId: 'a', clientSecret: 'b', redirectUri: 'r', fetchImpl });
  assert.deepEqual(identity, { uid: 'github:42', email: 'octo@example.com', name: 'octo', verified: true });
});

test('fetchGithubIdentity rejects accounts without a verified email', async () => {
  const fetchImpl = async url => {
    if (url.endsWith('/access_token')) return jsonResponse({ access_token: 'tok' });
    if (url.endsWith('/user')) return jsonResponse({ id: 1, login: 'u' });
    return jsonResponse([{ email: 'u@x.com', primary: true, verified: false }]);
  };
  await assert.rejects(
    fetchGithubIdentity({ code: 'c', clientId: 'a', clientSecret: 'b', redirectUri: 'r', fetchImpl }),
    err => err.reason === 'no_email'
  );
});
