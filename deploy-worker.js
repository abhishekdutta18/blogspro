#!/usr/bin/env node
/*
 * Deploy files to GitHub through the Cloudflare Worker used by deploy.html.
 *
 * Examples:
 *   node deploy-worker.js --files firestore.rules,index.html
 *   node deploy-worker.js --git-changed --message "Deploy local changes"
 *   node deploy-worker.js --status --files firestore.rules,index.html
 *   node deploy-worker.js --git-changed --pr
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DEFAULTS = {
  workerUrl: "https://github-push.abhishekdutta18.workers.dev/",
  owner: "abhishekdutta18",
  repo: "blogspro",
  branch: "main",
};

function parseArgs(argv) {
  const out = {
    workerUrl: process.env.DEPLOY_WORKER_URL || DEFAULTS.workerUrl,
    owner: process.env.DEPLOY_OWNER || DEFAULTS.owner,
    repo: process.env.DEPLOY_REPO || DEFAULTS.repo,
    branch: process.env.DEPLOY_BRANCH || DEFAULTS.branch,
    message: process.env.DEPLOY_MESSAGE || "",
    pr: false,
    dryRun: false,
    status: false,
    gitChanged: false,
    files: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];

    if (a === "--worker-url") out.workerUrl = next();
    else if (a === "--owner") out.owner = next();
    else if (a === "--repo") out.repo = next();
    else if (a === "--branch") out.branch = next();
    else if (a === "--message") out.message = next();
    else if (a === "--files") out.files = splitFiles(next());
    else if (a === "--file") out.files.push(next());
    else if (a === "--git-changed") out.gitChanged = true;
    else if (a === "--pr") out.pr = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--status") out.status = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }

  return out;
}

function splitFiles(v) {
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeWorkerUrl(url) {
  const u = String(url || "").trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) {
    throw new Error("Worker URL must start with http:// or https://");
  }
  return u.replace(/\/+$/, "") + "/";
}

function readGitChangedFiles() {
  const raw = execSync("git diff --name-only HEAD", { encoding: "utf8" });
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ensureFiles(list) {
  if (!list.length) {
    throw new Error("No files selected. Use --files or --git-changed.");
  }
}

function readPayloadFiles(files) {
  const entries = [];
  for (const rel of files) {
    const p = path.resolve(process.cwd(), rel);
    if (!fs.existsSync(p)) throw new Error(`File not found: ${rel}`);
    if (!fs.statSync(p).isFile()) throw new Error(`Not a file: ${rel}`);
    const content = fs.readFileSync(p, "utf8");
    entries.push({ path: rel.replace(/\\/g, "/"), content });
  }
  return entries;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    const text = await res.text();
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    const msg = data?.error || data?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

function printUsage() {
  console.log(`Usage:
  node deploy-worker.js [options]

Options:
  --files <a,b,c>         Comma-separated file paths to deploy
  --file <path>           Single file path (can be repeated)
  --git-changed           Deploy files from: git diff --name-only HEAD
  --message <text>        Commit message override
  --worker-url <url>      Worker endpoint (default from deploy.html)
  --owner <name>          GitHub owner (default: abhishekdutta18)
  --repo <name>           GitHub repo (default: blogspro)
  --branch <name>         Branch (default: main)
  --pr                    Create PR instead of direct push
  --status                Call worker /api/status instead of deploy
  --dry-run               Print payload summary only
  --help                  Show this help

Env overrides:
  DEPLOY_WORKER_URL, DEPLOY_OWNER, DEPLOY_REPO, DEPLOY_BRANCH, DEPLOY_MESSAGE`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printUsage();

  args.workerUrl = normalizeWorkerUrl(args.workerUrl);

  if (args.gitChanged) {
    args.files = Array.from(new Set([...args.files, ...readGitChangedFiles()]));
  } else {
    args.files = Array.from(new Set(args.files));
  }

  ensureFiles(args.files);

  if (args.status) {
    const statusUrl = new URL("api/status", args.workerUrl).toString();
    const statusData = await postJson(statusUrl, {
      owner: args.owner,
      repo: args.repo,
      branch: args.branch,
      files: args.files.slice(0, 10),
    });
    console.log(JSON.stringify(statusData, null, 2));
    return;
  }

  const files = readPayloadFiles(args.files);
  const message =
    args.message || `Deploy ${files.length} files from CLI (${new Date().toISOString()})`;

  if (args.dryRun) {
    console.log("Dry run payload summary:");
    console.log(`  worker: ${args.workerUrl}`);
    console.log(`  target: ${args.owner}/${args.repo}@${args.branch}`);
    console.log(`  mode:   ${args.pr ? "pull request" : "direct push"}`);
    console.log(`  files:  ${files.length}`);
    for (const f of files) console.log(`    - ${f.path}`);
    console.log(`  message: ${message}`);
    return;
  }

  const data = await postJson(args.workerUrl, {
    owner: args.owner,
    repo: args.repo,
    branch: args.branch,
    message,
    files,
    pr: args.pr,
  });

  console.log("Deploy succeeded.");
  if (data.commit) console.log(`Commit: ${data.commit}`);
  if (data.url) console.log(`URL: ${data.url}`);
  if (data.pr) console.log(`PR: ${data.pr}`);
}

main().catch((err) => {
  console.error(`Deploy failed: ${err.message}`);
  process.exit(1);
});

