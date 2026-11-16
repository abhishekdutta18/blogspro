/**
 * Write one file to a branch through the GitHub Contents API, retrying on
 * write conflicts.
 *
 * Several archival writers share `main` (overlapping workflow runs, the
 * workflow's own `git push`, other pipelines). Between our GET of the file
 * SHA and our PUT, the branch head can move, and GitHub answers:
 *   409  "is at <head> but expected <head>"   (stale ref / stale file sha)
 *   422  "sha wasn't supplied"                (file created by someone else)
 * Both are resolved by re-reading the SHA and trying again after a backoff.
 * Sentry #435 was this conflict surviving the old single retry.
 *
 * Free of fs/Sentry imports so it can be unit-tested with an injected fetch.
 */

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "blogspro-swarm";
const DEFAULT_MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 750;
const MAX_JITTER_MS = 500;
const CONFLICT_STATUSES = Object.freeze([409, 422]);

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {{ owner: string, repo: string, path: string }} target
 * @returns {string}
 */
function contentsUrl({ owner, repo, path }) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodedPath}`;
}

/**
 * Current blob SHA of the file on the branch, or null if it does not exist.
 * @returns {Promise<string | null>}
 */
async function fetchCurrentSha({ url, branch, headers, fetchImpl }) {
  const res = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(`GitHub GET failed [${url}]: ${res.status} - ${body}`);
    error.status = res.status;
    throw error;
  }
  const data = await res.json();
  return data?.sha ?? null;
}

/**
 * Create or update a file, retrying stale-ref / concurrent-create conflicts.
 *
 * @param {{
 *   owner: string, repo: string, token: string, branch?: string,
 *   path: string, contentBase64: string, message: string,
 *   maxAttempts?: number, fetchImpl?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>, random?: () => number,
 * }} params
 * @returns {Promise<{ status: number, attempts: number }>}
 */
export async function putFileWithRetry({
  owner,
  repo,
  token,
  branch = "main",
  path,
  contentBase64,
  message,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  fetchImpl = fetch,
  sleep = defaultSleep,
  random = Math.random,
}) {
  const url = contentsUrl({ owner, repo, path });
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };

  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const sha = await fetchCurrentSha({ url, branch, headers, fetchImpl });
    const body = { message, content: contentBase64, branch, ...(sha ? { sha } : {}) };

    const res = await fetchImpl(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { status: res.status, attempts: attempt };

    lastStatus = res.status;
    lastBody = await res.text().catch(() => "<unreadable body>");

    const isConflict = CONFLICT_STATUSES.includes(res.status);
    if (!isConflict) break;
    if (attempt < maxAttempts) {
      await sleep(BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(random() * MAX_JITTER_MS));
    }
  }

  const attemptsNote = CONFLICT_STATUSES.includes(lastStatus) ? ` after ${maxAttempts} attempts` : "";
  const error = new Error(`GitHub Push Failed [${path}]${attemptsNote}: ${lastStatus} - ${lastBody}`);
  error.status = lastStatus;
  throw error;
}
