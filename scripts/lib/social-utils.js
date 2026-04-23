/**
 * social-utils.js
 * =================
 * BlogsPro Social & Notification Interface.
 */

/**
 * Dispatches a high-density strategic alert to a configured webhook.
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

function escapeHTML(str) {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Dispatches a Telegram notification using the Bot API.
 */
export async function dispatchTelegramAlert(summary, env) {
  const { sendStandardizedTelegram } = await import("./notification-service.js");
  
  // 1. [V1.1] JSON AUTO-PARSER: Clean up AI "JSON leakage" in abstract
  let cleanAbstract = summary.abstract || "";
  let cleanTitle = summary.title || "Institutional Strategic Pulse";
  let cleanLink = summary.url || summary.link || "https://blogspro.in/pulse";

  if (typeof cleanAbstract === 'string' && cleanAbstract.trim().startsWith('{')) {
    try {
      // Strip potential markdown code blocks first
      const jsonStr = cleanAbstract.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      cleanTitle = parsed.title || cleanTitle;
      cleanAbstract = parsed.abstract || parsed.summary || parsed.excerpt || cleanAbstract;
      if (parsed.link && parsed.link.includes('https://')) {
          // Only override link if it looks like a real institutional URL, not a placeholder
          if (!parsed.link.includes('example.com')) cleanLink = parsed.link;
      }
    } catch (e) {
      console.warn("⚠️ [Social-Bridge] Failed to parse JSON abstract, using raw fallback.");
    }
  }

  // 2. [V1.2] AESTHETIC REFINEMENT: Sectional Hardening
  const freq = (summary.frequency || "Strategic").toUpperCase();
  const icon = summary.isGhost ? "👻 <b>[GHOST_MODE]</b>" : "🚨";
  
  const safeTitle = escapeHTML(cleanTitle);
  const safeAbstract = escapeHTML(cleanAbstract.replace(/<[^>]*>?/gm, '')); // Secondary tag-strip
  const safeWordCount = escapeHTML(String(summary.wordCount || 0));

  const text = `${icon} <b>${freq} Strategic Pulse</b>\n` +
               `━━━━━━━━━━━━━━━━━━━━\n\n` +
               `<b>${safeTitle}</b>\n\n` +
               `<i>${safeAbstract}</i>\n\n` +
               `📊 <b>Density:</b> ${safeWordCount} words\n` +
               `🚀 <b>Registry:</b> Institutional-AI\n\n` +
               `🔗 <a href="${cleanLink}"><b>View Full Manuscript</b></a>`;
  
  const res = await sendStandardizedTelegram(text, env, { parseMode: 'HTML' });
  return res.success;
}
