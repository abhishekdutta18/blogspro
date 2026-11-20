import { pushTelemetryLog } from "../scripts/lib/storage-bridge.js";

const DEFAULT_API_URL = "https://blogspro.in";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Only intercept requests for individual blog posts
    if (!url.pathname.includes('/post.html')) {
      return fetch(request);
    }

    const postId = url.searchParams.get('id');
    if (!postId) {
      return fetch(request);
    }

    // 1. Fetch the raw post.html template from the origin (GitHub Pages)
    const response = await fetch(request);
    
    // If we couldn't get the HTML, just return the origin response
    if (!response.ok) return response;

    let html = await response.text();

    try {
      // 2. Read the post from the BlogsPro API (public route: published posts only)
      const apiUrl = String(env.BLOGSPRO_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");
      const dbRes = await fetch(`${apiUrl}/api/public/data/posts/${encodeURIComponent(postId)}`);

      if (dbRes.ok) {
        const data = await dbRes.json();

        {
          const _attr = (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
          const title = _attr(data.title || 'BlogsPro Article');
          const excerpt = _attr(data.excerpt || data.title || 'BlogsPro Article');
          const banner = /^https?:\/\//.test(String(data.coverImage || '')) ? data.coverImage : 'https://blogspro.in/og-default.jpg';
          const authorFullName = _attr(data.authorName || 'BlogsPro');
          
          // 3. Inject explicit SEO tags into the HTML template for Scrapers/Googlebot
          
          // Replace standard title
          html = html.replace(/<title>.*?<\/title>/gi, `<title>${title} — BlogsPro</title>`);
          
          // Replace description
          html = html.replace(/<meta name="description".*?>/gi, `<meta name="description" content="${excerpt}">`);
          
          // Inject rich OpenGraph and Twitter tags just before the closing head tag
          const metaTags = `
            <!-- Cloudflare Worker Injected SEO -->
            <meta property="og:title" content="${title} — BlogsPro">
            <meta property="og:description" content="${excerpt}">
            <meta property="og:image" content="${banner}">
            <meta property="og:url" content="${_attr(request.url)}">
            <meta property="og:type" content="article">
            <meta property="article:author" content="${authorFullName}">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${title}">
            <meta name="twitter:description" content="${excerpt}">
            <meta name="twitter:image" content="${banner}">
            <!-- End Cloudflare Worker Injected SEO -->
          `;
          
          html = html.replace('</head>', `${metaTags}\n</head>`);

          // 🚀 Institutional Telemetry
          ctx.waitUntil(pushTelemetryLog("SEO_HYDRATION", {
            frequency: "pulse",
            status: "success",
            message: `Hydrated SEO for post: ${postId}`,
            details: { title }
          }, env));
        }
      }
    } catch (e) {
      console.error("SEO Edge Worker Error:", e);
      // Failsafe: Continue serving the raw un-hydrated HTML
    }

    // Return the hydrated HTML with identical headers to trick the browser perfectly
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
};
// v1.1
