/**
 * Regression guard: Worker secrets live in Wrangler secrets, never in committed config.
 * The repo is public, so any value here is leaked the moment it is pushed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { getInngestClient } from "../scripts/lib/inngest-client.js";

const ROOT = process.cwd();
const SECRET_NAMES = [
  "INNGEST_EVENT_KEY",
  "INNGEST_SIGNING_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "SWARM_INTERNAL_TOKEN",
];

function wranglerConfigs() {
  const rootConfigs = readdirSync(ROOT).filter((f) => /^wrangler.*\.toml$/.test(f));
  const workersDir = path.join(ROOT, "workers");
  const workerConfigs = existsSync(workersDir)
    ? readdirSync(workersDir)
        .map((d) => path.join("workers", d, "wrangler.toml"))
        .filter((f) => existsSync(path.join(ROOT, f)))
    : [];
  return [...rootConfigs, ...workerConfigs];
}

test("no wrangler config assigns a value to a secret binding", () => {
  for (const file of wranglerConfigs()) {
    const body = readFileSync(path.join(ROOT, file), "utf8");
    for (const name of SECRET_NAMES) {
      const assigned = new RegExp(`^\\s*${name}\\s*=`, "m").test(body);
      assert.equal(assigned, false, `${file} assigns ${name}; use \`wrangler secret put\``);
    }
  }
});

test("no wrangler config ships PASTE_ placeholders or Inngest signing keys", () => {
  for (const file of wranglerConfigs()) {
    const body = readFileSync(path.join(ROOT, file), "utf8");
    assert.doesNotMatch(body, /"PASTE_/, `${file} contains a PASTE_ placeholder`);
    assert.doesNotMatch(body, /signkey-(prod|test)-/, `${file} contains an Inngest signing key`);
  }
});

test("inngest client source has no hardcoded signing key", () => {
  const src = readFileSync(path.join(ROOT, "scripts/lib/inngest-client.js"), "utf8");
  assert.doesNotMatch(src, /signkey-(prod|test)-/);
});

test("getInngestClient takes the signing key from env only", () => {
  const withKey = getInngestClient({ INNGEST_SIGNING_KEY: "signkey-test-00" });
  assert.equal(withKey.signingKey, "signkey-test-00");

  const withoutKey = getInngestClient({});
  assert.equal(withoutKey.signingKey, undefined);
});

test("deploy workflow pushes the moved secrets from GitHub secrets", () => {
  const wf = readFileSync(path.join(ROOT, ".github/workflows/deploy-pulse.yml"), "utf8");
  for (const name of ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"]) {
    assert.match(wf, new RegExp(`\\$\\{\\{ secrets\\.${name} \\}\\}`), `${name} not read from GitHub secrets`);
    assert.match(wf, new RegExp(`wrangler secret put ${name} \\$OPTS`), `${name} not pushed to pulse`);
  }
  for (const name of ["SWARM_INTERNAL_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID"]) {
    assert.match(wf, new RegExp(`wrangler secret put ${name} --env hil-station`), `${name} not pushed to hil-station`);
  }
});
