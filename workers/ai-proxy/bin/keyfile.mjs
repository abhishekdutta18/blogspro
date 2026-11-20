/**
 * keyfile.mjs — reads and checks keys.env, the gitignored file where provider keys are
 * pasted before push-keys.mjs uploads them to the proxy. Pure functions; nothing here
 * prints or sends a key. Errors and warnings name the variable, never its value.
 */
import { PROVIDERS } from '../src/index.js';

export const ALLOWED_NAMES = Object.freeze(Object.values(PROVIDERS).map(p => p.keyName));
const MIN_KEY_LENGTH = 20;

/** Prefixes that identify a provider's keys. A key carrying another provider's prefix is in the wrong slot. */
const KNOWN_PREFIXES = Object.freeze([
  { prefix: 'gsk_', owner: 'GROQ_API_KEY' },
  { prefix: 'sk-or-', owner: 'OPENROUTER_KEY' },
  { prefix: 'csk-', owner: 'Cerebras (dropped from the swarm)' }
]);

const unquote = value => value.replace(/^(['"])(.*)\1$/, '$2');

/**
 * @param {string} text keys.env content
 * @returns {{entries: {name: string, value: string, line: number}[], errors: string[]}}
 */
export function parseKeyFile(text) {
  const entries = [];
  const errors = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq < 1) {
      errors.push(`line ${index + 1}: expected NAME=value`);
      return;
    }
    entries.push({ name: line.slice(0, eq).trim(), value: unquote(line.slice(eq + 1).trim()), line: index + 1 });
  });
  return { entries, errors };
}

/**
 * Decides what may be uploaded. Empty values are skipped (the proxy keeps its current secret).
 * @param {{name: string, value: string, line: number}[]} entries
 * @returns {{toUpload: Record<string, string>, skipped: string[], errors: string[], warnings: string[]}}
 */
export function checkKeys(entries) {
  const errors = [];
  const warnings = [];
  const skipped = [];
  const toUpload = {};
  const seenValues = new Map();

  for (const { name, value, line } of entries) {
    if (!ALLOWED_NAMES.includes(name)) {
      errors.push(`line ${line}: ${name} is not a provider key the proxy uses (allowed: ${ALLOWED_NAMES.join(', ')})`);
      continue;
    }
    if (name in toUpload || skipped.includes(name)) {
      errors.push(`line ${line}: ${name} appears more than once`);
      continue;
    }
    if (!value) {
      skipped.push(name);
      continue;
    }
    if (/\s/.test(value) || /['"]/.test(value)) {
      errors.push(`line ${line}: ${name} contains spaces or quotes; paste the key alone`);
      continue;
    }
    if (value.length < MIN_KEY_LENGTH) {
      errors.push(`line ${line}: ${name} is only ${value.length} characters; that is not a full key`);
      continue;
    }
    const wrongOwner = KNOWN_PREFIXES.find(p => value.startsWith(p.prefix) && p.owner !== name);
    if (wrongOwner) {
      errors.push(`line ${line}: ${name} holds a key that looks like it belongs to ${wrongOwner.owner}`);
      continue;
    }
    const expected = KNOWN_PREFIXES.find(p => p.owner === name);
    if (expected && !value.startsWith(expected.prefix)) {
      warnings.push(`${name} does not start with "${expected.prefix}" as these keys usually do; uploading anyway`);
    }
    if (seenValues.has(value)) {
      errors.push(`line ${line}: ${name} holds the same key as ${seenValues.get(value)}; each provider needs its own`);
      continue;
    }
    seenValues.set(value, name);
    toUpload[name] = value;
  }
  return { toUpload, skipped, errors, warnings };
}

/** Same file with every value removed, so the keys live only in Cloudflare after a push. */
export function blankValues(text) {
  return text
    .split(/\r?\n/)
    .map(raw => {
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) return raw;
      const eq = raw.indexOf('=');
      return eq < 1 ? raw : `${raw.slice(0, eq + 1)}`;
    })
    .join('\n');
}
