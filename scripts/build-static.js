const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'blogspro-ai';
const API_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;

async function buildStaticPosts() {
  const outDir = path.join(__dirname, '../p');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const templatePath = path.join(__dirname, '../post.html');
  let template = fs.readFileSync(templatePath, 'utf8');

  // Fix relative paths for files served from /p/ folder
  template = template
    .replace(/href="css\//g, 'href="../css/')
    .replace(/src="js\//g, 'src="../js/')
    .replace(/href="assets\//g, 'href="../assets/')
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

      // 1. Hydrate SEO Tags
      let html = template
        .replace(/<title>.*?<\/title>/gi, `<title>${title} — BlogsPro</title>`)
        .replace(/<meta name="description".*?>/gi, `<meta name="description" content="${excerpt}">`);

      const ogTags = `
        <!-- SSG Injected -->
        <meta property="og:title" content="${title} — BlogsPro">
        <meta property="og:description" content="${excerpt}">
        <meta property="og:image" content="${banner}">
        <meta property="og:url" content="https://blogspro.in/p/${slug}.html">
        <meta property="og:type" content="article">
        <meta name="twitter:card" content="summary_large_image">
      `;
      html = html.replace('</head>', `${ogTags}\n</head>`);

      // 2. Inject raw content for Web Crawlers (Optional, but best for SEO)
      const articleHtml = `
        <div class="article-meta-top">
          <span class="article-cat">${fields.category?.stringValue || 'General'}</span>
        </div>
        <h1 class="article-title">${title}</h1>
        <img src="${banner}" class="article-cover" alt="Cover">
        <div class="article-body">${content}</div>
      `;
      html = html.replace('<div id="articleWrap"></div>', `<div id="articleWrap">${articleHtml}</div>`);

      // 3. Trick the SPA into running natively (keeps comments & auth live!)
      html = html.replace("const id = new URLSearchParams(location.search).get('id');", `const id = "${docId}";`);

      const outPath = path.join(outDir, `${slug}.html`);
      fs.writeFileSync(outPath, html);
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
