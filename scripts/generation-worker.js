import { getMarketContext, fetchEconomicCalendar, fetchMultiAssetData, fetchSentimentData, fetchUniversalNews, fetchRBIData, fetchSEBIData, fetchUpstoxData, fetchMFData, fetchPEVCData, fetchInsuranceData, fetchGIFTCityData, fetchCentralBankPulse, fetchMacroPulse, fetchCCILData } from "./lib/data-fetchers.js";
import { askAI } from "./lib/ai-service.js";
import { getBriefingPrompt, getArticlePrompt, getSanitizerPrompt } from "./lib/prompts.js";
import { saveBriefing, updateIndex, syncToFirestore } from "./lib/storage-bridge.js";
import { generateMiroForecast } from "./lib/mirofish-persona.js";
import { applyContentCorrections } from "./lib/content-corrector.js";

/**
 * BlogsPro Intelligence Terminal - Universal Generation Worker
 * Orchestrates high-fidelity briefings & articles via Serverless Infrastructure.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const frequency = url.searchParams.get("freq") || "hourly";
    const type = url.searchParams.get("type") || "briefing"; // 'briefing' or 'article'
    const authHeader = request.headers.get("Authorization");

    if (env.NEWSLETTER_SECRET && authHeader !== `Bearer ${env.NEWSLETTER_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const jobId = url.searchParams.get("jobId");
      const step = parseInt(url.searchParams.get("step") || "0");

      let result;
      if (type === "article") {
        result = await generateArticleJob(frequency, env, jobId, step);
      } else {
        result = await generateBriefingJob(frequency, env);
      }
      return new Response(JSON.stringify({ status: "success", result }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ status: "error", message: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron;
    let frequency = "hourly";
    let type = "briefing";

    if (cron === "0 4 * * *") { frequency = "daily"; type = "briefing"; }
    else if (cron === "0 5 * * 1") { frequency = "weekly"; type = "article"; }
    else if (cron === "0 6 1 * *") { frequency = "monthly"; type = "article"; }

    console.log(`⏰ Scheduled Task Triggered: ${type.toUpperCase()} (${frequency.toUpperCase()})`);
    ctx.waitUntil(type === "article" ? generateArticleJob(frequency, env) : generateBriefingJob(frequency, env));
  }
};

/**
 * TRIGGER PDF WEBHOOK (GitHub Action)
 * FREE alternate solution for PDF generation
 */
async function triggerPdfWebhook(fileName, frequency, env) {
  if (!env.GH_TOKEN || !env.GH_REPO) {
    console.warn("⚠️ GH_TOKEN or GH_REPO missing. Skipping PDF trigger.");
    return;
  }

  const url = `https://api.github.com/repos/${env.GH_REPO}/dispatches`;
  await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.GH_TOKEN}`,
      "Accept": "application/vnd.github.v3+json",
      "User-Agent": "BlogsPro-Worker"
    },
    body: JSON.stringify({
      event_type: "generate-pdf",
      client_payload: { fileName, frequency }
    })
  });
}

/**
 * TELEGRAM NOTIFICATION
 * Instant broadcast of institutional intelligence
 */
async function notifyTelegram(entry, type, env) {
  if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_TO) {
    console.warn("⚠️ Telegram credentials missing. Skipping notification.");
    return;
  }

  const tgTitle = type === 'article' ? `📑 *STRATEGIC REPORT: ${entry.frequency.toUpperCase()}*` : `📑 *INTELLIGENCE PULSE: ${entry.frequency.toUpperCase()}*`;
  const linkPrefix = type === 'article' ? `articles/${entry.frequency}` : `briefings/${entry.frequency}`;
  const tgText = `${tgTitle}\n\n*${entry.title}*\n\nInstitutional Strategic Analysis Manuscript. (Terminal login required for full interactive charts).\n\n🔗 View Report: https://blogspro.in/${linkPrefix}/${entry.file}`;

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.TELEGRAM_TO, text: tgText, parse_mode: "Markdown" })
    });
    console.log("✅ Telegram Notification Sent.");
  } catch (e) {
    console.error("❌ Telegram Notification Failed:", e.message);
  }
}

// --- BRIEFING JOB ---
export async function generateBriefingJob(frequency, env) {
  // Environmental shimming
  if (typeof process === "undefined") globalThis.process = { env: {} };
  Object.assign(process.env, env);

  const mktInfo = getMarketContext();
  const [ mktData, calendar, sentiment, news, rbi, sebi, upstox, pulse, mf, pevc, ins, gift, banks ] = await Promise.all([
    fetchMultiAssetData(), fetchEconomicCalendar(), fetchSentimentData(), fetchUniversalNews(),
    fetchRBIData(), fetchSEBIData(), fetchUpstoxData(), fetchMacroPulse(),
    fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData(), fetchCentralBankPulse()
  ]);

  const marketContext = `--- MARKET SESSIONS ---\nIST: ${mktInfo.timestamp}\n--- ASSETS ---\n${mktData.summary}\n--- PULSE ---\n${sentiment.summary} | ${calendar.text}\n--- VERTICALS ---\n${mf.summary} | ${pevc.summary} | ${gift.summary}\n--- NEWS ---\n${news}`.trim();

  const mainPrompt = getBriefingPrompt(frequency, marketContext, mktInfo);
  let rawContent = await askAI(mainPrompt, { role: 'generate', env });

  const swarmForecast = await generateMiroForecast(marketContext, env);
  rawContent = rawContent.replace("<h2>GIFT CITY INTELLIGENCE PULSE</h2>", `<h2>MIROFISH INTELLIGENCE FORECAST</h2>\n${swarmForecast}\n\n<h2>GIFT CITY INTELLIGENCE PULSE</h2>`);

  const cleanContent = await askAI(getSanitizerPrompt(rawContent), { role: 'audit', env });

  const fileName = `pulse-${frequency}-${Date.now()}.html`;
  await saveBriefing(fileName, cleanContent, frequency, env);

  const entry = { id: Date.now(), title: `${frequency.toUpperCase()} Pulse - ${mktInfo.day}`, date: new Date().toISOString(), file: fileName, frequency, sentiment: sentiment.value };
  await updateIndex(entry, frequency, env);
  await syncToFirestore("pulse_briefings", entry, env); // NEW: Firestore Sync
  await triggerPdfWebhook(fileName, frequency, env);
  await notifyTelegram(entry, "briefing", env); // NEW: Telegram Notify

  return entry;
}

const VERTICALS = [
  { id: "macro", name: "Global Macro Drift" },
  { id: "equities", name: "Equities & Alpha" },
  { id: "fixed-income", name: "Fixed Income & CCIL" },
  { id: "commodities", name: "Commodities & Energy" },
  { id: "forex", name: "Forex & Cross-Currency" },
  { id: "pevc", name: "Capital Flows (PE/VC)" },
  { id: "banking", name: "Banking & Credit" },
  { id: "insurance", name: "Insurance & Risk" },
  { id: "mf", name: "Mutual Funds & AUM" },
  { id: "gift", name: "Offshore & GIFT City" },
  { id: "rbi", name: "Central Bank Pulse (RBI/Fed)" },
  { id: "sme", name: "SME & MSME Credit" },
  { id: "infra", name: "Infrastructure & Real Estate" },
  { id: "esg", name: "ESG & Sustainable Finance" },
  { id: "em", name: "Emerging Markets Drift" },
  { id: "geo", name: "Geopolitical Tensions" }
];

// --- ARTICLE JOB (RECURSIVE STATEFUL) ---
export async function generateArticleJob(frequency, env, jobId = null, verticalIndex = 0) {
  if (typeof process === "undefined") globalThis.process = { env: {} };
  Object.assign(process.env, env);

  const id = jobId || `job-${Date.now()}`;
  const totalVerticals = VERTICALS.length;

  console.log(`🚀 [${id}] Processing Vertical ${verticalIndex + 1}/${totalVerticals}: ${VERTICALS[verticalIndex].name}`);

  // Fetch common data (cached/cached locally in D.O or similar if needed, but here we just fetch)
  const [macro, universal] = await Promise.all([
    fetchMacroPulse(),
    fetchUniversalNews()
  ]);

  const v = VERTICALS[verticalIndex];
  // Specific data fetcher logic would go here, simplified to use macro/universal for now or specific ones if available
  const vData = macro.summary; // Fallback to pulse

  const prompt = getArticlePrompt(frequency, v.name, v.id, vData, macro.summary, universal, "Baseline focus.");
  const content = await askAI(prompt, { role: 'generate', env });
  const { content: corrected } = applyContentCorrections(content, `STRATEGY_${v.id.toUpperCase()}`);
  
  const sectionContent = `<section id="${v.id}">${corrected}</section>\n`;

  // Update State in KV
  let accumulated = "";
  if (verticalIndex > 0) {
    accumulated = await env.KV.get(`${id}_content`) || "";
  }
  accumulated += sectionContent;
  await env.KV.put(`${id}_content`, accumulated, { expirationTtl: 3600 }); // 1 hour TTL

  // Check if we need more steps
  if (verticalIndex < totalVerticals - 1) {
    // Trigger next step
    const nextUrl = new URL(`https://blogspro-gen.workers.dev/?freq=${frequency}&type=article&jobId=${id}&step=${verticalIndex + 1}`);
    
    // We use wait until to prevent termination while calling itself
    // Or just fetch and return
    await fetch(nextUrl.toString(), {
      headers: { "Authorization": `Bearer ${env.NEWSLETTER_SECRET}` }
    });

    return { jobId: id, status: "pending", vertical: v.name };
  } else {
    // FINALIZATION
    const swarmForecast = await generateMiroForecast(macro.summary, env);
    const finalContent = `<h2>MIROFISH STRATEGIC OUTLOOK</h2>\n${swarmForecast}\n\n` + accumulated;

    const cleanContent = await askAI(getSanitizerPrompt(finalContent), { role: 'audit', env });
    const fileName = `strategy-${frequency}-${Date.now()}.html`;
    await saveBriefing(fileName, cleanContent, frequency, env);

    const entry = { id: Date.now(), title: `${frequency.toUpperCase()} Tome`, date: new Date().toISOString(), file: fileName, frequency, type: "article" };
    await updateIndex(entry, frequency, env);
    await syncToFirestore("articles", entry, env);
    await triggerPdfWebhook(fileName, frequency, env);
    await notifyTelegram(entry, "article", env);

    // Clean up KV
    await env.KV.delete(`${id}_content`);

    return { jobId: id, status: "completed", file: fileName };
  }
}
