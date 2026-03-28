const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'blogspro-ai';
const API_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
const DOMAIN = 'https://blogspro.in';

async function generateSitemap() {
  try {
    console.log("Fetching posts for Sitemap...");
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "posts" }],
          where: {
            fieldFilter: {
              field: { fieldPath: "published" },
              op: "EQUAL",
              value: { booleanValue: true }
            }
          }
        }
      })
    });
    if (!res.ok) throw new Error("Failed to fetch posts: " + await res.text());
    
    const data = await res.json();
    let urls = '';

    // Fixed Pages
    const staticPages = ['', '/about.html', '/register.html', '/login.html'];
    staticPages.forEach(page => {
      urls += `
  <url>
    <loc>${DOMAIN}${page}</loc>
    <changefreq>daily</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`;
    });

    // Dynamic Pages (SSG slugs from Firestore)
    if (Array.isArray(data)) {
      for (const item of data) {
        if (!item.document) continue;
        const doc = item.document;
        const fields = doc.fields;
        if (!fields || !fields.published || !fields.published.booleanValue) continue;

        const title = fields.title?.stringValue || 'Untitled';
        const docId = doc.name.split('/').pop();
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || docId;
        const lastMod = fields.updatedAt?.timestampValue || fields.createdAt?.timestampValue || new Date().toISOString();

        const dateObj = new Date(lastMod);
        const isRecent = (new Date() - dateObj) < (24 * 60 * 60 * 1000);

        urls += `
  <url>
    <loc>${DOMAIN}/p/${slug}.html</loc>
    <lastmod>${lastMod.split('T')[0]}</lastmod>
    <changefreq>${isRecent ? 'hourly' : 'weekly'}</changefreq>
    <priority>${isRecent ? '1.0' : '0.7'}</priority>
  </url>`;
      }
    }

    // Static Pages from briefings and articles (automated AI content)
    ['../briefings/daily', '../briefings/hourly', '../articles/weekly', '../articles/monthly', '../posts'].forEach(relPath => {
      const dir = path.join(__dirname, relPath);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
        files.forEach(file => {
          const stats = fs.statSync(path.join(dir, file));
          const lastMod = stats.mtime.toISOString().split('T')[0];
          const pathSegments = relPath.split('/').filter(s => s !== '..');
          const loc = `${DOMAIN}/${pathSegments.join('/')}/${file}`;
          if (!urls.includes(loc)) {
            urls += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
          }
        });
      }
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    fs.writeFileSync(path.join(__dirname, '../sitemap.xml'), sitemap);
    console.log("✓ sitemap.xml updated successfully!");

  } catch (err) {
    console.error("Sitemap Generation Error:", err);
    process.exit(1);
  }
}

generateSitemap();
