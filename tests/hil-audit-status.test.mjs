/**
 * HIL station: hil-worker.js imports getPendingAudits and updateAuditStatus from storage-bridge,
 * which records decisions through the BlogsPro API (pending_audits/<id>).
 */
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import * as bridge from "../scripts/lib/storage-bridge.js";

const ENV = Object.freeze({ BLOGSPRO_API_URL: "https://api.example.test", BLOGSPRO_SERVICE_TOKEN: "svc_".padEnd(40, "t") });
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
  assert.equal(typeof bridge.getPendingAudits, "function");
  assert.equal(typeof bridge.updateAuditStatus, "function");
});

test("updateAuditStatus writes the decision to pending_audits/<id>", async () => {
  stubFetch();
  await bridge.updateAuditStatus("audit_123-abc", "APPROVED", "ok", ENV);
  const write = calls.find((c) => c.method !== "GET");
  assert.ok(write, "expected a write request");
  assert.match(write.url, /\/api\/service\/data\/pending_audits\/audit_123-abc$/);
  const body = JSON.parse(write.body);
  assert.equal(body.status, "APPROVED");
  assert.equal(body.feedback, "ok");
});

test("updateAuditStatus refuses ids that could escape pending_audits", async () => {
  for (const badId of ["../users/admin", "a/b", "", undefined, "x?y=1", "%2e%2e"]) {
    stubFetch();
    assert.equal(await bridge.updateAuditStatus(badId, "APPROVED", "", ENV), false);
    assert.equal(calls.length, 0, `no request for id ${JSON.stringify(badId)}`);
  }
});
