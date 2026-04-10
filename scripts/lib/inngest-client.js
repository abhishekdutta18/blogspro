import { Inngest } from "inngest";

export const INNGEST_SIGNING_KEY = "signkey-prod-da8bf4172979eda4d892588ea271764fc3989d474a260eddbbd846b5aab8406a";

export const inngest = new Inngest({ 
  id: "blogspro-swarm",
  signingKey: INNGEST_SIGNING_KEY 
});

/**
 * Institutional Inngest Dispatcher
 * Allows passing Cloudflare Env to ensure keys are populated for event sending.
 */
export const getInngestClient = (env) => {
  return new Inngest({ 
    id: "blogspro-swarm",
    eventKey: env?.INNGEST_EVENT_KEY || "local-dummy-key",
    signingKey: env?.INNGEST_SIGNING_KEY || INNGEST_SIGNING_KEY
  });
};
