import { askAI } from '../scripts/lib/ai-service.js';

async function testGhostMode() {
    console.log('🧪 Starting Ghost Mode Resilience Test...');
    
    try {
        const result = await askAI('Generate a research report about the future of AI.', '', {
            retryCount: 2,
            forceModel: 'non-existent-high-fidelity-model',
            role: 'research'
        });

        console.log('\n✅ TEST RESULT:');
        console.log('-----------------------------------');
        console.log(result);
        console.log('-----------------------------------');

        if (result.includes('[GHOST SIMULATION]')) {
            console.log('\n🏆 SUCCESS: Ghost Mode was correctly triggered and returned a deterministic manuscript.');
        } else {
            console.log('\n❌ FAILURE: Result does not contain Ghost Mode markers.');
        }
    } catch (error) {
        console.error('\n❌ CRITICAL ERROR during test:', error);
    }
}

testGhostMode();
