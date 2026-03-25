/**
 * BlogsPro Sentry + GitHub + Telegram Bot Worker
 *
 * Routes:
 *  GET  /               — Health check
 *  GET  /setup-webhook  — Register Telegram webhook (visit once after deploy)
 *  POST /               — Sentry alert webhook
 *  POST /telegram       — Telegram bot updates (commands + inline buttons)
 *  POST /github         — GitHub webhook (push, PRs, issues, workflow runs)
 *
 * Scheduled:
 *  Daily 09:00 UTC      — Summary: Sentry issues + subscribers + new posts
 *
 * Bot Commands:
 *  /status              — Unresolved Sentry issues with Resolve buttons
 *  /subscribers         — Newsletter subscriber count from Firestore
 *  /posts               — Last 5 published posts from Firestore
 *  /deploy              — Trigger GitHub Pages deploy via workflow_dispatch
 *  /resolve all         — Bulk-resolve all unresolved Sentry issues
 *  /help                — Full command reference
 *
 * GitHub Webhook Setup (one-time, manual):
 *  Repo → Settings → Webhooks → Add webhook
 *  URL: https://blogspro-sentry-webhook.abhishek-dutta1996.workers.dev/github
 *  Content type: application/json
 *  Secret: value of GITHUB_WEBHOOK_SECRET worker secret
 *  Events: Pushes, Pull requests, Issues, Workflow runs
 */

export default {
  // ── HTTP handler ──────────────────────────────────────────────────────────
  async fetch(request, env) {
    const url = new URL(request.url);

    // Register Telegram webhook (GET /setup-webhook)
    if (url.pathname === '/setup-webhook' && request.method === 'GET') {
      return handleSetupWebhook(url, env);
    }

    // Telegram bot updates (POST /telegram)
    if (url.pathname === '/telegram' && request.method === 'POST') {
      return handleTelegramUpdate(request, env);
    }

    // GitHub webhook (POST /github)
    if (url.pathname === '/github' && request.method === 'POST') {
      return handleGithubWebhook(request, env);
    }

    // Newsletter broadcast (POST /newsletter)
    if (url.pathname === '/newsletter' && request.method === 'POST') {
      return handleNewsletterRequest(request, env);
    }

    // New registration notify (POST /notify-registration)
    if (url.pathname === '/notify-registration' && request.method === 'POST') {
      return handleRegistrationNotify(request, env);
    }

    // Sentry alert (POST /)
    if (request.method === 'POST') {
      return handleSentryWebhook(request, env);
    }

    // Health check (GET /)
    return new Response(
      'BlogsPro Unified Bot — Active ✅\n' +
      'Routes: /setup-webhook  /telegram  /github  /newsletter  /notify-registration  POST /\n' +
      'Commands: /status  /subscribers  /posts  /deploy  /resolve all  /broadcast  /stats  /help',
      { headers: { 'Content-Type': 'text/plain' } }
    );
  },

  // ── Cron: daily summary ───────────────────────────────────────────────────
  async scheduled(_event, env, _ctx) {
    await sendDailySummary(env);
  }
};

// ══════════════════════════════════════════════════════════════════════════════
// SETUP WEBHOOK
// ══════════════════════════════════════════════════════════════════════════════

async function handleSetupWebhook(url, env) {
  if (!env.TELEGRAM_TOKEN) {
    return new Response('❌ TELEGRAM_TOKEN not set', { status: 500 });
  }
  const workerBase = `${url.protocol}//${url.host}`;
  const webhookUrl = `${workerBase}/telegram`;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['message', 'callback_query']
      })
    }
  );
  const data = await res.json();
  if (data.ok) {
    return new Response(`✅ Telegram webhook registered:\n${webhookUrl}\n\n/status and button presses are now active.`);
  }
  return new Response(`❌ setWebhook failed: ${JSON.stringify(data)}`, { status: 500 });
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM UPDATE HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleTelegramUpdate(request, env) {
  try {
    const body = await request.json();
    if (body.callback_query) return handleCallbackQuery(body.callback_query, env);
    if (body.message?.text)  return handleCommand(body.message, env);
    return new Response('OK');
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
}

// ── Inline button handler ─────────────────────────────────────────────────

async function handleCallbackQuery(cq, env) {
  const data     = cq.data || '';
  const chatId   = cq.message.chat.id;
  const msgId    = cq.message.message_id;
  const origText = cq.message.text || cq.message.caption || '';
  const user     = cq.from.username ? `@${cq.from.username}` : cq.from.first_name;

  // ✅ Resolve single Sentry issue
  if (data.startsWith('resolve:')) {
    const issueId = data.split(':')[1];
    const ok = await resolveSentryIssue(issueId, env);
    if (ok) {
      await editTelegramMessage(chatId, msgId, origText + `\n\n✅ <b>Resolved by ${escapeHtml(user)}</b>`, { inline_keyboard: [] }, env);
      await answerCallbackQuery(cq.id, '✅ Resolved in Sentry!', env);
    } else {
      await answerCallbackQuery(cq.id, '❌ Failed. Check SENTRY_AUTH_TOKEN.', env);
    }
  }

  // ✅ Confirm bulk resolve
  else if (data === 'resolve_all_confirm') {
    await answerCallbackQuery(cq.id, '⏳ Resolving all issues…', env);
    const issues = await fetchUnresolvedSentryIssues(env);
    if (!Array.isArray(issues) || issues.length === 0) {
      await sendTelegramMessage(chatId, '🟢 No open issues to resolve.', null, env);
    } else {
      let resolved = 0;
      for (const issue of issues) {
        if (await resolveSentryIssue(issue.id, env)) resolved++;
      }
      await sendTelegramMessage(chatId, `✅ <b>Bulk resolved ${resolved}/${issues.length} issues.</b>`, null, env);
    }
  }

  // ✅ Status Refresh
  else if (data === 'status_refresh') {
    await answerCallbackQuery(cq.id, '🔄 Refreshing…', env);
    await handleCommand({ chat: { id: chatId }, text: '/status' }, env);
  }

  // ✅ Approve User Role
  else if (data.startsWith('approve:')) {
    const [_, uid, role] = data.split(':');
    const ok = await updateUserRole(uid, role, env);
    if (ok) {
      await editTelegramMessage(chatId, msgId, origText + `\n\n✅ <b>Approved ${role.toUpperCase()} by ${escapeHtml(user)}</b>`, { inline_keyboard: [] }, env);
      await answerCallbackQuery(cq.id, `✅ User approved as ${role}!`, env);
    } else {
      await answerCallbackQuery(cq.id, '❌ Approval failed. Check Firestore API Key.', env);
    }
  }

  // ❌ Reject User Role
  else if (data.startsWith('reject:')) {
    const uid = data.split(':')[1];
    await editTelegramMessage(chatId, msgId, origText + `\n\n❌ <b>Rejected by ${escapeHtml(user)}</b>`, { inline_keyboard: [] }, env);
    await answerCallbackQuery(cq.id, '❌ Request rejected.', env);
  }

  return new Response('OK');
}

// ── Command handler ───────────────────────────────────────────────────────

async function handleCommand(message, env) {
  const chatId = message.chat.id;
  const raw    = (message.text || '').trim();
  const lower  = raw.toLowerCase();
  const cmd    = lower.split('@')[0]; // strip @botname suffix

  // ── Greetings / Feature List ("hi", "hello", "hola") ───────────────────────
  if (['hi', 'hello', 'hola'].includes(cmd) || cmd === 'hi' || cmd === 'hello') {
    await sendTelegramMessage(chatId,
      `👋 <b>Welcome to BlogsPro!</b>\n\n` +
      `Here are the features of our platform:\n\n` +
      `🚀 <b>Fintech & Strategy Insights</b>\n` +
      `🔍 <b>Advanced Search & Filtering</b>\n` +
      `📧 <b>AI-Powered Newsletters</b>\n` +
      `⚙️ <b>Admin Dashboard for Creators</b>\n` +
      `🚨 <b>Real-time Sentry Error Monitoring</b>\n` +
      `🤖 <b>AI-Driven Bug Auto-Resolution</b>\n` +
      `📦 <b>GitHub Integrated CI/CD</b>\n` +
      `🌙 <b>Dark/Light Mode Theme Toggle</b>\n\n` +
      `<a href="https://blogspro.in">Visit blogspro.in →</a>\n\n` +
      `Try /help to see all available bot commands.`,
      null, env
    );
    return new Response('OK');
  }

  // ── /status ──────────────────────────────────────────────────────────────
  if (cmd === '/status') {
    if (!env.SENTRY_ORG || !env.SENTRY_PROJECT || !env.SENTRY_AUTH_TOKEN) {
      await sendTelegramMessage(chatId, '⚠️ <b>Sentry config missing.</b>\nSet SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN on the worker.', null, env);
      return new Response('OK');
    }
    const issues = await fetchUnresolvedSentryIssues(env);
    if (issues === null) {
      await sendTelegramMessage(chatId, '❌ <b>Sentry fetch failed.</b>\nCheck credentials in worker secrets.', null, env);
      return new Response('OK');
    }
    if (issues.length === 0) {
      await sendTelegramMessage(chatId, '🟢 <b>All Clear!</b>\nNo unresolved Sentry issues.', null, env);
      return new Response('OK');
    }
    const preview = issues.slice(0, 5);
    let reply = `🔴 <b>Sentry: ${issues.length} Unresolved Issue${issues.length !== 1 ? 's' : ''}</b>\n\n`;
    preview.forEach((issue, i) => {
      reply += `${i + 1}. <code>${escapeHtml(issue.title.substring(0, 80))}</code>\n`;
    });
    if (issues.length > 5) reply += `\n…and ${issues.length - 5} more.`;

    const keyboard = preview.slice(0, 3).map((issue, i) => ([
      { text: `✅ Resolve #${i + 1}`, callback_data: `resolve:${issue.id}` }
    ]));
    keyboard.push([
      { text: '🗑 Resolve ALL', callback_data: 'resolve_all_confirm' },
      { text: '🔄 Refresh',    callback_data: 'status_refresh'      }
    ]);
    await sendTelegramMessage(chatId, reply, { inline_keyboard: keyboard }, env);
    return new Response('OK');
  }

  // ── /subscribers ─────────────────────────────────────────────────────────
  if (cmd === '/subscribers') {
    const count = await fetchSubscriberCount(env);
    if (count === null) {
      await sendTelegramMessage(chatId, '❌ Could not fetch subscriber count from Firestore.', null, env);
    } else {
      const milestone = count > 0 && count % 100 === 0 ? `\n\n🎉 <b>Milestone reached!</b>` : '';
      await sendTelegramMessage(chatId, `📧 <b>Newsletter Subscribers: ${count}</b>${milestone}`, null, env);
    }
    return new Response('OK');
  }

  // ── /posts ────────────────────────────────────────────────────────────────
  if (cmd === '/posts') {
    const posts = await fetchRecentPosts(5, env);
    if (posts === null) {
      await sendTelegramMessage(chatId, '❌ Could not fetch posts from Firestore.', null, env);
      return new Response('OK');
    }
    if (posts.length === 0) {
      await sendTelegramMessage(chatId, '📭 No published posts found.', null, env);
      return new Response('OK');
    }
    let reply = `📝 <b>Recent Posts (${posts.length})</b>\n\n`;
    posts.forEach((post, i) => {
      const slug  = post.slug  || '';
      const title = escapeHtml(post.title || 'Untitled');
      const cat   = post.category ? ` [${escapeHtml(post.category)}]` : '';
      if (slug) {
        reply += `${i + 1}. <a href="https://blogspro.in/post.html?slug=${encodeURIComponent(slug)}">${title}</a>${cat}\n`;
      } else {
        reply += `${i + 1}. ${title}${cat}\n`;
      }
    });
    await sendTelegramMessage(chatId, reply, null, env);
    return new Response('OK');
  }

  // ── /deploy ───────────────────────────────────────────────────────────────
  if (cmd === '/deploy') {
    if (!env.GITHUB_PAT) {
      await sendTelegramMessage(chatId, '⚠️ <b>GITHUB_PAT not configured.</b>\nAdd it as a worker secret to enable /deploy.', null, env);
      return new Response('OK');
    }
    const user = message.from?.username ? `@${message.from.username}` : (message.from?.first_name || 'someone');
    await sendTelegramMessage(chatId, `🚀 Triggering deploy… (requested by ${escapeHtml(user)})`, null, env);
    const ok = await triggerGithubDeploy(env);
    if (ok) {
      await sendTelegramMessage(chatId,
        `✅ <b>Deploy triggered!</b>\n<a href="https://github.com/${env.GITHUB_REPO}/actions">View Actions →</a>`,
        null, env
      );
    } else {
      await sendTelegramMessage(chatId, '❌ Failed to trigger deploy. Check GITHUB_PAT scope (needs workflow permission).', null, env);
    }
    return new Response('OK');
  }

  // ── /resolve all ─────────────────────────────────────────────────────────
  if (cmd === '/resolve' && raw.toLowerCase().includes('all')) {
    const keyboard = [[
      { text: '✅ Yes, resolve all', callback_data: 'resolve_all_confirm' },
    ]];
    await sendTelegramMessage(chatId, '⚠️ <b>Resolve ALL unresolved Sentry issues?</b>', { inline_keyboard: keyboard }, env);
    return new Response('OK');
  }

  // ── /broadcast ───────────────────────────────────────────────────────────
  if (cmd === '/broadcast') {
    const text = raw.substring(10).trim();
    if (!text) {
      await sendTelegramMessage(chatId, '⚠️ <b>Usage:</b> <code>/broadcast Your message here</code>', null, env);
      return new Response('OK');
    }
    const html = `<div style="font-family:sans-serif;line-height:1.6;color:#333">
      <h2>Announcing BlogsPro Update</h2>
      <p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
      <hr>
      <p style="font-size:12px;color:#777">You are receiving this because you subscribed to BlogsPro. <a href="https://blogspro.in">Visit site</a></p>
    </div>`;
    await sendTelegramMessage(chatId, '⏳ <b>Broadcasting to all subscribers…</b>', null, env);
    const result = await sendNewsletter('BlogsPro Update', html, env);
    if (result.success) {
      await sendTelegramMessage(chatId, `✅ <b>Broadcast Complete!</b> Sent to ${result.count} subscribers.`, null, env);
    } else {
      await sendTelegramMessage(chatId, `❌ <b>Broadcast Failed:</b> ${result.message || 'Check Resend API key'}`, null, env);
    }
    return new Response('OK');
  }

  // ── /stats ────────────────────────────────────────────────────────────────
  if (cmd === '/stats') {
    await sendTelegramMessage(chatId, '⏳ <b>Gathering system stats…</b>', null, env);
    const [issues, subscribers] = await Promise.all([
      fetchUnresolvedSentryIssues(env),
      fetchSubscriberCount(env)
    ]);
    const msg = `📊 <b>BlogsPro System Stats</b>\n\n` +
                `🔴 Sentry Issues: <b>${issues === null ? 'Error' : issues.length}</b>\n` +
                `📧 Subscribers:   <b>${subscribers === null ? 'Error' : subscribers}</b>\n` +
                `🌐 Site Status:    <b>Online ✅</b>\n\n` +
                `<a href="https://blogspro.in">Visit blogspro.in →</a>`;
    await sendTelegramMessage(chatId, msg, null, env);
    return new Response('OK');
  }

  // ── /help ─────────────────────────────────────────────────────────────────
  if (cmd === '/help' || cmd === '/start') {
    await sendTelegramMessage(chatId,
      `🤖 <b>BlogsPro Unified Bot</b>\n\n` +
      `/status         — Unresolved Sentry issues\n` +
      `/stats          — System health summary\n` +
      `/subscribers    — Subscriber count\n` +
      `/posts          — Recent published posts\n` +
      `/broadcast [txt]— Send email to all subscribers\n` +
      `/deploy         — Trigger site deploy\n` +
      `/resolve all    — Bulk resolve Sentry issues\n` +
      `/help           — This message\n\n` +
      `Sentry alerts and <b>Role Approvals</b> arrive automatically with buttons.\n` +
      `GitHub events also appear here.\n` +
      `Daily summary sent at <b>09:00 UTC</b>.`,
      null, env
    );
    return new Response('OK');
  }

  return new Response('OK');
}

// ══════════════════════════════════════════════════════════════════════════════
// GITHUB WEBHOOK HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleGithubWebhook(request, env) {
  const body      = await request.text();
  const sigHeader = request.headers.get('X-Hub-Signature-256') || '';
  const event     = request.headers.get('X-GitHub-Event') || '';

  // Verify signature if secret is configured
  if (env.GITHUB_WEBHOOK_SECRET) {
    const valid = await verifyGithubSignature(body, sigHeader, env.GITHUB_WEBHOOK_SECRET);
    if (!valid) return new Response('Unauthorized', { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(body); } catch { return new Response('Bad Request', { status: 400 }); }

  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_TO) return new Response('OK');

  let msg = null;

  // ── push to main ──────────────────────────────────────────────────────────
  if (event === 'push' && payload.ref === 'refs/heads/main') {
    const commits  = payload.commits || [];
    const pusher   = escapeHtml(payload.pusher?.name || 'Unknown');
    const branch   = payload.ref.replace('refs/heads/', '');
    const repoUrl  = escapeHtml(payload.repository?.html_url || '');
    const count    = commits.length;
    if (count === 0) return new Response('OK'); // tag push / delete, skip
    const commitLines = commits.slice(0, 3).map(c =>
      `  • <code>${escapeHtml(c.message.split('\n')[0].substring(0, 70))}</code>`
    ).join('\n');
    const more = count > 3 ? `\n  …and ${count - 3} more` : '';
    msg = `🔀 <b>Push to ${branch}</b> by <b>${pusher}</b>\n\n${commitLines}${more}\n\n` +
          `<a href="${repoUrl}/commits/${branch}">View commits →</a>`;
  }

  // ── pull request ──────────────────────────────────────────────────────────
  else if (event === 'pull_request') {
    const action = payload.action;
    const pr     = payload.pull_request;
    if (!['opened', 'closed', 'reopened', 'ready_for_review'].includes(action)) return new Response('OK');

    const title  = escapeHtml(pr.title || '');
    const user   = escapeHtml(pr.user?.login || '');
    const url    = escapeHtml(pr.html_url || '');
    const number = pr.number;
    const merged = pr.merged;

    let icon, status;
    if (action === 'closed' && merged) { icon = '✅'; status = 'Merged'; }
    else if (action === 'closed')       { icon = '🔴'; status = 'Closed'; }
    else if (action === 'opened')       { icon = '🟡'; status = 'Opened'; }
    else if (action === 'reopened')     { icon = '🔄'; status = 'Reopened'; }
    else                                { icon = '🟢'; status = 'Ready'; }

    msg = `${icon} <b>PR #${number} ${status}</b>\n` +
          `<b>${title}</b>\n` +
          `by @${user}\n` +
          `<a href="${url}">View PR →</a>`;
  }

  // ── issues ────────────────────────────────────────────────────────────────
  else if (event === 'issues') {
    const action = payload.action;
    if (!['opened', 'closed', 'reopened'].includes(action)) return new Response('OK');

    const issue  = payload.issue;
    const title  = escapeHtml(issue.title || '');
    const user   = escapeHtml(issue.user?.login || '');
    const url    = escapeHtml(issue.html_url || '');
    const number = issue.number;
    const icon   = action === 'opened' ? '🐛' : action === 'closed' ? '✅' : '🔄';

    msg = `${icon} <b>Issue #${number} ${action}</b>\n` +
          `<b>${title}</b>\n` +
          `by @${user}\n` +
          `<a href="${url}">View Issue →</a>`;
  }

  // ── workflow run ──────────────────────────────────────────────────────────
  else if (event === 'workflow_run' && payload.action === 'completed') {
    const run        = payload.workflow_run;
    const conclusion = run.conclusion; // success, failure, cancelled, skipped
    if (!['failure', 'success'].includes(conclusion)) return new Response('OK');

    // Skip: we only care about the main BlogsPro CI pipeline
    if (run.name !== 'BlogsPro CI') return new Response('OK');

    const icon   = conclusion === 'success' ? '✅' : '❌';
    const branch = escapeHtml(run.head_branch || '');
    const url    = escapeHtml(run.html_url || '');
    const sha    = (run.head_sha || '').substring(0, 7);
    msg = `${icon} <b>CI ${conclusion === 'success' ? 'Passed' : 'Failed'}</b> on <b>${branch}</b>\n` +
          `Commit: <code>${sha}</code>\n` +
          `<a href="${url}">View run →</a>`;
  }

  if (msg) {
    await sendTelegramMessage(env.TELEGRAM_TO, msg, null, env);
  }
  return new Response('OK');
}

// ══════════════════════════════════════════════════════════════════════════════
// NEWSLETTER & REGISTRATION HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

async function handleNewsletterRequest(request, env) {
  // CORS headers for frontend
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const { postId, title, excerpt, slug, secret } = body;

    if (secret !== env.NEWSLETTER_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const html = `<div style="font-family:serif;max-width:600px;margin:auto;padding:20px;background:#fdfcfb;border:1px solid #eee">
      <h1 style="color:#080d1a">BlogsPro: New Article</h1>
      <h2 style="color:#c9a84c">${escapeHtml(title)}</h2>
      <p style="font-style:italic;color:#555">${escapeHtml(excerpt)}</p>
      <a href="https://blogspro.in/post.html?slug=${encodeURIComponent(slug)}" style="display:inline-block;padding:12px 24px;background:#c9a84c;color:#080d1a;text-decoration:none;font-weight:bold;border-radius:2px">Read Full Article →</a>
      <hr style="margin-top:30px;border:none;border-top:1px solid #eee">
      <p style="font-size:12px;color:#888">You are receiving this because you subscribed to BlogsPro. <a href="https://blogspro.in">Unsubscribe</a></p>
    </div>`;

    const result = await sendNewsletter(title, html, env);
    return new Response(JSON.stringify(result), { status: result.success ? 200 : 500, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function handleRegistrationNotify(request, env) {
  const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  try {
    const { name, email, requestedRole, uid } = await request.json();
    if (!requestedRole || requestedRole === 'reader') return new Response('OK', { headers: corsHeaders });

    const msg = `👤 <b>New User Registration</b>\n\n` +
                `<b>Name:</b> ${escapeHtml(name)}\n` +
                `<b>Email:</b> ${escapeHtml(email)}\n` +
                `<b>Requests Role:</b> <code>${requestedRole.toUpperCase()}</code>\n\n` +
                `Approve this request via buttons below:`;

    const keyboard = [[
      { text: `✅ Approve ${requestedRole.toUpperCase()}`, callback_data: `approve:${uid}:${requestedRole}` },
      { text: '❌ Reject', callback_data: `reject:${uid}` }
    ]];

    await sendTelegramMessage(env.TELEGRAM_TO, msg, { inline_keyboard: keyboard }, env);
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}

async function sendNewsletter(subject, html, env) {
  if (!env.RESEND_API_KEY) return { success: false, message: 'RESEND_API_KEY not configured' };
  
  const count = await fetchSubscriberCount(env);
  if (count === 0) return { success: true, count: 0, message: 'No subscribers' };

  // Fetch actual emails for batch
  const emails = await fetchSubscriberEmails(env);
  
  const BATCH_SIZE = 100;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const resendPayload = batch.map(email => ({
      from: 'BlogsPro <newsletter@mail.blogspro.in>',
      to: [email],
      subject: subject,
      html: html
    }));

    await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(resendPayload)
    });
  }

  return { success: true, count: emails.length };
}

async function fetchSubscriberEmails(env) {
  const project = env.FIREBASE_PROJECT;
  const apiKey  = env.FIREBASE_API_KEY;
  const url     = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/subscribers?key=${apiKey}&pageSize=1000`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map(d => d.fields?.email?.stringValue).filter(Boolean);
}

async function updateUserRole(uid, role, env) {
  try {
    const project = env.FIREBASE_PROJECT;
    const apiKey  = env.FIREBASE_API_KEY;
    const url     = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${uid}?key=${apiKey}&updateMask.fieldPaths=role`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { role: { stringValue: role } } })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SENTRY WEBHOOK HANDLER
// ══════════════════════════════════════════════════════════════════════════════

async function handleSentryWebhook(request, env) {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_TO) {
    return new Response('Telegram not configured', { status: 500 });
  }
  try {
    const payload = await request.json();
    const issue   = payload?.data?.issue;
    if (!issue) return new Response('No issue data', { status: 400 });

    // De-duplicate: skip if we already alerted for this issue in the last 24h
    const dedupKey = `sentry:${issue.id}`;
    const seen = await kvGet(dedupKey, env);
    if (seen) return new Response('Duplicate suppressed');
    await kvPut(dedupKey, '1', { expirationTtl: 86400 }, env);

    const text        = formatSentryAlert(issue);
    const replyMarkup = buildIssueKeyboard(issue);
    const ok          = await sendTelegramMessage(env.TELEGRAM_TO, text, replyMarkup, env);
    if (!ok) return new Response('Failed to send Telegram message', { status: 500 });
    return new Response('OK');
  } catch (e) {
    console.error('Sentry webhook error:', e.message);
    return new Response('Internal error', { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DAILY SUMMARY (Cron)
// ══════════════════════════════════════════════════════════════════════════════

async function sendDailySummary(env) {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_TO) return;

  // Fetch data in parallel
  const [issues, subCount, posts] = await Promise.all([
    fetchUnresolvedSentryIssues(env),
    fetchSubscriberCount(env),
    fetchRecentPosts(3, env)
  ]);

  const today     = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const issueStr  = issues === null ? 'N/A' : `${issues.length}`;
  const subStr    = subCount === null ? 'N/A' : `${subCount}`;

  let msg = `📊 <b>BlogsPro Daily Summary — ${today}</b>\n\n`;
  msg += `🔴 Sentry issues:   <b>${issueStr}</b>\n`;
  msg += `📧 Subscribers:     <b>${subStr}</b>\n`;

  if (Array.isArray(posts) && posts.length > 0) {
    msg += `\n📝 <b>Recent posts:</b>\n`;
    posts.forEach(p => {
      const title = escapeHtml(p.title || 'Untitled');
      const slug  = p.slug || '';
      if (slug) {
        msg += `  • <a href="https://blogspro.in/post.html?slug=${encodeURIComponent(slug)}">${title}</a>\n`;
      } else {
        msg += `  • ${title}\n`;
      }
    });
  }

  msg += `\n<a href="https://blogspro.in">Visit site →</a>`;
  await sendTelegramMessage(env.TELEGRAM_TO, msg, null, env);
}

// ══════════════════════════════════════════════════════════════════════════════
// FIRESTORE REST API
// ══════════════════════════════════════════════════════════════════════════════

async function fetchSubscriberCount(env) {
  try {
    const project = env.FIREBASE_PROJECT;
    const apiKey  = env.FIREBASE_API_KEY;
    const base    = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

    let total = 0;
    let pageToken = '';
    do {
      const url = `${base}/subscribers?key=${apiKey}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res  = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      total     += (data.documents || []).length;
      pageToken  = data.nextPageToken || '';
    } while (pageToken);

    return total;
  } catch (e) {
    console.error('fetchSubscriberCount error:', e.message);
    return null;
  }
}

async function fetchRecentPosts(limit, env) {
  try {
    const project = env.FIREBASE_PROJECT;
    const apiKey  = env.FIREBASE_API_KEY;
    const url     = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:runQuery?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'posts' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'published' },
              op: 'EQUAL',
              value: { booleanValue: true }
            }
          },
          orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
          limit
        }
      })
    });

    if (!res.ok) return null;
    const results = await res.json();

    return results
      .filter(r => r.document)
      .map(r => {
        const fields = r.document.fields || {};
        return {
          title:    fields.title?.stringValue    || '',
          slug:     fields.slug?.stringValue     || '',
          category: fields.category?.stringValue || ''
        };
      });
  } catch (e) {
    console.error('fetchRecentPosts error:', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// GITHUB API
// ══════════════════════════════════════════════════════════════════════════════

async function triggerGithubDeploy(env) {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/deploy.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_PAT}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'BlogsPro-Bot/1.0'
        },
        body: JSON.stringify({ ref: 'main' })
      }
    );
    return res.status === 204;
  } catch (e) {
    console.error('triggerGithubDeploy error:', e.message);
    return false;
  }
}

async function verifyGithubSignature(body, sigHeader, secret) {
  try {
    const encoder  = new TextEncoder();
    const key      = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );
    const hexStr   = sigHeader.replace('sha256=', '');
    const sigBytes = new Uint8Array(hexStr.match(/../g).map(h => parseInt(h, 16)));
    return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(body));
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SENTRY API
// ══════════════════════════════════════════════════════════════════════════════

async function fetchUnresolvedSentryIssues(env) {
  if (!env.SENTRY_ORG || !env.SENTRY_PROJECT || !env.SENTRY_AUTH_TOKEN) return null;
  try {
    const url = `https://sentry.io/api/0/projects/${env.SENTRY_ORG}/${env.SENTRY_PROJECT}/issues/?query=${encodeURIComponent('is:unresolved')}&limit=25`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${env.SENTRY_AUTH_TOKEN}` }
    });
    if (!res.ok) {
      console.error('Sentry API error:', res.status, await res.text());
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error('fetchUnresolvedSentryIssues error:', e.message);
    return null;
  }
}

async function resolveSentryIssue(issueId, env) {
  try {
    const url = `https://sentry.io/api/0/issues/${issueId}/`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${env.SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'resolved' })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// KV HELPERS (graceful — no-op if KV binding missing)
// ══════════════════════════════════════════════════════════════════════════════

async function kvGet(key, env) {
  if (!env.KV) return null;
  try { return await env.KV.get(key); } catch { return null; }
}

async function kvPut(key, value, options, env) {
  if (!env.KV) return;
  try { await env.KV.put(key, value, options); } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
// FORMATTING HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function formatSentryAlert(issue) {
  const env_label = issue.environment || 'production';
  const culprit   = escapeHtml(issue.culprit || 'Unknown');
  const title     = escapeHtml((issue.title || 'Unknown Error').substring(0, 120));
  return (
    `🚨 <b>Sentry Alert — BlogsPro</b>\n\n` +
    `<b>Error:</b> <code>${title}</code>\n` +
    `<b>Culprit:</b> ${culprit}\n` +
    `<b>Env:</b> ${env_label}\n` +
    `<b>Issue ID:</b> <code>${issue.id}</code>`
  );
}

function buildIssueKeyboard(issue) {
  const row = [{ text: '✅ Resolve', callback_data: `resolve:${issue.id}` }];
  if (issue.permalink) row.push({ text: '🔗 View in Sentry', url: issue.permalink });
  return { inline_keyboard: [row] };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ══════════════════════════════════════════════════════════════════════════════
// TELEGRAM API HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function sendTelegramMessage(chatId, text, replyMarkup, env) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
  );
  return res.ok;
}

async function editTelegramMessage(chatId, messageId, text, replyMarkup, env) {
  const payload = { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', disable_web_page_preview: true };
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
