/**
 * BlogsPro Notification Service (V14.1)
 * -------------------------------------
 * Decentralized dispatch for all Telegram communications.
 * Respects multi-variant naming conventions across the institutional ecosystem.
 */

import { captureSwarmError } from './sentry-bridge.js';

export async function sendStandardizedTelegram(text, env = {}, options = {}) {
    // [V14.1] Decentralized Tiered Resolution
    // Supports 5+ naming variants without enforcing a single standard
    const credentials = {
        token: env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN || env.BOT_TOKEN || 
               (typeof process !== 'undefined' ? (process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN) : null),
        chatId: env.TELEGRAM_CHAT_ID || env.TELEGRAM_TO || env.TELEGRAM_ADMIN_CHAT_ID || env.CHAT_ID || 
                (typeof process !== 'undefined' ? (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_TO || process.env.TELEGRAM_ADMIN_CHAT_ID || process.env.CHAT_ID) : null)
    };

    if (!credentials.token || !credentials.chatId) {
        console.warn("⚠️ [Notification-Service] Partial Credentials detected. Dispatch might fail.");
    }

    const { token, chatId } = credentials;
    if (!token || !chatId) {
        return { success: false, error: "CREDENTIALS_EXHAUSTED" };
    }

    const payload = {
        chat_id: chatId,
        text: text,
        parse_mode: options.parseMode || 'HTML',
        disable_web_page_preview: options.disablePreview !== undefined ? options.disablePreview : true
    };
    if (options.replyMarkup) payload.reply_markup = options.replyMarkup;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            const errorMsg = data.description || "Unknown Telegram Error";
            let advisory = "";
            
            if (res.status === 400 && errorMsg.includes("chat not found")) {
                advisory = " | ADVISORY: Verify if the bot is a member of the target group and if the Chat ID is correct.";
            } else if (res.status === 401) {
                advisory = " | ADVISORY: The Bot Token is invalid or has been revoked.";
            } else if (res.status === 403) {
                advisory = " | ADVISORY: The bot was blocked by the user or removed from the group.";
            }

            console.error(`❌ [Notification-Service] API Error: ${res.status} - ${errorMsg}${advisory}`);
            console.log(`🔍 [Notification-Service] Metadata: { chatId: ${chatId}, tokenExists: ${!!token} }`);
            
            captureSwarmError(new Error(`Telegram Dispatch Failed: ${errorMsg}`), { 
                component: 'notification-service', 
                chatId, 
                statusCode: res.status,
                advisory 
            });

            return { success: false, error: errorMsg, code: res.status, data };
        }

        console.log(`✅ [Notification-Service] Dispatch Success -> MessageID: ${data.result?.message_id} (Chat: ${chatId})`);
        return { success: true, messageId: data.result?.message_id };
    } catch (err) {
        console.error("❌ [Notification-Service] Dispatch Exception:", err.message);
        captureSwarmError(err, { component: 'notification-service', text: text.substring(0, 100) });
        return { success: false, error: err.message };
    }
}
