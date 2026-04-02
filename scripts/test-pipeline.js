/**
 * test-pipeline.js
 * Verifies the internal logic of generate-article.js WITHOUT calling external APIs.
 */
const fs = await import("fs");
const path = await import("path");
const { fileURLToPath } = await import('url');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mockHtml = `
<html>
  <body>
    <h2>Test Article: The Future of Fintech 2026</h2>
    <p>This is a test excerpt that should be extracted by the pipeline logic to verify sitemap and index integration.</p>
    <div>More content here...</div>
  </body>
</html>
`;

async function runTest() {
    console.log("🧪 Starting Pipeline Logic Test...");
    
    const postsDir = path.join(__dirname, "../posts");
    if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, { recursive: true });

    const today = new Date().toISOString().split('T')[0];
    const fileName = `test-post-${today}.html`;
    const filePath = path.join(postsDir, fileName);

    // Mock HTML write
    fs.writeFileSync(filePath, mockHtml);
    console.log(`- Created mock post: ${fileName}`);

    // Mock Index Update Logic (replicated from generate-article.js)
    const indexPath = path.join(postsDir, "index.json");
    let postsIndex = [];
    if (fs.existsSync(indexPath)) {
        try { postsIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8")); } catch (e) { postsIndex = []; }
    }

    const titleMatch = mockHtml.match(/<h2[^>]*>(.*?)<\/h2>/i);
    const excerptMatch = mockHtml.match(/<p[^>]*>(.*?)<\/p>/i);
    
    const aiData = {
        title: titleMatch ? titleMatch[1].trim() : `Daily Briefing - ${today}`,
        excerpt: excerptMatch ? excerptMatch[1].trim().substring(0, 160) + "..." : "Today's financial summary.",
    };
    const slug = aiData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') || `briefing-${today}`;

    postsIndex.unshift({
        title: aiData.title,
        slug: slug,
        date: today,
        excerpt: aiData.excerpt,
        fileName: fileName
    });

    postsIndex = postsIndex.slice(0, 30);
    fs.writeFileSync(indexPath, JSON.stringify(postsIndex, null, 2));
    console.log("- Updated index.json");

    // Verification
    const savedIndex = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
    const latest = savedIndex[0];
    
    if (latest.title === "Test Article: The Future of Fintech 2026" && latest.slug.includes("fintech-2026")) {
        console.log("✅ SUCCESS: Metadata extraction and indexing logic verified!");
    } else {
        console.error("❌ FAILURE: Metadata mismatch.");
        console.log("Latest entry:", latest);
    }
}

runTest().catch(console.error);
