/**
 * HIL station: hil-worker.js imports updateAuditStatusREST from storage-bridge.
 * It was dropped by accident in c0fb7f5b, which broke the hil-station build.
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as bridge from "../scripts/lib/storage-bridge.js";

const ENV = { FIREBASE_PROJECT_ID: "demo-project" };
const realFetch = globalThis.fetch;
let calls = [];

function stubFetch() {
  calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body });
    return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

test("storage-bridge exports every function hil-worker imports", () => {
  assert.equal(typeof bridge.getPendingAuditsREST, "function");
  assert.equal(typeof bridge.updateAuditStatusREST, "function");
});

test("updateAuditStatusREST PATCHes the pending_audits document", async () => {
  stubFetch();
  await bridge.updateAuditStatusREST("audit_123-abc", "APPROVED", "ok", ENV);
  const patch = calls.find((c) => c.method === "PATCH");
  assert.ok(patch, "expected a PATCH request");
  assert.match(patch.url, /\/projects\/demo-project\/databases\/\(default\)\/documents\/pending_audits\/audit_123-abc\?/);
  const fields = JSON.parse(patch.body).fields;
  assert.equal(fields.status.stringValue, "APPROVED");
  assert.equal(fields.feedback.stringValue, "ok");
});

test("updateAuditStatusREST refuses ids that could escape pending_audits", async () => {
  for (const badId of ["../users/admin", "a/b", "", undefined, "x?y=1", "%2e%2e"]) {
    stubFetch();
    await bridge.updateAuditStatusREST(badId, "APPROVED", "", ENV);
    assert.equal(calls.length, 0, `no request for id ${JSON.stringify(badId)}`);
  }
});

test("updateAuditStatusREST does nothing without a project id", async () => {
  stubFetch();
  await bridge.updateAuditStatusREST("audit_1", "REJECTED", "", {});
  assert.equal(calls.length, 0);
});
