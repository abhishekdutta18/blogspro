// ═══════════════════════════════════════════════
// ai-refactor.js — AI Repo Scan + Multi-file Refactor
// Features: #20, #21, #26, #27
//
// Workflow:
//   1. scanRepo()      → fetches all JS/HTML/CSS from GitHub via Worker
//   2. refactorFile()  → sends each file to AI with your instruction
//   3. pushRefactored()→ pushes all changed files back via Worker
//
// Usage from admin.html or any page:
//   import { scanRepo, refactorRepo } from './ai-refactor.js';
// ═══════════════════════════════════════════════
import { callAI }          from './ai-core.js';
import { showToast }       from './config.js';

const WORKER_URL = 'https://github-push.abhishek-dutta1996.workers.dev';
const OWNER      = 'abhishekdutta18';
const REPO       = 'blogspro';
const BRANCH     = 'main';

// ── Scan repo — returns all JS/HTML/CSS files ──────────────────────────────
// Each file: { path, content } — content capped at 2000 chars by the Worker
export async function scanRepo(owner = OWNER, repo = REPO) {
  const res = await fetch(`${WORKER_URL}/api/scan-repo`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ owner, repo })
  });

  if (!res.ok) {
    throw new Error(`scan-repo failed: HTTP ${res.status}`);
  }

  const data = await res.json();
  if (!data.files || !Array.isArray(data.files)) {
    throw new Error('scan-repo returned no files array');
  }

  return data.files; // [{ path, content }, ...]
}

// ── Refactor a single file via AI ─────────────────────────────────────────
// Returns { path, content, changed, error }
async function refactorFile(file, instruction) {
  const prompt = `You are a senior software engineer refactoring a production codebase.

Instruction: ${instruction}

File: ${file.path}

\`\`\`
${file.content}
\`\`\`

Rules:
- Return ONLY the complete refactored file content, nothing else
- No markdown fences, no explanation, no preamble
- If this file does not need changes for the given instruction, return the original content unchanged
- Preserve all existing functionality — do not remove features
- Keep the same module import/export structure`;

  const result = await callAI(prompt, true);

  if (result.error) {
    return { path: file.path, content: file.content, changed: false, error: result.error };
  }

  // Strip any accidental markdown fences the AI added
  let newContent = (result.text || '').trim()
    .replace(/^```[\w]*\n?/, '')
    .replace(/\n?```$/, '')
    .trim();

  // Skip if AI returned empty or suspiciously short content
  if (!newContent || newContent.length < 20) {
    return { path: file.path, content: file.content, changed: false, error: 'AI returned empty content' };
  }

  // Skip if content is identical (file didn't need changes)
  const changed = newContent !== file.content;

  return { path: file.path, content: newContent, changed, error: null };
}

// ── Full refactor flow ─────────────────────────────────────────────────────
// instruction: plain English — e.g. "Add JSDoc comments to all functions"
// onProgress: optional callback({ done, total, path, changed })
// Returns summary: { pushed, skipped, failed, results }
export async function refactorRepo(instruction, {
  owner      = OWNER,
  repo       = REPO,
  branch     = BRANCH,
  filter     = null,       // optional fn(file) => bool to limit which files
  dryRun     = false,      // if true: runs AI but does NOT push to GitHub
  onProgress = null,
} = {}) {

  if (!instruction || instruction.trim().length < 5) {
    throw new Error('Instruction is too short. Describe what you want to change.');
  }

  showToast('Scanning repo…', 'info');

  // Step 1: Fetch all files from GitHub via Worker
  let files = await scanRepo(owner, repo);

  // Apply optional filter (e.g. only JS files, only specific paths)
  if (typeof filter === 'function') {
    files = files.filter(filter);
  }

  if (files.length === 0) {
    throw new Error('No files to refactor after applying filter.');
  }

  showToast(`Refactoring ${files.length} files…`, 'info');

  // Step 2: Refactor each file via AI (sequential to avoid rate limits)
  const results    = [];
  const toPush     = [];
  let   done       = 0;

  for (const file of files) {
    const result = await refactorFile(file, instruction);
    results.push(result);
    done++;

    if (typeof onProgress === 'function') {
      onProgress({ done, total: files.length, path: file.path, changed: result.changed });
    }

    if (result.changed && !result.error) {
      toPush.push({ path: result.path, content: result.content });
    }

    // Throttle — avoid hammering AI providers
    if (done < files.length) {
      await new Promise(r => setTimeout(r, 600));
    }
  }

  const skipped = results.filter(r => !r.changed && !r.error).length;
  const failed  = results.filter(r => r.error).length;

  // Step 3: Push all changed files via Worker (unless dry run)
  let pushed = 0;
  if (!dryRun && toPush.length > 0) {
    showToast(`Pushing ${toPush.length} changed files…`, 'info');

    const pushRes = await fetch(WORKER_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        owner,
        repo,
        branch,
        message: `AI refactor: ${instruction.substring(0, 72)}`,
        files:   toPush
      })
    });

    if (!pushRes.ok) {
      throw new Error(`Push failed: HTTP ${pushRes.status}`);
    }

    const pushData = await pushRes.json();
    pushed = pushData.pushed || toPush.length;

    if (!pushData.success) {
      showToast(`⚠ ${pushData.failed} file(s) failed to push`, 'error');
    } else {
      showToast(`✅ Refactor complete — ${pushed} file(s) updated`, 'success');
    }
  } else if (dryRun) {
    pushed = 0;
    showToast(`Dry run complete — ${toPush.length} file(s) would be changed`, 'info');
  } else {
    showToast('No files needed changes', 'info');
  }

  return {
    pushed,
    skipped,
    failed,
    wouldPush: toPush.length,
    results
  };
}

// ── Convenience: refactor only specific file extensions ───────────────────
export function refactorJSOnly(instruction, options = {}) {
  return refactorRepo(instruction, {
    ...options,
    filter: f => f.path.endsWith('.js')
  });
}

export function refactorHTMLOnly(instruction, options = {}) {
  return refactorRepo(instruction, {
    ...options,
    filter: f => f.path.endsWith('.html')
  });
}

// ── Convenience: dry run — preview what would change without pushing ──────
export function previewRefactor(instruction, options = {}) {
  return refactorRepo(instruction, { ...options, dryRun: true });
}
