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
