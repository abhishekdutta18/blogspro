/**
 * 📡 [V8.4] BlogsPro Telegram HIL-Consensus Relay (Standalone Worker)
 * $0 Serverless Bridge for remote institutional synthesis approval.
 */

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const payload = await request.json();
      
      // 1. Handle Telegram Callback Query (Inline Keyboard Buttons)
      if (payload.callback_query) {
        const query = payload.callback_query;
        const data = query.data; // e.g., "approve:2ce40af4"
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        if (data.startsWith('approve:')) {
          const jobId = data.split(':')[1];
          const success = await this.approveInstitutionalJob(jobId, env);

          // [V8.5] Relay Consensus Signal to Inngest (Serverless Wake-up)
          if (success) await this.sendInngestEvent(jobId, env);

          // Notify Telegram of the outcome
          const text = success 
            ? `✅ <b>Approved:</b> Institutional Tome [<code>${jobId}</code>] released for publication.` 
            : `❌ <b>Failed:</b> Could not process approval for [<code>${jobId}</code>]. Check Firestore.`;
          
          await this.answerCallbackQuery(query.id, success ? "Approved!" : "Approval Failed", env);
          await this.editMessage(chatId, messageId, text, env);

          return new Response('OK', { status: 200 });
        }
      }

      return new Response('Ignored', { status: 200 });
    } catch (err) {
      console.error('Telegram HIL Bridge Error:', err);
      return new Response('Internal Error', { status: 500 });
    }
  },

  /**
   * Updates Firestore document to APPROVED status
   */
  async approveInstitutionalJob(jobId, env) {
    if (!env || !env.FIREBASE_PROJECT_ID) return false;

    const url = `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/institutional_audits/${jobId}?updateMask.fieldPaths=status&updateMask.fieldPaths=timestamp`;

    try {
      const token = await this.getGoogleAccessToken(env);
      if (!token) return false;

      const headers = { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      const payload = {
        fields: {
          status: { stringValue: "APPROVED" },
          timestamp: { stringValue: new Date().toISOString() }
        }
      };

      const res = await fetch(url, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify(payload)
      });

      return res.ok;
    } catch (e) {
      console.error('Firestore PATCH Error:', e.message);
      return false;
    }
  },

  async getGoogleAccessToken(env) {
    if (!env.FIREBASE_SERVICE_ACCOUNT) return null;
    const sa = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);
    
    // JWT Generation (simplified for Worker environment)
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g, "");
    const payload = btoa(JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/datastore",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
    })).replace(/=/g, "");

    const message = `${header}.${payload}`;
    const pemContents = sa.private_key
        .replace(/-----BEGIN PRIVATE KEY-----/g, "")
        .replace(/-----END PRIVATE KEY-----/g, "")
        .replace(/\s+/g, "");
    const binaryDer = Uint8Array.from(atob(pemContents).split("").map(c => c.charCodeAt(0)));

    const key = await crypto.subtle.importKey(
        "pkcs8", binaryDer,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false, ["sign"]
    );
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(message));
    const encodedSig = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

    const jwt = `${message}.${encodedSig}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });
    const data = await res.json();
    return data.access_token;
  },

  async answerCallbackQuery(callbackQueryId, text, env) {
    const token = env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN;
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  },

  async editMessage(chatId, messageId, text, env) {
    const token = env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN;
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        chat_id: chatId, 
        message_id: messageId, 
        text, 
        parse_mode: 'HTML' 
      })
    });
  },

  /**
   * Dispatches consensus signal to Inngest Event Bridge
   */
  async sendInngestEvent(jobId, env) {
      if (!env.INNGEST_EVENT_KEY) return;
      
      const url = env.INNGEST_URL || "https://inn.blogspro.in/e/";
      const payload = [{
          name: "swarm/manuscript.approved",
          data: { jobId },
          timestamp: Date.now()
      }];

      try {
          await fetch(`${url}${env.INNGEST_EVENT_KEY}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
      } catch (e) {
          console.error("Inngest Event Dispatch Fail:", e.message);
      }
  }
};
