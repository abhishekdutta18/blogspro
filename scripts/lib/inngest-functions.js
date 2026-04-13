import { inngest } from "./inngest-client.js";
import { initWorkerSentry, captureSwarmError } from "./sentry-bridge.js";

/**
 * pulseSwarmWorkflow
 * ------------------
 * Hardened Lean Coordinator V6.0
 * Hand-off orchestration to GitHub Actions for Institutional Stability.
 */
export const pulseSwarmWorkflow = inngest.createFunction(
  { 
    id: "pulse-swarm-workflow",
    name: "Institutional Pulse Swarm (Trigger)",
    triggers: [{ event: "swarm/triggered" }],
    retries: 3,
    concurrency: 1
  },
  async ({ event, step, env, ctx }) => {
    const { type = 'pulse', frequency = 'hourly' } = event.data;
    
    initWorkerSentry(null, env, ctx);

    return await step.run("github-dispatch", async () => {
      const ghPat = env.GH_PAT;
      if (!ghPat) throw new Error("GH_PAT missing on edge. Cannot trigger institutional dispatch.");

      const owner = "abhishekdutta18";
      const repo = "blogspro";
      const workflowId = "253184701"; // [V6.1] Using numeric ID for absolute reliability
      
      console.log(`🚀 [Inngest] Handing off ${frequency} ${type} to GitHub Actions (ID: ${workflowId})...`);

      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
        method: "POST",
        headers: {
          "Authorization": `token ${ghPat}`,
          "User-Agent": "BlogsPro-Pulse-Worker/6.1",
          "Accept": "application/vnd.github.v3+json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ref: "main",
          inputs: { frequency }
        })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`GitHub Dispatch Failed: ${res.status} - ${errorText}`);
      }

      return { 
        success: true, 
        frequency, 
        status: "DISPATCHED_TO_GHA", 
        workflowId,
        githubRequestId: res.headers.get('x-github-request-id')
      };
    });
  }
);
