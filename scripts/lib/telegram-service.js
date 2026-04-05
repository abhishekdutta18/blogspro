/**
 * BlogsPro Telegram HIL Service (V1.0)
 * ====================================
 * Outbound signaling for Human-in-the-Loop review.
 */

export async function sendManuscriptAlert(auditId, excerpt, env = null) {
    const token = env?.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = env?.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
    const hilUrl = env?.HIL_STATION_URL || "https://hil.blogspro.in";

    if (!token || !chatId) {
        console.warn("⚠️ [Telegram] Missing Bot Token or Admin Chat ID. Telegram alert skipped.");
        return;
    }

    const text = `🕵️ *HIL AUDIT REQUIRED*\n\n*ID:* \`${auditId}\`\n\n*Excerpt:* \n_${excerpt.substring(0, 300)}..._\n\n[Review Full Manuscript](${hilUrl}?token=${env?.SWARM_INTERNAL_TOKEN || process.env.SWARM_INTERNAL_TOKEN})`;
    
    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ APPROVE", callback_data: `approve:${auditId}` },
                { text: "❌ REJECT", callback_data: `reject:${auditId}` }
            ]]
        }
    };

    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(`Telegram API Error: ${data.description}`);
        }
        
        console.log(`📡 [Telegram] HIL Alert sent for: ${auditId}`);
    } catch (error) {
        console.error(`❌ [Telegram] Failed to send alert: ${error.message}`);
    }
}
