/**
 * BlogsPro Sentry Webhook Worker
 *
 * Routes:
 *  POST /          — Receives Sentry webhook, sends Telegram alert with inline buttons
 *  POST /telegram  — Receives Telegram callback_query (button press) or /status command
 *  GET  /          — Health check
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ── Route: Telegram Bot updates (callback queries + commands) ──────────────
    if (url.pathname === '/telegram' && request.method === 'POST') {
      try {
        const body = await request.json();

        // Handle inline button press
        if (body.callback_query) {
          return await handleCallbackQuery(body.callback_query, env);
        }

        // Handle text commands
        if (body.message?.text) {
          return await handleCommand(body.message, env);
        }

        return new Response('OK');
      } catch (e) {
        return new Response('Bad Request', { status: 400 });
      }
    }

    // ── Route: Sentry Webhook ─────────────────────────────────────────────────
    if (request.method === 'POST') {
      try {
        const payload = await request.json();
        const issue = payload?.data?.issue;

        if (!issue) {
          return new Response('No issue data', { status: 400 });
        }

        const text = formatSentryAlert(issue);
        const replyMarkup = buildIssueKeyboard(issue);

        const sent = await sendTelegramMessage(env.TELEGRAM_TO, text, replyMarkup, env);
        if (!sent) return new Response('Failed to dispatch Telegram message', { status: 500 });

        return new Response('Alert forwarded successfully');
      } catch (e) {
        return new Response('Failed to dispatch Telegram message', { status: 500 });
      }
    }

    // ── Health check ──────────────────────────────────────────────────────────
    return new Response('BlogsPro Sentry Webhook — Active ✅');
  }
};

// ── Telegram Handlers ─────────────────────────────────────────────────────────

async function handleCallbackQuery(callbackQuery, env) {
  const data = callbackQuery.data || '';
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const originalText = callbackQuery.message.text || callbackQuery.message.caption || '';
  const user = callbackQuery.from.username
    ? `@${callbackQuery.from.username}`
    : callbackQuery.from.first_name;

  if (data.startsWith('resolve:')) {
    const issueId = data.split(':')[1];
    const resolved = await resolveSentryIssue(issueId, env);

    if (resolved) {
      await editTelegramMessage(
        chatId,
        messageId,
        originalText + `\n\n✅ <b>Resolved by ${user}</b>`,
        { inline_keyboard: [] }, // Remove buttons
        env
      );
      await answerCallbackQuery(callbackQuery.id, '✅ Marked as resolved in Sentry!', env);
    } else {
      await answerCallbackQuery(callbackQuery.id, '❌ Failed to resolve. Check Sentry auth.', env);
    }
  }

  return new Response('OK');
}

async function handleCommand(message, env) {
  const chatId = message.chat.id;
  const text = message.text.trim().toLowerCase();

  if (text === '/status' || text.startsWith('/status@')) {
    const issues = await fetchUnresolvedSentryIssues(env);

    if (!Array.isArray(issues) || issues.length === 0) {
      await sendTelegramMessage(
        chatId,
        '🟢 <b>Sentry Status: All Clear!</b>\nNo unresolved issues found.',
        null,
        env
      );
      return new Response('OK');
    }

    let reply = `🔴 <b>Sentry: ${issues.length} Unresolved Issue${issues.length > 1 ? 's' : ''}</b>\n\n`;
    const preview = issues.slice(0, 5);
    preview.forEach((issue, i) => {
      reply += `${i + 1}. <code>${escapeHtml(issue.title.substring(0, 80))}</code>\n`;
    });
    if (issues.length > 5) reply += `\n…and ${issues.length - 5} more.`;

    // Build resolve buttons for top 3 issues
    const keyboard = preview.slice(0, 3).map((issue, i) => ([
      { text: `✅ Resolve #${i + 1}`, callback_data: `resolve:${issue.id}` }
    ]));
    keyboard.push([{ text: '🔄 Refresh', callback_data: 'status_refresh' }]);

    await sendTelegramMessage(chatId, reply, { inline_keyboard: keyboard }, env);
    return new Response('OK');
  }

  if (text === '/help' || text.startsWith('/help@')) {
    await sendTelegramMessage(
      chatId,
      `🤖 <b>BlogsPro Sentry Bot</b>\n\n` +
      `/status — Show all unresolved Sentry issues\n` +
      `/help — Show this help message\n\n` +
      `Sentry alerts appear here automatically with a <b>Resolve</b> button.`,
      null,
      env
    );
    return new Response('OK');
  }

  // Handle /status refresh callback
  return new Response('OK');
}

// ── Formatting Helpers ────────────────────────────────────────────────────────

function formatSentryAlert(issue) {
  const env_label = issue.environment || 'production';
  const culprit = issue.culprit ? escapeHtml(issue.culprit) : 'Unknown';
  const title = escapeHtml((issue.title || 'Unknown Error').substring(0, 120));

  return (
    `🚨 <b>Sentry Alert — BlogsPro</b>\n\n` +
    `<b>Error:</b> <code>${title}</code>\n` +
    `<b>Culprit:</b> ${culprit}\n` +
    `<b>Environment:</b> ${env_label}\n` +
    `<b>Issue ID:</b> <code>${issue.id}</code>`
  );
}

function buildIssueKeyboard(issue) {
  const keyboard = [[
    { text: '✅ Resolve in Sentry', callback_data: `resolve:${issue.id}` }
  ]];
  if (issue.permalink) {
    keyboard[0].push({ text: '🔗 View Issue', url: issue.permalink });
  }
  return { inline_keyboard: keyboard };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Telegram API Helpers ──────────────────────────────────────────────────────

async function sendTelegramMessage(chatId, text, replyMarkup, env) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (replyMarkup) payload.reply_markup = replyMarkup;

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  return res.ok;
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup, env) {
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' };
  if (replyMarkup !== undefined) payload.reply_markup = replyMarkup;

  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/editMessageText`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
}

async function answerCallbackQuery(callbackQueryId, text, env) {
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/answerCallbackQuery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: true })
    }
  );
}

// ── Sentry API Helpers ────────────────────────────────────────────────────────

async function resolveSentryIssue(issueId, env) {
  const url = `https://sentry.io/api/0/projects/${env.SENTRY_ORG}/${env.SENTRY_PROJECT}/issues/${issueId}/`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ status: 'resolved' })
  });
  return res.ok;
}

async function fetchUnresolvedSentryIssues(env) {
  const url = `https://sentry.io/api/0/projects/${env.SENTRY_ORG}/${env.SENTRY_PROJECT}/issues/?query=${encodeURIComponent('is:unresolved')}&limit=25`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.SENTRY_AUTH_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) return [];
  return await res.json();
}
