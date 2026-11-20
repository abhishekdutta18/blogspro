import { inngest } from "./inngest-client.js";
import { initWorkerSentry } from "./sentry-bridge.js";
import { runPulseDispatch } from "./github-dispatch.js";

/**
 * pulseSwarmWorkflow
 * ------------------
 * Hardened Lean Coordinator V6.0
 * Hand-off orchestration to GitHub Actions for Institutional Stability.
 * Dispatch details (inputs, validation, error handling) live in
 * github-dispatch.js so they can be unit-tested.
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
    initWorkerSentry(null, env, ctx);

    return await step.run("github-dispatch", () =>
      runPulseDispatch({ eventData: event.data, env })
    );
  }
);
