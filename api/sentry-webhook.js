// api/sentry-webhook.js
// A Cloudflare Worker script that catches Sentry Webhook Integration payloads and forwards them to Telegram.
// You can deploy this to Cloudflare Workers using your existing setup.

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const payload = await request.json();
      
      // Sentry sends issue details or action blocks
      const issue = payload.data?.issue || payload;
      const project = issue.project?.name || 'Unknown Project';
      const title = issue.title || 'Unknown Error';
      const url = issue.url || 'https://sentry.io';
      const envName = issue.environment || 'production';
      
      const message = `🚨 *Sentry Alert: ${project}*\n\n`
                    + `*Environment:* ${envName}\n`
                    + `*Error:* ${title}\n\n`
                    + `[View complete stack trace in Sentry](${url})`;

      const telegramUrl = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
      await fetch(telegramUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: message,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });

      return new Response('Webhook processed successfully', { status: 200 });

    } catch (error) {
      console.error('Error processing Sentry webhook:', error);
      return new Response('Error processing webhook', { status: 500 });
    }
  }
};
