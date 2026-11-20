import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signAssertion, verifyAssertion, BRIDGE_TTL_SECONDS } from '../src/bridge.js';

const SECRET = 'a'.repeat(48);
const claims = { provider: 'google', email: 'a@b.co', name: 'A', verified: true, state: 's1' };

test('a signed assertion verifies and returns its claims', async () => {
  const token = await signAssertion(claims, SECRET);
  const verified = await verifyAssertion(token, SECRET);
  assert.equal(verified.email, 'a@b.co');
  assert.equal(verified.state, 's1');
});

test('tampered body, wrong secret, or garbage is rejected', async () => {
  const token = await signAssertion(claims, SECRET);
  const [body, sig] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims, email: 'boss@example.com', exp: 9999999999 })).toString('base64url');
  assert.equal(await verifyAssertion(`${forged}.${sig}`, SECRET), null);
  assert.equal(await verifyAssertion(token, 'b'.repeat(48)), null);
  assert.equal(await verifyAssertion('nonsense', SECRET), null);
  assert.equal(await verifyAssertion(`${body}.`, SECRET), null);
});

test('assertions expire', async () => {
  const issued = Date.now() - (BRIDGE_TTL_SECONDS + 1) * 1000;
  const token = await signAssertion(claims, SECRET, issued);
  assert.equal(await verifyAssertion(token, SECRET), null);
});

test('short secrets are refused', async () => {
  await assert.rejects(signAssertion(claims, 'short'));
  assert.equal(await verifyAssertion('x.y', 'short'), null);
});
