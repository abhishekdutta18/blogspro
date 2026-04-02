import { validateContent } from "./lib/validator.js";
import { repairTables, injectVisuals, hardenJson, enforceTemporalGrounding, enforceInstitutionalSections } from "./lib/rules-engine.js";
import { verifyCitations } from "./lib/citation-engine.js";
import { initWorkerSentry, captureSwarmError, logSwarmBreadcrumb } from "./lib/sentry-bridge.js";
import rl from "./lib/reinforcement.js";

/**
 * BlogsPro Auditor Worker (V1.0)
 * ==============================
 * Governance & Quality Tier.
 * Responsible for:
 * 1. Final Structural Validation.
 * 2. Deterministic HTML/JSON Repair.
 * 3. Institutional Source Verification.
 * 4. Reinforcement Learning (RL) Feedback loop.
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("Use POST for auditing.", { status: 405 });

    // 0. Security Handshake
    const token = request.headers.get("X-Swarm-Token");
    if (!token || token !== env.SWARM_INTERNAL_TOKEN) {
      console.error("❌ [Auditor] Unauthorized Swarm Access attempt.");
      return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403 });
    }

    const sentry = initWorkerSentry(request, env);
    try {
      const { content, task, metadata } = await request.json();
      logSwarmBreadcrumb(`Starting Governance Pass: ${task}`, { metadata }, sentry);
      console.log(`🔎 [Auditor] Starting Governance Pass for: ${task}`);

      let clean = content;

      // 1. Structural Repair (Rules Engine)
      const vid = metadata?.verticalId || "gen";
      clean = repairTables(clean);
      clean = hardenJson(clean, vid); // Unique IDs first
      clean = injectVisuals(clean, metadata?.verticalName || task, vid); // Slot-filling adopts IDs
      clean = enforceInstitutionalSections(clean);
      clean = enforceTemporalGrounding(clean);

      // 2. Source Verification (Citation Engine)
      clean = verifyCitations(clean);

      // 3. Final Validation & RL Logging
      const failures = validateContent(clean, { logToRL: true, task, env });
      
      // 4. Advanced Quality Scoring (0-100)
      const qualityScore = calculateQualityScore(clean, failures);

      return new Response(JSON.stringify({
        status: qualityScore >= 80 ? "PASSED" : (qualityScore >= 50 ? "REPAIRED" : "CRITICAL_FAIL"),
        qualityScore,
        content: clean,
        failures: failures,
        metadata: {
          auditedAt: Date.now(),
          rulesPassed: qualityScore >= 50,
          governanceTier: "Swarm 4.0"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      captureSwarmError(e, { stage: 'auditor_governance' }, sentry);
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  }
};

function calculateQualityScore(content, failures) {
  let score = 100;
  
  // Deduct for structural failures (-10 per failure)
  score -= (failures.length * 10);
  
  // Bonus for citation density
  const linkCount = (content.match(/\[[^\]]+\]\(/g) || []).length;
  if (linkCount >= 5) score += 5;
  if (linkCount >= 10) score += 10;

  // Deduct for "AI-isms" padding (Zero-Pollution check)
  const aiIsms = (content.match(/Certainly,|I hope this|As an AI|In this article|I have analyzed/ig) || []).length;
  score -= (aiIsms * 15);

  return Math.min(Math.max(score, 0), 100);
}

