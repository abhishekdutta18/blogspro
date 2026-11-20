#!/usr/bin/env node
/**
 * push-keys.mjs — uploads the provider keys pasted into keys.env to the blogspro-ai-proxy
 * worker as Cloudflare secrets, then clears them from the file so they live only in
 * Cloudflare. Keys go to wrangler on stdin; nothing is printed except variable names.
 *
 *   node bin/push-keys.mjs           check, upload, then blank the values in keys.env
 *   node bin/push-keys.mjs --check   check only, upload nothing
 *   node bin/push-keys.mjs --keep    upload but leave the values in keys.env
 */
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseKeyFile, checkKeys, blankValues } from './keyfile.mjs';

const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEY_FILE = join(WORKER_DIR, 'keys.env');
const out = line => process.stdout.write(`${line}\n`);

/** Runs `wrangler secret bulk` with the secrets as JSON on stdin; returns wrangler's lines that name results. */
function uploadSecrets(secrets) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', 'secret', 'bulk'], { cwd: WORKER_DIR, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      // Wrangler reports key names only; still, keep just the result lines.
      const lines = output.split('\n').filter(l => /success|creat|updat|error|fail/i.test(l)).map(l => l.trim());
      code === 0 ? resolve(lines) : reject(new Error(lines.join('\n') || `wrangler exited with code ${code}`));
    });
    child.stdin.end(JSON.stringify(secrets));
  });
}

async function main(args) {
  if (!existsSync(KEY_FILE)) {
    out(`No keys.env yet. Create it from the template:  cp keys.env.example keys.env`);
    return 2;
  }
  chmodSync(KEY_FILE, 0o600);
  const text = readFileSync(KEY_FILE, 'utf8');
  const parsed = parseKeyFile(text);
  const { toUpload, skipped, errors, warnings } = checkKeys(parsed.entries);
  const problems = [...parsed.errors, ...errors];

  warnings.forEach(w => out(`warning  ${w}`));
  problems.forEach(p => out(`error    ${p}`));
  if (problems.length) {
    out('Nothing uploaded. Fix the lines above and run again.');
    return 1;
  }
  const names = Object.keys(toUpload);
  if (skipped.length) out(`skipped  ${skipped.join(', ')} (empty; the proxy keeps whatever it has)`);
  if (!names.length) {
    out('No keys to upload: every line in keys.env is empty.');
    return 1;
  }
  out(`ready    ${names.join(', ')}`);
  if (args.includes('--check')) return 0;

  const results = await uploadSecrets(toUpload);
  results.forEach(line => out(`wrangler ${line}`));
  if (!args.includes('--keep')) {
    writeFileSync(KEY_FILE, blankValues(text), { mode: 0o600 });
    out('cleared  keys.env values (the keys now live only in Cloudflare)');
  }
  out('next     cd ../../swarm && npm run probe');
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error) {
  out(`error    upload failed: ${error.message}`);
  out('keys.env was left unchanged.');
  process.exitCode = 1;
}
