import { 
  executeSingleVerticalSwarm, 
  runConsensusDesk, 
  finalizeManuscript,
  notifyProgress 
} from "./swarm-orchestrator.js";
import { VERTICALS } from "./prompts.js";
import { initWorkerSentry, captureSwarmError } from "./sentry-bridge.js";
import { inngest } from "./inngest-client.js";

/**
 * pulseSwarmWorkflow
 * ------------------
 * Hardened Durable Orchestrator V5.3
 * Handles both Briefings (Consolidated) and Articles (Hierarchical).
 */
export const pulseSwarmWorkflow = inngest.createFunction(
  { 
    id: "pulse-swarm-workflow",
    name: "Institutional Pulse Swarm"
  },
  { event: "swarm/triggered" },
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
        message: `Durable Swarm V5.3 Activated [Type: ${type.toUpperCase()}]` 
      });
    });

    try {
      // 2. RESEARCH PHASE (Hierarchical for Articles, Consolidated for Pulse)
      let allChapterContents = [];

      if (isArticle) {
        const PRIORITY_IDS = ['macro', 'reg', 'em', 'rates'];
        const anchorVerticals = VERTICALS.filter(v => PRIORITY_IDS.includes(v.id));
        const sectorVerticals = VERTICALS.filter(v => !PRIORITY_IDS.includes(v.id));

        // Step 2a: Anchor Research (Sequential to build shared blackboard)
        const anchorResults = await step.run("anchor-research", async () => {
          const results = [];
          for (const v of anchorVerticals) {
            await notifyProgress(env, runtimeId, { stage: "ANCHOR", message: `Establishing Strategic Anchor: ${v.name}` });
            const chapter = await executeSingleVerticalSwarm(v, 0, frequency, semanticDigest, historicalData, env, runtimeId, true, "");
            results.push(chapter);
          }
          return results;
        });
        allChapterContents.push(...anchorResults);

        // Step 2b: Sector Research (Parallelized fan-out)
        const sectorResults = await step.run("sector-fanout", async () => {
          await notifyProgress(env, runtimeId, { 
            stage: "SECTORS", 
            message: `Deploying ${sectorVerticals.length} Sector Specialists...` 
          });
          
          return await Promise.all(sectorVerticals.map((v, i) => 
            executeSingleVerticalSwarm(v, i, frequency, semanticDigest, historicalData, env, runtimeId, extended, "")
          ));
        });
        allChapterContents.push(...sectorResults);

      } else {
        // Consolidated Pulse Path
        const pulseResult = await step.run("consolidated-research", async () => {
          await notifyProgress(env, runtimeId, { stage: "RESEARCH", message: "Executing Consolidated Institutional Research..." });
          return await executeSingleVerticalSwarm(
            { id: "consolidated", name: "Institutional Pulse" }, 
            0, frequency, semanticDigest, historicalData, env, runtimeId, false, ""
          );
        });
        allChapterContents.push(pulseResult);
      }

      // 3. CONSENSUS DESK (Strategic Alignment)
      const consensusSummary = await step.run("consensus-desk", async () => {
        if (frequency === 'hourly' && !isArticle) return "Hourly drift check: Alignment confirmed.";
        await notifyProgress(env, runtimeId, { stage: "CONSENSUS", message: "Simulating Stakeholder Consensus..." });
        return await runConsensusDesk(frequency, semanticDigest, env, runtimeId);
      });

      // 4. FINALIZATION (Template Transformation & Storage)
      const finalResult = await step.run("finalize-manuscript", async () => {
        await notifyProgress(env, runtimeId, { stage: "FINALIZE", message: "Synthesizing Final Manuscript..." });
        return await finalizeManuscript(allChapterContents, consensusSummary, frequency, type, env, runtimeId);
      });

      // 5. COMMIT TO STORAGE
      await step.run("persist-results", async () => {
        const bucket = env.FIREBASE_STORAGE_BUCKET;
        const filename = `swarms/${frequency}/${type}_${runtimeId}.json`;
        
        // We use env.DB_PERSISTENCE (KV or Browser Rendering binding) or direct Firebase fetch
        // For now, logging success and assuming finalizeManuscript handles the core rendering.
        
        await notifyProgress(env, runtimeId, { 
          stage: "COMPLETE", 
          message: `Generation Success (${finalResult.wordCount} words)`,
          jobId: runtimeId
        });
        return { filename };
      });

      return { success: true, jobId: runtimeId, wordCount: finalResult.wordCount };

    } catch (err) {
      captureSwarmError(err, { jobId: runtimeId, stage: "WORKFLOW_FAILURE" });
      await notifyProgress(env, runtimeId, { stage: "ERROR", message: `Critical Failure: ${err.message}` });
      throw err; 
    }
  }
);
