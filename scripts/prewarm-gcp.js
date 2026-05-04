import { updateIndex } from './lib/storage-bridge.js';

async function prewarm() {
    console.log("🌐 Beginning GCP Storage Prewarm cascade...");
    const mappings = [
        { freq: 'hourly', url: 'https://blogspro.in/briefings/hourly/index.json' },
        { freq: 'daily', url: 'https://blogspro.in/briefings/daily/index.json' },
        { freq: 'weekly', url: 'https://blogspro.in/articles/weekly/index.json' }
    ];
    
    for (const mapping of mappings) {
        try {
            console.log(`⏳ Fetching public data for ${mapping.freq}...`);
            const res = await fetch(mapping.url);
            if (!res.ok) throw new Error(`Fetch failure: ${res.status}`);
            const data = await res.json();
            
            console.log(`✓ Found ${data.length} items. Synchronizing state records...`);
            for (const entry of data.slice().reverse()) { // Reverse to maintain unshift order
                await updateIndex(entry, mapping.freq);
            }
            console.log(`✨ Complete for ${mapping.freq}`);
        } catch (e) {
            console.error(`⚠️ Sync breakdown on ${mapping.freq}:`, e.message);
        }
    }
}

prewarm();
