#!/usr/bin/env node
/**
 * Local Deployment Server
 * Listens on http://localhost:3000 and deploys to GitHub via API
 * Alternative to Cloudflare Worker when it's unavailable
 */

const http = require('http');
const { Readable } = require('stream');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const PORT = process.env.DEPLOY_PORT || 3000;

if (!GITHUB_TOKEN) {
  console.warn('⚠️  WARNING: GITHUB_TOKEN not set. Deployments will fail.');
  console.warn('   Set: export GITHUB_TOKEN=your_github_pat');
}

async function getDefaultBranch(owner, repo) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
  });
  if (!res.ok) throw new Error(`Failed to fetch repo: ${res.status}`);
  const data = await res.json();
  return data.default_branch;
}

async function getTreeSha(owner, repo, branch) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Failed to get branch ref: ${res.status}`);
  const data = await res.json();
  return data.object.sha;
}

async function getCommitTree(owner, repo, commitSha) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/commits/${commitSha}`,
    { headers: { Authorization: `Bearer ${GITHUB_TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Failed to get commit: ${res.status}`);
  const data = await res.json();
  return data.tree.sha;
}

async function createBlob(owner, repo, content) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ content, encoding: 'utf-8' })
  });
  if (!res.ok) throw new Error(`Failed to create blob: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function createTree(owner, repo, parentTreeSha, files) {
  const tree = await Promise.all(
    files.map(async (file) => ({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: await createBlob(owner, repo, file.content)
    }))
  );

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tree, base_tree: parentTreeSha })
  });
  if (!res.ok) throw new Error(`Failed to create tree: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function createCommit(owner, repo, treeSha, parentSha, message) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha]
    })
  });
  if (!res.ok) throw new Error(`Failed to create commit: ${res.status}`);
  const data = await res.json();
  return data.sha;
}

async function updateRef(owner, repo, branch, commitSha) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sha: commitSha })
    }
  );
  if (!res.ok) throw new Error(`Failed to update ref: ${res.status}`);
  return await res.json();
}

async function deploy(owner, repo, branch, message, files) {
  console.log(`\n📦 Deploying ${files.length} files to ${owner}/${repo}@${branch}...`);

  // Get current branch tip
  const currentSha = await getTreeSha(owner, repo, branch);
  const parentCommitSha = currentSha;

  // Get parent tree
  const parentTreeSha = await getCommitTree(owner, repo, parentCommitSha);

  // Create new tree with file changes
  const newTreeSha = await createTree(owner, repo, parentTreeSha, files);

  // Create commit
  const newCommitSha = await createCommit(owner, repo, newTreeSha, parentCommitSha, message);

  // Update branch ref
  await updateRef(owner, repo, branch, newCommitSha);

  console.log(`✅ Deployed successfully!`);
  console.log(`   Commit: ${newCommitSha}`);
  console.log(`   URL: https://github.com/${owner}/${repo}/commit/${newCommitSha}`);

  return { commit: newCommitSha, url: `https://github.com/${owner}/${repo}/commit/${newCommitSha}` };
}

async function handleRequest(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { owner, repo, branch = 'main', message, files, pr } = payload;

      if (!owner || !repo || !files || !Array.isArray(files)) {
        throw new Error('Missing required fields: owner, repo, files');
      }

      if (!GITHUB_TOKEN) {
        throw new Error('GITHUB_TOKEN environment variable not set');
      }

      const result = await deploy(owner, repo, branch, message || `Deploy ${files.length} files`, files);

      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        commit: result.commit,
        url: result.url,
        message: `✅ Deployed ${files.length} files to ${owner}/${repo}@${branch}`
      }));
    } catch (err) {
      console.error('❌ Deployment error:', err.message);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`🚀 Local Deployment Server running on http://localhost:${PORT}`);
  console.log(`\n📝 Setup:`);
  console.log(`   1. Set GitHub PAT: export GITHUB_TOKEN=ghp_xxx`);
  console.log(`   2. Update deploy.html worker URL to: http://localhost:${PORT}`);
  console.log(`   3. Upload ZIP and deploy\n`);
});
