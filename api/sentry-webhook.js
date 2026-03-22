export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    try {
      const payload = await request.json();
      
      // Sentry webhook payloads typically wrap the core data in 'data.issue' or just the raw object depending on the integration type
      const issue = payload?.data?.issue || payload?.data?.error || payload;

      if (!issue || !issue.title) {
        return new Response('Ignored: Payload did not contain an issue title', { status: 200 });
      }

      const title   = issue.title;
      const project = issue.project?.name || issue.project || 'BlogsPro';
      const envName = issue.environment || 'production';
      const link    = issue.permalink || issue.url || 'No link provided';
      const culprit = issue.culprit || 'Unknown origin';

      const message = `🚨 <b>New Sentry Alert!</b>\n\n` +
                      `<b>Environment:</b> ${envName}\n` +
                      `<b>Error:</b> ${title}\n` +
                      `<b>Culprit:</b> <code>${culprit}</code>\n\n` +
                      `<a href="${link}">View Full Trace in Sentry</a>`;

      const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`;
      const tgRes = await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_TO,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        })
      });

      if (!tgRes.ok) {
        console.error('Telegram API Failed:', await tgRes.text());
        return new Response('Failed to dispatch Telegram message', { status: 500 });
      }

      return new Response('Alert forwarded successfully', { status: 200 });

    } catch (err) {
      console.error('Webhook processing failed:', err);
      // We return 200 even on parse errors so Sentry doesn't aggressively retry malformed payloads
      return new Response('Webhook parsing failed', { status: 200 });
    }
  }
};
