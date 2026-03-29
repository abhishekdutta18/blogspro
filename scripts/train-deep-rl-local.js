const rl = require('./lib/reinforcement');
const { askLocalAI } = require('./lib/local-ai');
const { validateContent } = require('./lib/validator');

/**
 * Deep Reinforcement Learning Engine (Local V2.0)
 * Performs 1,500 iterations to optimize the "Bloomberg Masterpiece" structure.
 */

const verticals = [
    "Global Macro Drift", "Debt & Sovereignty", "Digital Rails", 
    "Equities & Alpha", "Regulatory Ledger", "FX & Cross-Border", 
    "Commodity Pulse", "Emerging Markets", "Asset Allocation", 
    "Scribe Analytics", "Capital Flows (PE/VC)", "Insurance & Risk", 
    "Offshore & GIFT City"
];

function sanitizeJSON(content) {
    const chartMatch = content.match(/<chart-data>([\s\S]*?)<\/chart-data>/);
    if (!chartMatch) return content;
    
    let raw = chartMatch[1].trim();
    
    // 1. Total-Fidelity: Fix missing quotes around labels & text values
    // Fix first element: [[Label, ... (Updated for digits, /, $, %, ., (, ))
    raw = raw.replace(/\[\s*([a-zA-Z0-9$%\/][a-zA-Z0-9\s\-_&$.\/%()]*)\s*,/g, '["$1",');
    // Fix second element if it's unquoted text: ..., Value]] (Updated for digits)
    raw = raw.replace(/,\s*([a-zA-Z0-9$%\/\.][a-zA-Z0-9\s\-_&$.\/%()]*)\s*\]/g, ', "$1"]');
    
    // 2. Standard cleanup
    raw = raw.replace(/'/g, '"'); // Single quotes to double quotes
    raw = raw.replace(/,\s*\]/g, ']'); // Trailing commas in arrays
    raw = raw.replace(/,\s*\}/g, '}'); // Trailing commas in objects
    
    return content.replace(chartMatch[1], "\n" + raw + "\n");
}

async function runLocalRL(iterations = 1500) {
    console.log(`🚂 Starting Institutional Reinforcement Training (${iterations} Iterations)...`);
    const startTime = Date.now();
    let totalSuccesses = 0;
    let totalFailures = 0;

    for (let i = 1; i <= iterations; i++) {
        const v = verticals[Math.floor(Math.random() * verticals.length)];
        const systemContext = rl.getReinforcementContext();
        
        const systemPrompt = `You are an institutional Bloomberg Strategist. You write raw, high-density financial terminal blocks.
        
${systemContext}

STRICT RULE: No conversational fluff. No "In this chapter". No "As discussed". Start directly with <h2>.`;

        const prompt = `Write a 2-paragraph strategic analysis for the '${v}' vertical. 
        
REQUIREMENTS:
1. Exactly one <h2> title.
2. One <details id="meta-excerpt"> summary.
3. One Markdown table with at least 5 metrics (| Metric | Observation | Alpha Impact |).
4. At least 2 hyperlinked citations like [Source](URL).
5. One <div id="chart_${v.toLowerCase().replace(/ /g, '_')}"></div> followed by <chart-data>[[label, value]]</chart-data>.`;

        try {
            let output = await askLocalAI(prompt, systemPrompt);
            output = sanitizeJSON(output);
            
            // Production-Grade Auditor
            const errors = validateContent(output);

            if (errors.length === 0) {
                rl.logSuccess(v, "Success iteration " + i, output);
                totalSuccesses++;
            } else {
                console.warn(`[Iteration ${i}] FAILED: ${errors.join(' | ')}`);
                rl.logFailure(v, errors, output);
                totalFailures++;
                
                // Reinforcement: Immediate correction attempt (Mini-Loop)
                const correctionPrompt = `[SYSTEM REJECTION]: Your output failed validation. FIX THESE ISSUES IMMEDIATELY:\n${errors.map(e => "- " + e).join('\n')}\n\nSTRICT RULE: JSON inside <chart-data> must use "double quotes" and no trailing commas.\n\nCONTENT TO FIX:\n${output}`;
                let recovery = await askLocalAI(correctionPrompt, systemPrompt);
                recovery = sanitizeJSON(recovery);
                const recoveryErrors = validateContent(recovery);
                
                if (recoveryErrors.length === 0) {
                    rl.logSuccess(v, "Success on recovery " + i, recovery);
                    totalSuccesses++;
                } else {
                    rl.logFailure(v, ["Recovery Failed: " + recoveryErrors[0]], recovery);
                }
            }

        } catch (e) {
            console.error(`❌ Iteration ${i} failed: ${e.message}`);
            totalFailures++;
            // Sleep slightly on error to let Ollama breathe
            await new Promise(r => setTimeout(r, 2000));
        }

        // Live Update for UI (Moved outside try/catch for resilience)
        rl.updateHeartbeat(i, iterations, totalSuccesses, totalFailures);
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n✅ Reinforcement Training Complete in ${duration} minutes.`);
    console.log(`🏆 Final Stats: Success: ${totalSuccesses}, Failures: ${totalFailures}`);
    
    rl.save();
    rl.stopHeartbeat();
}

// Check for command line iterations or default to 1500
const iters = parseInt(process.argv[2]) || 1500;
runLocalRL(iters).catch(console.error);
