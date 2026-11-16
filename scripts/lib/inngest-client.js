import { Inngest } from "inngest";

/**
 * Inngest client for the pulse worker.
 *
 * No signing key is set here. The `serve()` handler calls
 * `client.setEnvVars(env)` with the Worker bindings on every request, and the
 * client then reads `INNGEST_SIGNING_KEY` from them (the `[env.pulse.vars]`
 * entry or a `wrangler secret`). Keys must never be committed in source.
 */
export const inngest = new Inngest({ id: "blogspro-swarm" });

/**
 * Client for sending events from a Worker, with keys taken from its env.
 * @param {{ INNGEST_EVENT_KEY?: string, INNGEST_SIGNING_KEY?: string }} [env]
 * @returns {Inngest}
 */
export const getInngestClient = (env) => {
  return new Inngest({
    id: "blogspro-swarm",
    eventKey: env?.INNGEST_EVENT_KEY || "local-dummy-key",
    signingKey: env?.INNGEST_SIGNING_KEY,
  });
};
