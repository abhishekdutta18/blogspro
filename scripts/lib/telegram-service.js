/**
 * BlogsPro Telegram HIL Service (V1.1)
 * ====================================
 * Outbound signaling for Human-in-the-Loop review.
 * Fix: Uses HTML mode with escaping to prevent 400 errors.
 */

function escapeHTML(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export async function sendManuscriptAlert(auditId, excerpt, env = null) {
    const token = env?.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = env?.TELEGRAM_ADMIN_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID;
    const hilUrl = env?.HIL_STATION_URL || "https://hil.blogspro.in";

    if (!token || !chatId) {
        console.warn("⚠️ [Telegram] Missing Bot Token or Admin Chat ID. Telegram alert skipped.");
        return;
    }

    const isGhost = excerpt.includes('ghost-metadata');
    const icon = isGhost ? "👻 <b>GHOST AUDIT</b>" : "🕵️ <b>HIL AUDIT REQUIRED</b>";
    
    // Clean excerpt: Remove ghost metadata tags and then escape for HTML
    const cleanedExcerpt = excerpt.replace(/<ghost-metadata.*?\/>/g, '').trim();
    const safeExcerpt = escapeHTML(cleanedExcerpt.substring(0, 500));
    const safeAuditId = escapeHTML(auditId);
    
    const hilLink = `${hilUrl}?token=${env?.SWARM_INTERNAL_TOKEN || process.env.SWARM_INTERNAL_TOKEN}`;

    const text = `${icon}\n\n` +
                 `<b>ID:</b> <code>${safeAuditId}</code>\n\n` +
                 `<b>Excerpt:</b>\n<i>${safeExcerpt}...</i>\n\n` +
                 `<a href="${hilLink}">Review Full Manuscript</a>`;
    
    // Limit callback data to 64 bytes (Telegram requirement)
    // If ID is too long, we use a truncated version or just a generic 'review'
    const shortAuditId = auditId.length > 50 ? auditId.substring(0, 50) : auditId;

    const body = {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ APPROVE", callback_data: `approve:${shortAuditId}` },
                { text: "❌ REJECT", callback_data: `reject:${shortAuditId}` }
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
