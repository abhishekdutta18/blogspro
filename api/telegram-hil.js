import { saveDocument, isStoreConfigured } from '../scripts/lib/vps-store.js';

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
          const rawJobId = data.split(':')[1] || '';
          const jobId = rawJobId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
          if (!jobId) return new Response('Invalid job ID', { status: 400 });
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
   * Marks institutional_audits/<jobId> APPROVED on the BlogsPro API.
   * @returns {Promise<boolean>} true when stored
   */
  async approveInstitutionalJob(jobId, env) {
    if (!jobId || !isStoreConfigured(env)) return false;
    const stored = await saveDocument('institutional_audits', {
      status: 'APPROVED',
      timestamp: new Date().toISOString()
    }, env, jobId);
    return Boolean(stored);
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
          await fetch(`${url}${encodeURIComponent(env.INNGEST_EVENT_KEY)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
          });
      } catch (e) {
          console.error("Inngest Event Dispatch Fail:", e.message);
      }
  }
};
