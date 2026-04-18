/**
 * BlogsPro Institutional Vault (Cloudflare Worker)
 * Purpose: Securely serve AI API keys to the BlogsPro swarm.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // 1. Institutional Security Handshake
    const authHeader = request.headers.get("X-Vault-Secret");
    if (authHeader !== env.VAULT_SECRET) {
      return new Response("Unauthorized: Invalid Institutional Secret", { status: 401 });
    }

    // 2. Routing Logic
    if (url.pathname === "/fetch-key") {
      const keyType = url.searchParams.get("type") || "gemini";
      
      let key = "";
      if (keyType === "gemini") {
        key = env.GEMINI_API_KEY;
      } else if (keyType === "sambanova") {
        key = env.SAMBANOVA_API_KEY;
      }

      if (!key) {
        return new Response("Key not found in Vault environment", { status: 404 });
      }

      return new Response(JSON.stringify({ key }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("BlogsPro Vault Active", { status: 200 });
  },
};
