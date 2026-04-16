/**
 * Telegram Diagnostic Tool (V1.0)
 * ------------------------------
 * Verifies bot token validity and retrieves recent updates to identify correct Chat IDs.
 */
import 'dotenv/config';

async function diagnose() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error("❌ No TELEGRAM_BOT_TOKEN found in .env");
        return;
    }

    console.log(`📡 [Diagnostic] Testing Bot Token: ${token.split(':')[0]}:[REDACTED]`);

    // 1. Test /getMe
    try {
        const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const meData = await meRes.json();
        if (meData.ok) {
            console.log(`✅ [getMe] Active Bot: @${meData.result.username} (ID: ${meData.result.id})`);
        } else {
            console.error(`❌ [getMe] Failed: ${meData.description}`);
            return;
        }
    } catch (e) {
        console.error(`❌ [getMe] Network error: ${e.message}`);
        return;
    }

    // 1.5 Delete Webhook to allow getUpdates
    try {
        console.log("🧹 [Diagnostic] Clearing active webhooks to enable manual polling...");
        await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    } catch (e) {}

    // 2. Test /getUpdates
    try {
        console.log("🔍 [getUpdates] Searching for recent group interactions...");
        const upRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        const upData = await upRes.json();
        
        if (!upData.ok) {
            console.error(`❌ [getUpdates] Failed: ${upData.description}`);
            return;
        }

        if (upData.result.length === 0) {
            console.warn("⚠️ [getUpdates] No recent updates found. TIP: Send a message to the bot or add it to a group now.");
        } else {
            console.log(`📝 [getUpdates] Found ${upData.result.length} recent interactions:`);
            upData.result.forEach(update => {
                const chat = update.message?.chat || update.my_chat_member?.chat;
                if (chat) {
                    console.log(`   - Chat Title: "${chat.title || 'Private'}" | ID: ${chat.id} | Type: ${chat.type}`);
                }
            });
        }
    } catch (e) {
        console.error(`❌ [getUpdates] Network error: ${e.message}`);
    }

    // 3. Verify specifically the ID in .env
    const envId = process.env.TELEGRAM_CHAT_ID;
    if (envId) {
        console.log(`\n🧐 [Target-Check] Verifying Chat ID from .env: ${envId}`);
        try {
            const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${envId}`);
            const chatData = await chatRes.json();
            if (chatData.ok) {
                console.log(`✅ [getChat] Found target: "${chatData.result.title}" (Type: ${chatData.result.type})`);
            } else {
                console.warn(`❌ [getChat] Target NOT FOUND: ${chatData.description}`);
            }
        } catch (e) {
            console.error(`❌ [getChat] Network error: ${e.message}`);
        }
    }
}

diagnose();
