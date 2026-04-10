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
        disable_web_page_preview: options.disablePreview !== undefined ? options.disablePreview : true,
        reply_markup: options.replyMarkup || null
    };

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.text();
            throw new Error(`Telegram API Error: ${res.status} ${errData}`);
        }

        return { success: true };
    } catch (err) {
        console.error("❌ [Notification-Service] Dispatch Failed:", err.message);
        captureSwarmError(err, { component: 'notification-service', text: text.substring(0, 50) });
        return { success: false, error: err.message };
    }
}
