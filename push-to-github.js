// ═══════════════════════════════════════════════════════════════
// push-to-github.js — Run with Node.js to push all patch files
// Usage: GH_TOKEN=ghp_xxx GH_OWNER=you GH_REPO=blogspro node push-to-github.js
// ═══════════════════════════════════════════════════════════════

const fs     = require('fs');
const path   = require('path');
const https  = require('https');

const TOKEN  = process.env.GH_TOKEN;
const OWNER  = process.env.GH_OWNER;
const REPO   = process.env.GH_REPO;
const BRANCH = process.env.GH_BRANCH || 'main';

if (!TOKEN || !OWNER || !REPO) {
  console.error('Missing GH_TOKEN, GH_OWNER, or GH_REPO');
  process.exit(1);
}

const FILES = [
  'js/editor.js',
  'js/timer.js',
  'js/chart-builder.js',
  'js/post-audit.js',
  'js/main.js',
  'admin.html',
];

async function ghRequest(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'api.github.com',
      path: `/repos/${OWNER}/${REPO}${endpoint}`,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'blogspro-patch-pusher',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, res => {
      let out = '';
      res.on('data', d => out += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, data: out }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getSHA(filePath) {
  const r = await ghRequest(`/contents/${filePath}`);
  return r.status === 200 ? r.data.sha : null;
}

async function pushFile(filePath, localPath) {
  const content   = fs.readFileSync(localPath, 'utf8');
  const encoded   = Buffer.from(content).toString('base64');
  const sha       = await getSHA(filePath);
  const commitMsg = `patch: update ${filePath} — post-audit v2, dynamic roadmap, image delete`;

  const body = { message: commitMsg, content: encoded, branch: BRANCH, ...(sha ? { sha } : {}) };
  const r    = await ghRequest(`/contents/${filePath}`, 'PUT', body);

  if (r.status === 200 || r.status === 201) {
    console.log(`✓ ${filePath}`);
  } else {
    console.error(`✕ ${filePath} — ${r.status}: ${JSON.stringify(r.data).slice(0, 120)}`);
  }
}

(async () => {
  console.log(`Pushing ${FILES.length} files to ${OWNER}/${REPO} (${BRANCH})…\n`);
  const dir = path.dirname(process.argv[1]);
  for (const f of FILES) {
    const local = path.join(dir, 'blogspro-patch', f);
    if (!fs.existsSync(local)) { console.warn(`⚠ Not found locally: ${local}`); continue; }
    await pushFile(f, local);
    await new Promise(r => setTimeout(r, 300)); // rate-limit buffer
  }
  console.log('\nDone.');
})();
