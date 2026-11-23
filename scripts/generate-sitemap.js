import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listPublicDocuments } from './lib/vps-store.js';

// ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOMAIN = 'https://blogspro.in';

async function generateSitemap() {
  try {
    console.log("Fetching posts for Sitemap...");
    // null when the API is unreachable: the static scan below still lists every page on disk.
    const posts = await listPublicDocuments('posts');
    if (posts === null) console.warn("BlogsPro API unavailable; sitemap built from the static scan only.");
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

    // Dynamic Pages (SSG slugs, as build-static.js writes them)
    if (Array.isArray(posts)) {
      for (const post of posts) {
        if (post.published !== true) continue;
        const title = post.title || 'Untitled';
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || String(post.id);
        const lastMod = post.updatedAt || post.createdAt || new Date().toISOString();

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
    const scanPaths = [
      '../briefings/daily', 
      '../briefings/hourly', 
      '../briefings/weekly',
      '../briefings/monthly',
      '../articles/weekly', 
      '../articles/monthly', 
      '../p',
      '../posts'
    ];

    const seenUrls = new Set();
    // Add existing URLs to set
    const existingMatches = urls.match(/<loc>(.*?)<\/loc>/g) || [];
    existingMatches.forEach(m => seenUrls.add(m.replace(/<\/?loc>/g, '')));

    scanPaths.forEach(relPath => {
      const dir = path.join(__dirname, relPath);
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.html'));
        files.forEach(file => {
          const stats = fs.statSync(path.join(dir, file));
          const lastMod = stats.mtime.toISOString().split('T')[0];
          
          // Construct loc based on the folder path
          const relFromRoot = path.relative(path.join(__dirname, '..'), path.join(dir, file));
          const loc = `${DOMAIN}/${relFromRoot}`;
          
          if (!seenUrls.has(loc)) {
            seenUrls.add(loc);
            let freq = 'weekly';
            let priority = '0.7';
            
            if (relPath.includes('hourly')) { freq = 'hourly'; priority = '1.0'; }
            else if (relPath.includes('daily')) { freq = 'daily'; priority = '0.9'; }
            else if (relPath.includes('weekly')) { freq = 'weekly'; priority = '0.8'; }
            
            urls += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastMod}</lastmod>
    <changefreq>${freq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
          }
        });
      }
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

    const rootSitemap = path.join(__dirname, '../sitemap.xml');
    const publicSitemap = path.join(__dirname, '../public/sitemap.xml');
    fs.writeFileSync(rootSitemap, sitemap);
    if (fs.existsSync(path.dirname(publicSitemap))) {
      fs.writeFileSync(publicSitemap, sitemap);
    }
    console.log(`✓ sitemap.xml generated with ${seenUrls.size} URLs!`);

  } catch (err) {
    console.error("Sitemap Generation Error:", err);
    process.exit(1);
  }
}

generateSitemap();
