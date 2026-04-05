/**
 * social-utils.js
 * =================
 * BlogsPro Social & Notification Interface.
 * Dispatches strategic summaries to Slack, Discord, and other 
 * institutional desks.
 */

/**
 * Dispatches a high-density strategic alert to a configured webhook.
 * Supports Slack and Discord payload formats.
 */
export async function dispatchInstitutionalAlert(summary, webhookUrl) {
  if (!webhookUrl) {
    console.warn("⚠️ [Social] Webhook URL not provided. Skipping notification.");
    return false;
  }

  const isDiscord = webhookUrl.includes("discord.com");
  
  const payload = isDiscord ? {
    username: "BlogsPro Intelligence",
    content: "🚨 **Institutional Strategic Alert**",
    embeds: [{
      title: summary.title,
      description: summary.excerpt,
      color: 12558592, // Goldish-Black
      fields: [
        { name: "Frequency", value: summary.frequency.toUpperCase(), inline: true },
        { name: "Word Count", value: String(summary.wordCount), inline: true },
        { name: "Alpha Signal", value: "HIGH_DENSITY", inline: true }
      ],
      footer: { text: "BlogsPro Swarm 4.0 | MiroFish Consensus" }
    }]
  } : {
    // Slack Payload
    text: `🚨 *Institutional Strategic Alert: ${summary.title}*`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${summary.title}*\n_${summary.excerpt}_` }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Frequency:*\n${summary.frequency.toUpperCase()}` },
          { type: "mrkdwn", text: `*Word Density:*\n${summary.wordCount} words` }
        ]
      },
      {
        type: "divider"
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "BlogsPro Swarm 4.0 | MiroFish Consensus" }]
      }
    ]
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log("💎 [Social] Strategic notification dispatched successfully.");
      return true;
    } else {
      console.error("❌ [Social] Webhook dispatch failed:", await res.text());
      return false;
    }
  } catch (e) {
    console.error("❌ [Social] Webhook error:", e.message);
    return false;
  }
}

/**
 * Dispatches a Telegram notification using the Bot API.
 */
export async function dispatchTelegramAlert(summary, env) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    console.warn("⚠️ [Telegram] Bot token or Chat ID missing.");
    return false;
  }

  const text = `🚨 *${summary.title}*\n\n${summary.abstract}\n\n📊 *Word Count:* ${summary.wordCount}\n🔗 [View Full Manuscript](https://blogspro.in/pulse)`;

  try {
    const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });

    if (res.ok) {
      console.log("💎 [Telegram] Strategic alert dispatched.");
      return true;
    } else {
      console.error("❌ [Telegram] API Error:", await res.text());
      return false;
    }
  } catch (e) {
    console.error("❌ [Telegram] Dispatch failed:", e.message);
    return false;
  }
}
