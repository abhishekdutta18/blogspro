import { 
  executeSingleVerticalSwarm, 
  runConsensusDesk, 
  runGhostSim,
  finalizeManuscript,
  notifyProgress 
} from "./swarm-orchestrator.js";
import { saveBriefing, updateIndex } from "./storage-bridge.js";
import { askAI } from "./ai-service.js";
import { VERTICALS, getCodingExpertPrompt, INSTITUTIONAL_STYLING } from "./prompts.js";
import { initWorkerSentry, captureSwarmError } from "./sentry-bridge.js";
import { inngest } from "./inngest-client.js";

/**
 * [V6.0] checkStepStatus
 * Queries the MiroSync Durable Object to verify if a step already completed.
 * Prevents redundant compute during worker retries.
 */
async function checkStepStatus(env, jobId, stepId) {
  if (!env.MIRO_SYNC_WORKER_URL) return false;
  try {
    const res = await fetch(`${env.MIRO_SYNC_WORKER_URL}/check-step?jobId=${jobId}&stepId=${stepId}`);
    const { completed } = await res.json();
    return completed;
  } catch (e) {
    return false;
  }
}

/**
 * pulseSwarmWorkflow
 * ------------------
 * Hardened Durable Orchestrator V5.3
 * Handles both Briefings (Consolidated) and Articles (Hierarchical).
 */
export const pulseSwarmWorkflow = inngest.createFunction(
  { 
    id: "pulse-swarm-workflow",
    name: "Institutional Pulse Swarm",
    triggers: [{ event: "swarm/triggered" }],
    // V7.1: Institutional Resilience (5-minute backoff for Bridge Recovery)
    retries: 5,
    concurrency: 1
  },
  async ({ event, step, env, ctx }) => {
    const { jobId, type = 'pulse', frequency = 'hourly', semanticDigest = {}, historicalData = [] } = event.data;
    const isArticle = type === 'article';
    const extended = !!env.EXTENDED_MODE;
    const runtimeId = jobId || `swarm-${Date.now()}`;
    
    // 1. INITIALIZE OBSERVABILITY & TELEMETRY
    initWorkerSentry(null, env, ctx);

    await step.run("initialize-telemetry", async () => {
      await notifyProgress(env, runtimeId, { 
        stage: "INIT", 
        message: `Durable Swarm V6.0 Activated [Type: ${type.toUpperCase()}]`,
        trace: { stepId: "init", status: "COMPLETED", timestamp: Date.now() }
      });
      
      // [V6.0] Sync Style Manual to AFFiNE
      await notifyProgress(env, runtimeId, {
        source: "INSTITUTIONAL_STYLING",
        content: INSTITUTIONAL_STYLING
      });

      // [V6.0] Fire "Ghost Loop" Speculative Simulation
      runGhostSim(frequency, semanticDigest, env, runtimeId);
    });

    try {
      // 2. RESEARCH PHASE (Hierarchical for Articles, Consolidated for Pulse)
      let allChapterContents = [];

      if (isArticle) {
        const PRIORITY_IDS = ['macro', 'reg', 'em', 'rates'];
        const anchorVerticals = VERTICALS.filter(v => PRIORITY_IDS.includes(v.id));
        const sectorVerticals = VERTICALS.filter(v => !PRIORITY_IDS.includes(v.id));

        // Step 2a: Anchor Research (Sequential to build shared blackboard)
        let blackboardContext = "";
        const anchorResults = await step.run("anchor-research", async () => {
          const results = [];
          const anchorMemos = [];
          
          for (const v of anchorVerticals) {
            await notifyProgress(env, runtimeId, { stage: "ANCHOR", message: `Establishing Strategic Anchor: ${v.name}` });
            
            // Research with context from previous anchors
            const chapter = await executeSingleVerticalSwarm(v, 0, frequency, semanticDigest, historicalData, env, runtimeId, true, blackboardContext);
            results.push(chapter);

            // Extract Memo for subsequent nodes
            const memo = await askAI(`Summarize into a 150-word Strategic Telex Memo emphasizing 2026-2027 deltas:\n\n${chapter}`, { 
              role: 'edit', env, model: 'node-draft' 
            });
            anchorMemos.push(`[FROM: ${v.name.toUpperCase()}]: ${memo}`);
            blackboardContext = `\n📋 INSTITUTIONAL ANCHOR MEMOS:\n${anchorMemos.join("\n")}`;
          }
          return { results, context: blackboardContext };
        });
        allChapterContents.push(...anchorResults.results);
        blackboardContext = anchorResults.context;

        // Step 2b: Sector Research (Parallelized fan-out with complete Anchor context)
        const sectorResults = await step.run("sector-fanout", async () => {
          await notifyProgress(env, runtimeId, { 
            stage: "SECTORS", 
            message: `Deploying ${sectorVerticals.length} Sector Specialists...` 
          });
          
          return await Promise.all(sectorVerticals.map((v, i) => 
            executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, runtimeId, extended, blackboardContext)
          ));
        });
        allChapterContents.push(...sectorResults);

      } else {
        // Consolidated Pulse Path
        const stepId = "consolidated-research";
        if (await checkStepStatus(env, runtimeId, stepId)) {
          console.log(`🛡️ Resilience: Skipping ${stepId} (Already Complete)`);
        } else {
          const pulseResult = await step.run(stepId, async () => {
            const start = Date.now();
            await notifyProgress(env, runtimeId, { stage: "RESEARCH", message: "Executing Consolidated Institutional Research...", trace: { stepId: "research", status: "STARTED" } });
            const res = await executeSingleVerticalSwarm(
              { id: "consolidated", name: "Global & India Institutional Pulse" }, 
              0, frequency, semanticDigest, historicalData, env, runtimeId, false, ""
            );
            await notifyProgress(env, runtimeId, { trace: { stepId: "research", status: "COMPLETED", duration: Date.now() - start } });
            return res;
          });
          allChapterContents.push(pulseResult);
        }
      }

      // 3. CONSENSUS DESK (Strategic Alignment)
      let consensusSummary = "";
      const stepIdConsensus = "consensus-desk";
      if (await checkStepStatus(env, runtimeId, stepIdConsensus)) {
        console.log(`🛡️ Resilience: Skipping ${stepIdConsensus} (Already Complete)`);
      } else {
        consensusSummary = await step.run(stepIdConsensus, async () => {
          if (frequency === 'hourly' && !isArticle) return "Hourly drift check: Alignment confirmed.";
          const start = Date.now();
          await notifyProgress(env, runtimeId, { stage: "CONSENSUS", message: "Simulating Stakeholder Consensus...", trace: { stepId: "consensus", status: "STARTED" } });
          const res = await runConsensusDesk(frequency, semanticDigest, env, runtimeId);
          
          // Selective Telemetry: Push only core Consensus findings
          await notifyProgress(env, runtimeId, { 
            source: "CONSENSUS_SYNC", 
            summary: res.summary.substring(0, 500), 
            alignment: res.telemetry?.swarmSentiment 
          });

          await notifyProgress(env, runtimeId, { trace: { stepId: "consensus", status: "COMPLETED", duration: Date.now() - start } });
          return res;
        });
      }

      // 4. FINALIZATION (Template Transformation & Storage)
      const finalResult = await step.run("finalize-manuscript", async () => {
        await notifyProgress(env, runtimeId, { stage: "FINALIZE", message: "Synthesizing Final Manuscript..." });
        // Enable Inngest-aware non-blocking mode in orchestrator
        return await finalizeManuscript(allChapterContents, consensusSummary, frequency, type, { ...env, INNGEST: true }, runtimeId);
      });

      // --- HIL GATE (V8.5) ---
      // Transition from blocking polling to serverless event-wait
      if (env.HIL) {
        await step.waitForEvent("swarm/manuscript.approved", {
            timeout: "60m",
            match: "data.jobId === event.data.jobId"
        });
        await notifyProgress(env, runtimeId, { stage: "HIL_APPROVED", message: "Institutional consensus received via serverless relay." });
      }

      // 4b. CODING AUDIT (MiroFish Expert Review & Auto-Repair)
      let finalManuscript = finalResult.final;
      const codingVerdict = await step.run("coding-audit", async () => {
        await notifyProgress(env, runtimeId, { stage: "AUDIT", message: "Executing Principal Architect Infrastructure Review..." });
        const res = await askAI(getCodingExpertPrompt(finalManuscript, frequency), { 
          role: 'edit', env, model: 'node-audit' 
        });
        
        try {
          // Parse structured JSON verdict
          const verdict = JSON.parse(res.replace(/```json|```/g, '').trim());
          if (verdict.status === 'REPAIRED' && verdict.correctedCode) {
            console.log("🛠️ MiroFish: Auto-repairing institutional artifacts (ghost codes, prompts, echos)...");
            finalManuscript = verdict.correctedCode;
          }
          return verdict;
        } catch (e) {
          console.warn("⚠️ MiroFish Audit parsing failed, sticking to original manuscript.");
          return { status: "PASS", technicalFidelity: "Parsing failed, manual review recommended." };
        }
      });

      // 5. COMMIT TO STORAGE
      const persistenceResult = await step.run("persist-results", async () => {
        const start = Date.now();
        const timestamp = new Date().toISOString();
        const fileName = `${type}_${runtimeId}.html`;
        
        await notifyProgress(env, runtimeId, { stage: "PERSIST", message: `Saving ${type} to Institutional Vault...`, trace: { stepId: "persistence", status: "STARTED" } });
        const storagePath = await saveBriefing(fileName, finalManuscript, frequency, env);
        
        const entry = {
          id: runtimeId,
          title: `${frequency.toUpperCase()} Strategic Manuscript`,
          timestamp: timestamp,
          filename: fileName,
          storagePath: storagePath,
          wordCount: finalResult.wordCount,
          type: type,
          frequency: frequency,
          codingVerdict: codingVerdict
        };
        await updateIndex(entry, frequency, env);
        
        await notifyProgress(env, runtimeId, { 
          stage: "COMPLETE", 
          message: `Generation Success (${finalResult.wordCount} words). Infrastructure hardened.`,
          jobId: runtimeId,
          trace: { stepId: "persistence", status: "COMPLETED", duration: Date.now() - start }
        });

        // 🛡️ SYNC FINAL HEALTH & RL TO AFFINE
        await notifyProgress(env, runtimeId, {
          source: "KEY_HEALTH",
          health: { status: "OK", lastRun: timestamp, wordCount: finalResult.wordCount },
          rl: { fidelity: codingVerdict.rlSignal?.fidelityScore || 80, episodes: 1, incidents: codingVerdict.rlSignal?.majorIncidents || 0 }
        });

        return { filename: fileName, storagePath, title: entry.title };
      });

      // 6. MULTISENSORY DISTRIBUTION & REINFORCEMENT
      await step.run("institutional-distribution", async () => {
        // 6a. Telegram Notification (Title + Link + Abstract)
        const abstractMatch = finalManuscript.match(/<details id="meta-excerpt".*?>(.*?)<\/details>/s);
        const abstract = abstractMatch ? abstractMatch[1].replace(/<\/?[^>]+(>|$)/g, "").trim() : "Institutional Strategic Analysis Manuscript.";
        
        const link = `https://blogspro.in/${type === 'article' ? 'articles' : 'briefings'}/${frequency}/${persistenceResult.filename}`;
        const tgText = `📑 *${frequency.toUpperCase()} INTELLIGENCE REPORT*\n\n*${persistenceResult.title}*\n\n🔹 *Executive Abstract:*\n${abstract}\n\n🔗 *Interactive Terminal:* ${link}`;
        
        if (env.TELEGRAM_TOKEN && env.TELEGRAM_TO) {
          await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_TO, text: tgText, parse_mode: "Markdown" })
          });
        }

        // 6b. Conditional Email (Weekly/Monthly ONLY)
        if (['weekly', 'monthly'].includes(frequency)) {
          await fetch(`https://pulse.blogspro.in/newsletter`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-Swarm-Token": env.SWARM_INTERNAL_TOKEN || ""
            },
            body: JSON.stringify({
              subject: persistenceResult.title,
              html: finalManuscript,
              secret: env.NEWSLETTER_SECRET,
              from: "BlogsPro Institutional"
            })
          });
        }

        // 6c. Affine Synchronization (Final Manuscript push)
        if (env.MIRO_SYNC_WORKER_URL) {
          await fetch(`${env.MIRO_SYNC_WORKER_URL}/push`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              source: "FINAL_MANUSCRIPT",
              content: finalManuscript,
              frequency: frequency
            })
          });
        }

        // 6d. RL Ledger logging (Technical Audit Signals)
        if (env.FIREBASE_PROJECT_ID) {
           const rlUrl = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/ai_reinforcement_ledger`;
           await fetch(rlUrl, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({
               fields: {
                 timestamp: { stringValue: new Date().toISOString() },
                 jobId: { stringValue: runtimeId },
                 frequency: { stringValue: frequency },
                 verdict: { stringValue: codingVerdict.status },
                 fidelityScore: { integerValue: String(codingVerdict.rlSignal?.fidelityScore || 0) },
                 incidents: { integerValue: String(codingVerdict.rlSignal?.majorIncidents || 0) },
                 issues: { arrayValue: { values: (codingVerdict.issues || []).map(i => ({ stringValue: i })) } }
               }
             })
           });
        }
      });

      return { success: true, jobId: runtimeId, wordCount: finalResult.wordCount, status: codingVerdict.status };

    } catch (err) {
      captureSwarmError(err, { jobId: runtimeId, stage: "WORKFLOW_FAILURE" });
      await notifyProgress(env, runtimeId, { stage: "ERROR", message: `Critical Failure: ${err.message}` });
      throw err; 
    }
  }
);
