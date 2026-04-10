import { VERTICALS } from './lib/prompts.js';
import fs from 'fs';

/**
 * [V12.2] Modern GHA Matrix Discovery Bridge
 * ----------------------------------------
 * Exports essential swarm metadata to GitHub Actions environment.
 */
function exportMatrixConfig() {
    // 1. Extract Vertical IDs
    const verticalIds = VERTICALS.map(v => v.id);
    const jsonString = JSON.stringify(verticalIds);
    
    // 2. Output for GHA (Using modern $GITHUB_OUTPUT)
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `verticals=${jsonString}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `count=${verticalIds.length}\n`);
    } else {
        // Fallback for local testing
        console.log(`verticals=${jsonString}`);
    }
}

exportMatrixConfig();
