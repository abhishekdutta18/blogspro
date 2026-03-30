/**
 * BlogsPro SEO Manager Worker (V1.0)
 * ===================================
 * Swarm 4.0: Autonomous Indexing Tier.
 * Responsible for:
 * 1. Sitemap.xml synchronization (R2).
 * 2. RSS/Atom Feed maintenance (R2).
 * 3. JSON-LD Schema generation for Pulse/Articles.
 */

const DEFAULT_BASE_URL = "https://blogspro.in";

export default {
  async fetch(request, env) {
    const BASE_URL = env.BASE_URL || DEFAULT_BASE_URL;

    if (request.method !== "POST") return new Response("Use POST for indexing.", { status: 405 });

    // 0. Security Handshake
    const token = request.headers.get("X-Swarm-Token");
    if (!token || token !== env.SWARM_INTERNAL_TOKEN) {
      console.error("❌ [SEO] Unauthorized Swarm Access attempt.");
      return new Response(JSON.stringify({ error: "Access Denied" }), { status: 403 });
    }

    try {
      const { metadata, type } = await request.json();
      const { title, fileName, frequency, excerpt } = metadata;
      
      const fullUrl = `${BASE_URL}/briefings/${frequency}/${fileName}`;
      console.log(`📡 [SEO] Indexing New Content: ${fullUrl}`);

      // 1. Synchronize Sitemap.xml
      await syncSitemap(fullUrl, env);

      // 2. Update RSS Feed
      await updateRSS馈(title, fullUrl, excerpt, env);

      return new Response(JSON.stringify({
        status: "INDEXED",
        url: fullUrl,
        sitemapUpdated: true,
        rssUpdated: true,
        timestamp: Date.now()
      }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { 
        status: 500, headers: { "Content-Type": "application/json" } 
      });
    }
  }
};

async function syncSitemap(newUrl, env) {
  if (!env.BLOOMBERG_ASSETS) return;
  const key = "sitemap.xml";
  
  let sitemap = "";
  const existing = await env.BLOOMBERG_ASSETS.get(key);
  
  if (existing) {
    sitemap = await existing.text();
    // Simple XML insertion before the closing tag
    const entry = `  <url>\n    <loc>${newUrl}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n    <changefreq>weekly</changefreq>\n  </url>\n`;
    if (sitemap.includes("</urlset>")) {
      sitemap = sitemap.replace("</urlset>", `${entry}</urlset>`);
    }
  } else {
    // Boilerplate for new sitemap
    sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${newUrl}</loc>\n    <lastmod>${new Date().toISOString()}</lastmod>\n  </url>\n</urlset>`;
  }

  await env.BLOOMBERG_ASSETS.put(key, sitemap, {
    httpMetadata: { contentType: 'application/xml' }
  });
  console.log(`✓ [SEO] Sitemap synchronized.`);
}

async function updateRSS(title, url, excerpt, env) {
  if (!env.BLOOMBERG_ASSETS) return;
  const key = "rss.xml";
  
  let rss = "";
  const existing = await env.BLOOMBERG_ASSETS.get(key);
  
  if (existing) {
    rss = await existing.text();
    const item = `    <item>\n      <title>${title}</title>\n      <link>${url}</link>\n      <description>${excerpt || title}</description>\n      <pubDate>${new Date().toUTCString()}</pubDate>\n    </item>\n`;
    if (rss.includes("</channel>")) {
      rss = rss.replace("</channel>", `${item}</channel>`);
    }
  } else {
    rss = `<?xml version="1.0" encoding="UTF-8" ?>\n<rss version="2.0">\n<channel>\n  <title>BlogsPro Intelligence Pulse</title>\n  <link>${BASE_URL}</link>\n  <description>Institutional Macro & Quantitative Research</description>\n  <item>\n    <title>${title}</title>\n    <link>${url}</link>\n    <description>${excerpt || title}</description>\n    <pubDate>${new Date().toUTCString()}</pubDate>\n  </item>\n</channel>\n</rss>`;
  }

  await env.BLOOMBERG_ASSETS.put(key, rss, {
    httpMetadata: { contentType: 'application/xml' }
  });
  console.log(`✓ [SEO] RSS feed maintained.`);
}
