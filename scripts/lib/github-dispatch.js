/**
 * GitHub Actions dispatch for the institutional research workflow.
 *
 * Kept free of Inngest/Sentry imports so it can be unit-tested with an
 * injected `fetch`. `pulseSwarmWorkflow` (inngest-functions.js) is the only
 * production caller.
 *
 * The inputs sent here MUST match `on.workflow_dispatch.inputs` in
 * .github/workflows/institutional-research.yml (`freq`, `type`). GitHub
 * answers 422 to any undeclared input and creates no run.
 */

const GITHUB_API = "https://api.github.com";
const OWNER = "abhishekdutta18";
const REPO = "blogspro";
export const WORKFLOW_ID = "institutional-research.yml";
const REF = "main";
const USER_AGENT = "BlogsPro-Pulse-Worker/6.2";

/** Mirrors the `freq` choice options in the workflow. */
const ALLOWED_FREQUENCIES = Object.freeze(["hourly", "daily", "weekly", "monthly"]);

/**
 * `type` is a free-text workflow input that is interpolated into a shell
 * command, so only known values are forwarded. The tome script treats
 * 'article' as the multi-vertical manuscript and anything else as the single
 * consolidated pulse (swarm-orchestrator.js `isArticle`).
 */
const ALLOWED_TYPES = Object.freeze(["pulse", "article"]);

/** Same mapping the pulse worker's cron handler uses. */
const DEFAULT_TYPE_BY_FREQUENCY = Object.freeze({
  hourly: "pulse",
  daily: "pulse",
  weekly: "article",
  monthly: "article",
});

/**
 * Validate an event's frequency/type and map them to workflow inputs.
 * @param {{ frequency?: string, type?: string }} params
 * @returns {{ freq: string, type: string }}
 */
export function buildDispatchInputs({ frequency, type } = {}) {
  if (!ALLOWED_FREQUENCIES.includes(frequency)) {
    throw new Error(
      `Invalid frequency "${frequency}". Expected one of: ${ALLOWED_FREQUENCIES.join(", ")}.`,
    );
  }

  const resolvedType = type ?? DEFAULT_TYPE_BY_FREQUENCY[frequency];
  if (!ALLOWED_TYPES.includes(resolvedType)) {
    throw new Error(
      `Invalid type "${resolvedType}". Expected one of: ${ALLOWED_TYPES.join(", ")}.`,
    );
  }

  return { freq: frequency, type: resolvedType };
}

/**
 * POST a workflow_dispatch. Throws on any non-2xx so the caller fails loudly.
 * @param {{ token: string, frequency: string, type?: string, fetchImpl?: typeof fetch }} params
 * @returns {Promise<{ status: number, inputs: { freq: string, type: string }, githubRequestId: string | null }>}
 */
export async function dispatchInstitutionalResearch({ token, frequency, type, fetchImpl = fetch }) {
  const inputs = buildDispatchInputs({ frequency, type });
  const url = `${GITHUB_API}/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`;

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": USER_AGENT,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: REF, inputs }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable body>");
    const error = new Error(`GitHub dispatch of ${WORKFLOW_ID} failed: ${res.status} - ${body}`);
    error.status = res.status;
    throw error;
  }

  return { status: res.status, inputs, githubRequestId: res.headers.get("x-github-request-id") };
}

/**
 * Glue for the Inngest `swarm/triggered` handler: resolve the token from the
 * worker env, dispatch, and shape the step result.
 * @param {{ eventData?: { frequency?: string, type?: string }, env?: Record<string, string>, fetchImpl?: typeof fetch }} params
 */
export async function runPulseDispatch({ eventData = {}, env = {}, fetchImpl = fetch }) {
  const token = env.GH_PAT;
  if (!token) {
    throw new Error("GH_PAT missing on edge. Cannot trigger institutional dispatch.");
  }

  const frequency = eventData.frequency ?? "hourly";
  const { status, inputs, githubRequestId } = await dispatchInstitutionalResearch({
    token,
    frequency,
    type: eventData.type,
    fetchImpl,
  });

  return {
    success: true,
    status: "DISPATCHED_TO_GHA",
    httpStatus: status,
    frequency: inputs.freq,
    type: inputs.type,
    workflowId: WORKFLOW_ID,
    githubRequestId,
  };
}
