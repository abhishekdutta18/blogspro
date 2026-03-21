#!/usr/bin/env node
/*
 * bootstrap-worker.js
 * Automates Cloudflare Worker creation/deploy + secret upload via Wrangler.
 *
 * Example:
 *   CLOUDFLARE_API_TOKEN=... \
 *   CLOUDFLARE_ACCOUNT_ID=... \
 *   GITHUB_PAT=... \
 *   node bootstrap-worker.js \
 *     --name github-push \
 *     --script ./worker.js \
 *     --secret-env GITHUB_PAT:GITHUB_TOKEN \
 *     --secret DEPLOY_TOKEN=change-me
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const out = {
    name: "",
    script: "",
    compatibilityDate: new Date().toISOString().slice(0, 10),
    secrets: [],
    secretEnv: [],
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];

    if (a === "--name") out.name = next();
    else if (a === "--script") out.script = next();
    else if (a === "--compatibility-date") out.compatibilityDate = next();
    else if (a === "--secret") out.secrets.push(next());
    else if (a === "--secret-env") out.secretEnv.push(next());
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function usage() {
  console.log(`Usage:
  node bootstrap-worker.js --name <worker-name> --script <path> [options]

Required env:
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID

Options:
  --compatibility-date YYYY-MM-DD   Defaults to today
  --secret KEY=VALUE                Inline secret (repeatable)
  --secret-env ENV[:SECRET_NAME]    Read from env var (repeatable)
  --dry-run                         Print actions only
  --help                            Show this help

Notes:
  - --secret-env API_KEY sets Worker secret API_KEY from process.env.API_KEY
  - --secret-env GITHUB_PAT:GITHUB_TOKEN sets Worker secret GITHUB_TOKEN from process.env.GITHUB_PAT
`);
}

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function parseInlineSecret(s) {
  const idx = s.indexOf("=");
  if (idx <= 0) throw new Error(`Invalid --secret value: ${s}. Expected KEY=VALUE`);
  return { key: s.slice(0, idx), value: s.slice(idx + 1) };
}

function parseEnvSecret(s) {
  const [envName, alias] = String(s).split(":");
  if (!envName) throw new Error(`Invalid --secret-env value: ${s}`);
  const key = alias || envName;
  const value = process.env[envName];
  if (value == null) throw new Error(`Missing env for --secret-env: ${envName}`);
  return { key, value };
}

function run(cmd, args, opts = {}) {
  const p = spawnSync(cmd, args, {
    stdio: ["pipe", "inherit", "inherit"],
    input: opts.input || "",
    env: opts.env || process.env,
    encoding: "utf8",
  });
  if (p.status !== 0) {
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();

  if (!args.name) throw new Error("Missing --name");
  if (!args.script) throw new Error("Missing --script");

  const scriptPath = path.resolve(process.cwd(), args.script);
  if (!fs.existsSync(scriptPath)) throw new Error(`Script file not found: ${args.script}`);
  if (!fs.statSync(scriptPath).isFile()) throw new Error(`Not a file: ${args.script}`);

  const allSecrets = [
    ...args.secrets.map(parseInlineSecret),
    ...args.secretEnv.map(parseEnvSecret),
  ];

  if (args.dryRun) {
    console.log("Dry run:");
    console.log(`  worker name: ${args.name}`);
    console.log(`  script:      ${scriptPath}`);
    console.log(`  compat date: ${args.compatibilityDate}`);
    console.log(`  secrets:     ${allSecrets.length}`);
    for (const s of allSecrets) console.log(`    - ${s.key}`);
    return;
  }

  const env = {
    ...process.env,
    CLOUDFLARE_API_TOKEN: requiredEnv("CLOUDFLARE_API_TOKEN"),
    CLOUDFLARE_ACCOUNT_ID: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
  };

  console.log(`Deploying Worker: ${args.name}`);
  run(
    "npx",
    [
      "--yes",
      "wrangler@4",
      "deploy",
      scriptPath,
      "--name",
      args.name,
      "--compatibility-date",
      args.compatibilityDate,
      "--workers-dev",
    ],
    { env }
  );

  for (const s of allSecrets) {
    console.log(`Setting secret: ${s.key}`);
    run(
      "npx",
      ["--yes", "wrangler@4", "secret", "put", s.key, "--name", args.name],
      { env, input: s.value }
    );
  }

  console.log("\nWorker bootstrap complete.");
  console.log("Next: open Cloudflare Dashboard and copy your workers.dev URL into deploy.html / js/worker-endpoints.js if needed.");
}

main();
