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
      let result;
      if (type === "article") {
        result = await generateArticleJob(frequency, env);
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

// --- ARTICLE JOB ---
export async function generateArticleJob(frequency, env) {
  if (typeof process === "undefined") globalThis.process = { env: {} };
  Object.assign(process.env, env);

  const [rbi, sebi, ccil, macro, universal, sentiment, markets, mf, pevc, ins, gift] = await Promise.all([
    fetchRBIData(), fetchSEBIData(), fetchCCILData(), fetchMacroPulse(),
    fetchUniversalNews(), fetchSentimentData(), fetchMultiAssetData(),
    fetchMFData(), fetchPEVCData(), fetchInsuranceData(), fetchGIFTCityData()
  ]);

  const verticals = [
    { id: "macro", name: "Global Macro Drift", data: macro.summary },
    { id: "equities", name: "Equities & Alpha", data: markets.summary },
    { id: "capital", name: "Capital Flows (PE/VC)", data: pevc.summary },
    { id: "gift", name: "Offshore & GIFT City", data: gift.summary }
  ];

  let fullContent = "";
  for (const v of verticals) {
    const prompt = getArticlePrompt(frequency, v.name, v.id, v.data, macro.summary, universal, "Baseline focus.");
    const content = await askAI(prompt, { role: 'generate', env });
    const { content: corrected } = applyContentCorrections(content, `STRATEGY_${v.id.toUpperCase()}`);
    fullContent += `<section id="${v.id}">${corrected}</section>\n`;
  }

  const swarmForecast = await generateMiroForecast(macro.summary, env);
  fullContent = `<h2>MIROFISH STRATEGIC OUTLOOK</h2>\n${swarmForecast}\n\n` + fullContent;

  const cleanContent = await askAI(getSanitizerPrompt(fullContent), { role: 'audit', env });
  const fileName = `strategy-${frequency}-${Date.now()}.html`;
  await saveBriefing(fileName, cleanContent, frequency, env);

  const entry = { id: Date.now(), title: `${frequency.toUpperCase()} Tome`, date: new Date().toISOString(), file: fileName, frequency, type: "article" };
  await updateIndex(entry, frequency, env);
  await syncToFirestore("articles", entry, env); // NEW: Firestore Sync
  await triggerPdfWebhook(fileName, frequency, env);
  await notifyTelegram(entry, "article", env); // NEW: Telegram Notify

  return entry;
}
