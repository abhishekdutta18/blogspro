import { getBaseTemplate, parseMD } from "./lib/templates.js";

/**
 * BlogsPro Template Engine Worker (V4.0)
 * =====================================
 * High-performance UI/UX transformation tier.
 * Decouples terminal styling from orchestration logic.
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Use POST for template transformation.", { status: 405 });
    }

    try {
      const data = await request.json();
      const { title, excerpt, content, dateLabel, type, freq, fileName, rel, sentimentScore, priceInfo } = data;

      // 1. Core Structural Transformation (Markdown -> HTML)
      const transformedContent = parseMD(content);

      // 2. Wrap in Industrial Bloomberg-Gold Template
      const html = getBaseTemplate({
        title,
        excerpt,
        content: transformedContent, // Note: getBaseTemplate might already call parseMD, ensuring double-safety
        dateLabel,
        type,
        freq,
        fileName,
        rel,
        sentimentScore,
        priceInfo
      });

      // 3. Word Count Validation (Metric Tracking)
      const wordCount = content.split(/\s+/).length;
      console.log(`📡 [Template Engine] Transformed ${wordCount} words for [${title}]`);

      return new Response(JSON.stringify({ 
        status: "success", 
        html, 
        wordCount,
        timestamp: new Date().toISOString()
      }), {
        headers: { "Content-Type": "application/json" }
      });

    } catch (e) {
      console.error("❌ [Template Engine] Error:", e);
      return new Response(JSON.stringify({ status: "error", message: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
