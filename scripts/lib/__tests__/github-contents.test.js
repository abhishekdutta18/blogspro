/**
 * Unit tests for the GitHub Contents API writer used by the archival push.
 * Covers the stale-ref conflict from Sentry #435:
 *   409 "is at <sha> but expected <sha>"
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { putFileWithRetry } from "../github-contents.js";

const BASE = {
  owner: "o",
  repo: "r",
  token: "t",
  branch: "main",
  path: "briefings/hourly/x.json",
  contentBase64: Buffer.from("{}").toString("base64"),
  message: "msg",
  sleep: async () => {},
};

/** Scripted fetch: each call shifts the next response off the queue. */
function createScriptedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : null });
    const next = responses.shift();
    if (!next) throw new Error(`Unexpected fetch #${calls.length}: ${init.method ?? "GET"} ${url}`);
    return new Response(next.body ?? null, { status: next.status });
  };
  return { fetchImpl, calls };
}

const STALE_REF = JSON.stringify({ message: "is at 622c9a8e but expected 3a9cf58f" });

test("creates a new file without a sha when GET returns 404", async () => {
  const { fetchImpl, calls } = createScriptedFetch([{ status: 404 }, { status: 201, body: "{}" }]);

  const result = await putFileWithRetry({ ...BASE, fetchImpl });

  assert.equal(result.attempts, 1);
  assert.equal(calls[1].method, "PUT");
  assert.equal("sha" in calls[1].body, false);
  assert.equal(calls[1].body.branch, "main");
});

test("updates an existing file with the sha from GET", async () => {
  const { fetchImpl, calls } = createScriptedFetch([
    { status: 200, body: JSON.stringify({ sha: "abc" }) },
    { status: 200, body: "{}" },
  ]);

  await putFileWithRetry({ ...BASE, fetchImpl });

  assert.equal(calls[1].body.sha, "abc");
});

test("a stale-ref 409 re-reads the sha and retries until it lands", async () => {
  const { fetchImpl, calls } = createScriptedFetch([
    { status: 200, body: JSON.stringify({ sha: "old" }) },
    { status: 409, body: STALE_REF },
    { status: 200, body: JSON.stringify({ sha: "mid" }) },
    { status: 409, body: STALE_REF },
    { status: 200, body: JSON.stringify({ sha: "new" }) },
    { status: 200, body: "{}" },
  ]);

  const result = await putFileWithRetry({ ...BASE, fetchImpl });

  assert.equal(result.attempts, 3);
  assert.deepEqual(
    calls.filter((c) => c.method === "PUT").map((c) => c.body.sha),
    ["old", "mid", "new"],
  );
});

test("a 422 from a concurrent create is retried with the now-existing sha", async () => {
  const { fetchImpl, calls } = createScriptedFetch([
    { status: 404 },
    { status: 422, body: JSON.stringify({ message: '"sha" wasn\'t supplied.' }) },
    { status: 200, body: JSON.stringify({ sha: "created-by-other-run" }) },
    { status: 201, body: "{}" },
  ]);

  const result = await putFileWithRetry({ ...BASE, fetchImpl });

  assert.equal(result.attempts, 2);
  assert.equal(calls[3].body.sha, "created-by-other-run");
});

test("gives up after maxAttempts and throws with status and body", async () => {
  const conflict = [{ status: 200, body: JSON.stringify({ sha: "s" }) }, { status: 409, body: STALE_REF }];
  const { fetchImpl } = createScriptedFetch([...conflict, ...conflict, ...conflict]);

  await assert.rejects(putFileWithRetry({ ...BASE, fetchImpl, maxAttempts: 3 }), (err) => {
    assert.equal(err.status, 409);
    assert.match(err.message, /briefings\/hourly\/x\.json/);
    assert.match(err.message, /after 3 attempts/);
    assert.match(err.message, /is at 622c9a8e/);
    return true;
  });
});

test("a non-conflict error (401) fails immediately without retrying", async () => {
  const { fetchImpl, calls } = createScriptedFetch([
    { status: 404 },
    { status: 401, body: "Bad credentials" },
  ]);

  await assert.rejects(putFileWithRetry({ ...BASE, fetchImpl }), /401.*Bad credentials/);
  assert.equal(calls.length, 2);
});

test("backs off between attempts with growing delays", async () => {
  const delays = [];
  const conflict = [{ status: 200, body: JSON.stringify({ sha: "s" }) }, { status: 409, body: STALE_REF }];
  const { fetchImpl } = createScriptedFetch([...conflict, ...conflict, { status: 200, body: JSON.stringify({ sha: "s" }) }, { status: 200, body: "{}" }]);

  await putFileWithRetry({
    ...BASE,
    fetchImpl,
    sleep: async (ms) => delays.push(ms),
    random: () => 0,
  });

  assert.equal(delays.length, 2);
  assert.ok(delays[1] > delays[0], `expected growing backoff, got ${delays}`);
});
