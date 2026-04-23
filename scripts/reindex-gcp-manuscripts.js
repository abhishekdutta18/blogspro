import 'dotenv/config';
import { 
    listAllManuscripts, 
    getCloudMedia, 
    updateIndex, 
    syncToFirestore,
    getInstitutionalSettings
} from './lib/storage-bridge.js';

async function reindex() {
    console.log("🚀 [Re-Indexer] Initiating Global Institutional Sync...");
    const env = process.env;
    
    // 1. Discovery
    const items = await listAllManuscripts(env);
    console.log(`📂 [Cloud] Found ${items.length} objects in manuscripts/ prefix.`);

    // 2. Filter and Group
    const htmlFiles = items.filter(f => f.name.endsWith('.html'));
    console.log(`📄 [Cloud] Filtering for ${htmlFiles.length} HTML manuscripts.`);

    const reportEntries = [];

    for (const file of htmlFiles) {
        const jobId = file.name.split('/').pop().replace('.html', '');
        console.log(`🧬 [Sync] Processing Job [${jobId}]...`);

        try {
            const html = await getCloudMedia(file.name, env);
            if (!html) {
                console.warn(`⚠️ [Sync] Could not fetch content for ${file.name}`);
                continue;
            }

            // Extract Metadata (Institutional Schema)
            const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1>([\s\S]*?)<\/h1>/i);
            const title = titleMatch ? titleMatch[1].replace(/Strategic Manuscript/i, '').replace(/\|/g, '').trim() : `Strategic Pulse ${jobId}`;
            
            const textOnly = html.replace(/<[^>]*>?/gm, '').trim();
            const excerpt = textOnly.slice(0, 250).replace(/\s+/g, ' ') + (textOnly.length > 250 ? '...' : '');

            // Frequency Detection
            // Monthly: 11 digits (e.g. 24276116106) OR explicitly 'monthly' in path
            // Daily: 13 digits (Timestamp) OR explicitly 'daily' in path
            let frequency = 'daily';
            if (jobId.length === 11 || jobId.includes('monthly')) frequency = 'monthly';
            if (jobId.length === 13 || jobId.includes('daily')) frequency = 'daily';

            const entry = {
                id: jobId,
                title,
                excerpt,
                timestamp: file.timeCreated,
                frequency,
                url: `manuscripts/${jobId}.html`,
                pdfUrl: `manuscripts/${jobId}.pdf`,
                type: 'article'
            };

            reportEntries.push(entry);
            console.log(`✅ [Metadata] Extracted: "${title}" [${frequency}]`);
        } catch (e) {
            console.error(`❌ [Sync] Error processing ${file.name}:`, e.message);
        }
    }

    // 3. Batch Persistence
    console.log(`🏗️ [Persistence] Synchronizing ${reportEntries.length} entries to Index & Firestore...`);
    
    // Sort by timestamp descending
    reportEntries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    for (const entry of reportEntries) {
        try {
            console.log(`🗂️ [Dual-Sync] Updating ${entry.frequency} index for "${entry.id}"...`);
            // Individual syncing to avoid KV/Firestore lock contention in massive batches
            await updateIndex(entry, entry.frequency, env);
            await syncToFirestore("articles", entry, env);
        } catch (e) {
            console.error(`❌ [Persistence] Batch error for ${entry.id}:`, e.message);
        }
    }

    console.log("🏁 [Re-Indexer] Global Synchronization Complete.");
}

reindex().catch(err => {
    console.error("🚨 Fatal Indexing Error:", err.message);
    process.exit(1);
});
