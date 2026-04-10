/**
 * Remote Config Test Runner
 * Verifies that the Swarm can hydrate its metadata from a remote URL.
 */
import { hydrateRemoteContext } from './lib/remote-config.js';
import { VERTICALS, CONSENSUS_PERSONAS, hydrateSwarmPrompts } from './lib/prompts.js';
import fs from 'node:fs';
import path from 'node:path';

async function testHydration() {
    console.log("🚀 Testing Remote Hydration...");
    
    // Initial State Check
    console.log(`- Initial Verticals: ${VERTICALS.length}`);
    console.log(`- Initial Personas: ${CONSENSUS_PERSONAS.length}`);

    // Mock a local URL using the file protocol for testing if needed, 
    // but here we just point to the newly created JSON.
    const mockConfigPath = path.resolve('./institutional-metadata.json');
    const mockUrl = `file://${mockConfigPath}`;

    process.env.REMOTE_CONFIG_URL = mockUrl;

    try {
        console.log(`- Fetching from: ${mockUrl}`);
        const metadata = await hydrateRemoteContext();
        
        if (metadata) {
            console.log("✅ Remote Data Fetched Successfully.");
            hydrateSwarmPrompts(metadata);
            console.log(`- Updated Verticals: ${VERTICALS.length}`);
            console.log(`- Updated Personas: ${CONSENSUS_PERSONAS.length}`);
            
            if (VERTICALS.length > 0 && VERTICALS[0].id === 'macro') {
                console.log("🌟 HYDRATION VERIFIED: 'macro' sector detected.");
            } else {
                console.warn("⚠️ Hydration might have failed or data is empty.");
            }
        } else {
            console.error("❌ Hydration failed: No metadata returned.");
        }
    } catch (err) {
        console.error("❌ Test Crashed:", err.message);
    }
}

testHydration();
