/**
 * 🧪 [V10.0] Remote Config Verification Utility
 * Simulates a Google Drive / External JSON fetch to verify hydration logic.
 */
import { hydrateRemoteContext } from './scripts/lib/remote-config.js';
import { hydrateSwarmPrompts, VERTICALS } from './scripts/lib/prompts.js';

async function testHydration() {
    console.log("🚀 Testing Swarm Hydration Flow...");
    console.log(`Initial Vertical Count: ${VERTICALS.length}`);

    // Mock environment with a fake config URL
    // In a real environment, this would be a Google Drive Direct Link
    const mockEnv = {
        REMOTE_CONFIG_URL: "https://raw.githubusercontent.com/abhishekdutta18/blogspro/main/manuscripts/v7/metadata.json"
    };

    try {
        const metadata = await hydrateRemoteContext(mockEnv);
        if (metadata) {
            hydrateSwarmPrompts(metadata);
            console.log(`✅ Success! New Vertical Count: ${VERTICALS.length}`);
            console.log("Sample Verticals:", VERTICALS.slice(0, 2));
        } else {
            console.log("ℹ️ No remote data fetched (expected for mock).");
        }
    } catch (e) {
        console.error("❌ Hydration Test Failed:", e.message);
    }
}

testHydration();
