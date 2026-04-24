import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = 'blogspro-ai';
const API_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

async function buildStaticPosts() {
  const outDir = path.join(__dirname, '../p');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const templatePath = path.join(__dirname, 'templates/post.html');
  if (!fs.existsSync(templatePath)) {
    console.error("Template post.html not found!");
    process.exit(1);
  }
  let template = fs.readFileSync(templatePath, 'utf8');

  // Fix relative paths for files served from /p/ folder
  template = template
    .replace(/(href|src)="(?!\/\/|http)(?!.\/)([^"]+)"/g, '$1="../$2"')
    .replace(/import\("\.\/js\//g, 'import("../js/')
    .replace(/href="index\.html/g, 'href="../index.html')
    .replace(/href="login\.html/g, 'href="../login.html')
    .replace(/href="register\.html/g, 'href="../register.html')
    .replace(/href="dashboard\.html/g, 'href="../dashboard.html')
    .replace(/href="admin\.html/g, 'href="../admin.html');

  try {
    console.log("Fetching posts from Firestore...");
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
    if (!Array.isArray(data) || data.length === 0) return console.log("No posts found.");

    let count = 0;
    for (const item of data) {
      if (!item.document) continue;
      const doc = item.document;
      const docId = doc.name.split('/').pop();
      const fields = doc.fields;
      
      if (!fields || !fields.published || !fields.published.booleanValue) continue;

      const title = fields.title?.stringValue || 'Untitled';
      const excerpt = fields.excerpt?.stringValue || '';
      const banner = fields.coverImage?.stringValue || 'https://blogspro.in/og-default.jpg';
      let content = fields.content?.stringValue || '';
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || docId;
      const category = fields.category?.stringValue || 'General';
      const author = fields.authorName?.stringValue || 'BlogsPro';
      const dateIso = doc.createTime || new Date().toISOString();
      const url = `https://blogspro.in/p/${slug}.html`;

      // 1. Hydrate Meta Tags
      const metaTags = `
  <title>${title} — BlogsPro</title>
  <meta name="description" content="${excerpt}">
  <meta property="og:title" content="${title} — BlogsPro">
  <meta property="og:description" content="${excerpt}">
  <meta property="og:image" content="${banner}">
  <meta property="og:url" content="${url}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title} — BlogsPro">
  <meta name="twitter:description" content="${excerpt}">
  <meta name="twitter:image" content="${banner}">
  <link rel="canonical" href="${url}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title}",
    "description": "${excerpt}",
    "image": "${banner}",
    "author": { "@type": "Person", "name": "${author}" },
    "publisher": { "@type": "Organization", "name": "BlogsPro", "url": "https://blogspro.in" },
    "datePublished": "${dateIso}",
    "url": "${url}"
  }
  </script>`;

      let html = template.replace(/<!-- SSG_META_START -->[\s\S]*?<!-- SSG_META_END -->/, `<!-- SSG_META_START -->${metaTags}\n  <!-- SSG_META_END -->`);

      // 2. Inject Static Content
      const articleHtml = `
        <div class="article-meta-top">
          <span class="article-cat">${category}</span>
          <span class="article-date">${new Date(dateIso).toLocaleDateString('en-IN', {day:'numeric', month:'long', year:'numeric'})}</span>
        </div>
        <h1 class="article-title">${title}</h1>
        ${excerpt ? `<p class="article-excerpt">${excerpt}</p>` : ''}
        ${banner ? `<img src="${banner}" class="article-cover" alt="${title}" style="width:100%; border-radius:8px; margin-bottom:2rem;">` : ''}
        <div class="article-content">${content}</div>
      `;
      
      html = html.replace(/<!-- SSG_CONTENT_START -->[\s\S]*?<!-- SSG_CONTENT_END -->/, `<!-- SSG_CONTENT_START -->${articleHtml}\n  <!-- SSG_CONTENT_END -->`);

      // 3. Force the SPA to load this exact post
      html = html.replace("const id = new URLSearchParams(location.search).get('id');", `const id = "${docId}";`);

      const outPath = path.join(outDir, `${slug}.html`);
      
      // Minification
      const minifiedHtml = html
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--(?![\s\S]*?SSG_)[\s\S]*?-->/g, '');

      fs.writeFileSync(outPath, minifiedHtml);
      console.log(`✓ Generated: p/${slug}.html`);
      count++;
    }
    console.log(`\nSuccessfully built ${count} static pages!`);
  } catch (err) {
    console.error("SSG Error:", err);
    process.exit(1);
  }
}

buildStaticPosts();
