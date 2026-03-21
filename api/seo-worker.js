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
      // 2. Query Firestore REST API for the specific post data
      const firebaseUrl = `https://firestore.googleapis.com/v1/projects/blogspro-ai/databases/(default)/documents/posts/${postId}`;
      const dbRes = await fetch(firebaseUrl);

      if (dbRes.ok) {
        const data = await dbRes.json();
        
        // Ensure post is published
        if (data.fields && data.fields.published && data.fields.published.booleanValue) {
          const title = data.fields.title?.stringValue || 'BlogsPro Article';
          const excerpt = data.fields.excerpt?.stringValue || title;
          const banner = data.fields.coverImage?.stringValue || 'https://blogspro.in/og-default.jpg';
          const authorFullName = data.fields.authorName?.stringValue || 'BlogsPro';
          
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
            <meta property="og:url" content="${request.url}">
            <meta property="og:type" content="article">
            <meta property="article:author" content="${authorFullName}">
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${title}">
            <meta name="twitter:description" content="${excerpt}">
            <meta name="twitter:image" content="${banner}">
            <!-- End Cloudflare Worker Injected SEO -->
          `;
          
          html = html.replace('</head>', `${metaTags}\n</head>`);
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
