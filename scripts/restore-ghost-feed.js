import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { syncToFirestore } from "./lib/storage-bridge.js";

/**
 * 👻 [V16.6] Ghost Feed Restoration Utility
 * Scans the local 'dist/' directory for strategic tomes and registers them 
 * retroactively to the homepage and Firestore feed.
 */

async function registerPost(fileName, frequency, env) {
    const filePath = path.join(process.cwd(), 'dist', fileName);
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf-8');
    const today = new Date().toISOString().split('T')[0];
    const category = 'Strategic Research';
    const publicUrl = `https://storage.googleapis.com/${env.FIREBASE_STORAGE_BUCKET}/${frequency}/${fileName}`;

    // 1. Metadata Extraction
    let title = `${frequency.toUpperCase()} Strategic Manuscript`;
    let excerpt = "Institutional strategic research and quantitative analysis.";

    const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i) || content.match(/<h1>([\s\S]*?)<\/h1>/i);
    if (titleMatch) title = titleMatch[1].replace(/Strategic Manuscript/i, '').replace(/\|/g, '').trim();

    const textOnly = content.replace(/<[^>]*>?/gm, ' ').trim();
    excerpt = textOnly.slice(0, 250) + (textOnly.length > 250 ? '...' : '');

    console.log(`📡 [Restoration] Indexing: ${title} [${frequency}]`);

    // 2. Update Static Index
    const indexDir = path.join(process.cwd(), 'articles', frequency);
    const indexPath = path.join(indexDir, 'index.json');
    if (!fs.existsSync(indexDir)) fs.mkdirSync(indexDir, { recursive: true });

    let index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf-8')) : [];
    const record = { title, date: today, timestamp: Date.now(), excerpt, fileName, type: 'article', frequency };
    
    index = [record, ...index.filter(i => i.fileName !== fileName)].slice(0, 20);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    // 3. Sync to Firestore
    const docId = `swarm-${frequency}-${Date.now()}`;
    await syncToFirestore('posts', {
        id: docId,
        title,
        excerpt,
        content: textOnly.slice(0, 1000),
        path: publicUrl,
        category,
        authorName: 'BlogsPro Institutional Hub',
        published: true,
        stage: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        views: 0
    }, env);

    console.log(`✅ [Restoration] Success: ${fileName}`);
}

async function restore() {
    console.log("🚀 [Ghost-Feed] Commencing Retroactive Strategic Registration...");
    const distPath = path.join(process.cwd(), 'dist');
    const files = fs.readdirSync(distPath);

    // Filter for strategic tomes missed in the last 24h
    const strategicTomes = files.filter(f => 
        (f.startsWith('swarm-monthly-') || f.startsWith('swarm-weekly-')) && 
        f.endsWith('.html')
    );

    console.log(`🔍 [Ghost-Feed] Found ${strategicTomes.length} candidate tomes.`);

    for (const file of strategicTomes) {
        const frequency = file.includes('monthly') ? 'monthly' : 'weekly';
        await registerPost(file, frequency, process.env);
    }

    console.log("🔒 [Ghost-Feed] Restoration Cycle Complete.");
}

restore().catch(console.error);
