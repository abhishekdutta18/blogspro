import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeyFile, checkKeys, blankValues } from '../bin/keyfile.mjs';

const GROQ = 'gsk_' + 'a'.repeat(48);
const SAMBA = '1b2c3d4e-5f60-7182-93a4-b5c6d7e8f901';
const CEREBRAS = 'csk-' + 'b'.repeat(48);

const check = text => checkKeys(parseKeyFile(text).entries);

test('uploads filled keys, skips empty ones, ignores comments', () => {
  const result = check(`# comment\nGROQ_API_KEY=${GROQ}\nSAMBANOVA_API_KEY=\n\nMISTRAL_API_KEY="${'m'.repeat(32)}"\n`);
  assert.deepEqual(Object.keys(result.toUpload), ['GROQ_API_KEY', 'MISTRAL_API_KEY']);
  assert.equal(result.toUpload.MISTRAL_API_KEY, 'm'.repeat(32), 'surrounding quotes are stripped');
  assert.deepEqual(result.skipped, ['SAMBANOVA_API_KEY']);
  assert.deepEqual(result.errors, []);
});

test('refuses a Cerebras key in the SambaNova slot (this morning\'s mistake)', () => {
  const { errors, toUpload } = check(`SAMBANOVA_API_KEY=${CEREBRAS}`);
  assert.match(errors[0], /SAMBANOVA_API_KEY holds a key that looks like it belongs to Cerebras/);
  assert.deepEqual(toUpload, {});
});

test('refuses a Groq key pasted into another provider\'s slot', () => {
  assert.match(check(`OPENROUTER_KEY=${GROQ}`).errors[0], /belongs to GROQ_API_KEY/);
});

test('refuses the same key in two slots', () => {
  assert.match(check(`MISTRAL_API_KEY=${SAMBA}\nSAMBANOVA_API_KEY=${SAMBA}`).errors[0], /same key as MISTRAL_API_KEY/);
});

test('refuses unknown names, including the swarm token and Cerebras', () => {
  const { errors } = check(`SWARM_PROXY_TOKEN=${'t'.repeat(64)}\nCEREBRAS_API_KEY=${CEREBRAS}`);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /SWARM_PROXY_TOKEN is not a provider key/);
});

test('refuses truncated keys, inner spaces and repeated names', () => {
  assert.match(check('GROQ_API_KEY=gsk_short').errors[0], /not a full key/);
  assert.match(check(`MISTRAL_API_KEY=${'m'.repeat(16)} ${'m'.repeat(16)}`).errors[0], /spaces or quotes/);
  assert.match(check(`GROQ_API_KEY=${GROQ}\nGROQ_API_KEY=`).errors[0], /more than once/);
});

test('warns, but still uploads, a Groq key without the usual prefix', () => {
  const { warnings, toUpload } = check(`GROQ_API_KEY=${'x'.repeat(40)}`);
  assert.match(warnings[0], /does not start with "gsk_"/);
  assert.ok(toUpload.GROQ_API_KEY);
});

test('reports lines that are not NAME=value', () => {
  assert.match(parseKeyFile('just a pasted key').errors[0], /line 1: expected NAME=value/);
});

test('blankValues removes every value and keeps names and comments', () => {
  const text = `# keep me\nGROQ_API_KEY=${GROQ}\nSAMBANOVA_API_KEY=\n`;
  assert.equal(blankValues(text), '# keep me\nGROQ_API_KEY=\nSAMBANOVA_API_KEY=\n');
  assert.doesNotMatch(blankValues(text), /gsk_/);
});
