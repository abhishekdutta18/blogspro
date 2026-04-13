
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

async function diagnose() {
    console.log("🔍 [Telegram-Diag] Verifying Bot Configuration...");
    console.log(`📡 Token present: ${token ? '✅' : '❌'}`);
    console.log(`📡 Chat ID: ${chatId}`);

    if (!token) {
        console.error("❌ Aborting: No token found.");
        return;
    }

    try {
        // 1. Check Bot Identity
        const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const meData = await meRes.json();
        if (meData.ok) {
            console.log(`✅ Bot Identity: @${meData.result.username} (${meData.result.first_name})`);
        } else {
            console.error("❌ Bot Identity Failure:", meData.description);
            return;
        }

        // 2. Check for Updates (find correct chat ID)
        console.log("🕵️ Checking recent updates for chat activity...");
        const updatesRes = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
        const updatesData = await updatesRes.json();
        if (updatesData.ok && updatesData.result.length > 0) {
            console.log(`📢 Found ${updatesData.result.length} recent events.`);
            updatesData.result.forEach(u => {
                const chat = u.message?.chat || u.channel_post?.chat;
                if (chat) {
                    console.log(`   🔸 Event in Chat: ${chat.title || 'Private'} (ID: ${chat.id})`);
                }
            });
        } else {
            console.log("⚠️ No recent updates found. Send a message to the bot or add it to a group.");
        }

        // 3. Test Message
        console.log(`🚀 Attempting test dispatch to ${chatId}...`);
        const sendRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "🛠️ <b>BlogsPro Operational Audit</b>\nSystem is verifying the Telegram Notification Cascade.\n\nStatus: <i>Hardening in Progress</i>",
                parse_mode: 'HTML'
            })
        });
        const sendData = await sendRes.json();
        if (sendRes.ok) {
            console.log("✅ Dispatch Successful! Message ID:", sendData.result.message_id);
        } else {
            console.error(`❌ Dispatch Failed: ${sendRes.status} - ${sendData.description}`);
            if (sendData.description.includes("chat not found")) {
                console.log("💡 LOGIC: The chat ID is likely incorrect or the bot was kicked from the group.");
            }
        }

    } catch (err) {
        console.error("❌ Diagnostic Exception:", err.message);
    }
}

diagnose();
