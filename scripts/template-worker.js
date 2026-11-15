import { getBaseTemplate } from "./lib/templates.js";

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

      // Markdown -> sanitized HTML (charts included) happens once, inside getBaseTemplate.
      // Pre-parsing here would feed HTML back through the sanitizer and strip its styling and charts.
      const html = getBaseTemplate({
        title,
        excerpt,
        content,
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
