import { Inngest } from "inngest";

/**
 * Inngest client used by the `/api/inngest` serve handler.
 * Keys are never hardcoded: `serve()` hands the Worker `env` to the client,
 * which then reads INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY from Wrangler secrets.
 */
export const inngest = new Inngest({
  id: "blogspro-swarm"
});

/**
 * Institutional Inngest Dispatcher
 * Allows passing Cloudflare Env to ensure keys are populated for event sending.
 * Keys come only from Wrangler secrets (`npx wrangler secret put ... --env pulse`).
 * @param {{ INNGEST_EVENT_KEY?: string, INNGEST_SIGNING_KEY?: string }} [env]
 * @returns {Inngest}
 */
export const getInngestClient = (env) => {
  return new Inngest({
    id: "blogspro-swarm",
    eventKey: env?.INNGEST_EVENT_KEY || "local-dummy-key",
    signingKey: env?.INNGEST_SIGNING_KEY
  });
};
