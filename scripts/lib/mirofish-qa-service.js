import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MIROFISH_CLI = path.join(__dirname, "../../mirofish/backend/swarm-audit-cli.py");

/**
 * runSwarmAudit
 * High-fidelity institutional review via MiroFish Swarm simulation
 */
async function runSwarmAudit(content, frequency = "daily") {
    console.log("🛠️  Preparing MiroFish Swarm Review...");
    
    // 1. Unique IO to prevent parallel collisions
    const requestId = Date.now() + "_" + Math.floor(Math.random() * 1000);
    const tempInput = path.join(__dirname, `../../tmp/swarm_input_${requestId}.html`);
    const tempOutput = path.join(__dirname, `../../tmp/swarm_qa_verdict_${requestId}.json`);
    
    const tmpDir = path.dirname(tempInput);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    fs.writeFileSync(tempInput, content, 'utf-8');

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python3", [
            MIROFISH_CLI,
            "--file", tempInput,
            "--freq", frequency,
            "--output", tempOutput // Passed to CLI if supported, or we just expect it in CLI logic
        ]);

        let output = "";
        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
            console.log(`[SWARM] ${data.toString().trim()}`);
        });

        pythonProcess.on("close", async (code) => {
            // Persistence Wait: Allow OS to flush Python IO to disk
            await new Promise(r => setTimeout(r, 150));

            const verdictPath = tempOutput; 
            
            if (code !== 0 || !fs.existsSync(verdictPath)) {
                console.warn("⚠️ MiroFish Swarm failed (or returned error). Engaging Light Node Auditor fallback...");
                return resolve(runLightAuditor(content, frequency));
            }

            try {
                const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8'));
                console.log(`✅ Consensus: ${verdict.status} (Score: ${verdict.consensus_score})`);
                
                // Cleanup
                try { fs.unlinkSync(tempInput); fs.unlinkSync(verdictPath); } catch(e) {}

                if (verdict.status === "REJECT") {
                    return reject(new Error(`Swarm Rejected: ${JSON.stringify(verdict.agent_critiques)}`));
                }
                resolve(content);
            } catch (e) {
                resolve(runLightAuditor(content, frequency));
            }
        });
    });
}

/**
 * runLightAuditor
 * Fallback institutional review for GHA environment resiliency
 */
function runLightAuditor(content, frequency) {
    console.log("🛡️ Running Light Node Auditor (Internal Fallback)...");
    const isStale = /2023|2024/.test(content);
    if (isStale) {
        throw new Error("Light Auditor REJECT: Content contains stale dates.");
    }
    return content;
}

/**
 * generateMiroForecast
 * Generates a swarm-simulated market prediction using both
 * SimulationRunner and Forecaster persona.
 */
async function generateMiroForecast(context, type = "general") {
    console.log(`🚀 Generating MiroFish ${type.toUpperCase()} Forecast...`);
    
    // 1. Ensure tmp directory exists
    const tmpDir = path.dirname(TEMP_CONTENT);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // 2. Write context to temp file
    const forecastInput = `TYPE: ${type.toUpperCase()}\nCONTEXT: ${context}`;
    fs.writeFileSync(TEMP_CONTENT, forecastInput, 'utf-8');

    return new Promise((resolve, reject) => {
        // We call the MiroFish script with a --forecast flag
        const pythonProcess = spawn("python3", [
            MIROFISH_CLI,
            "--file", TEMP_CONTENT,
            "--mode", "forecast"
        ]);

        let output = "";
        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                console.warn("⚠️ MiroFish Forecast CLI failed. Falling back to internal engine.");
                return resolve(""); // Graceful degradation
            }
            
            const forecastPath = path.join(tmpDir, "mirofish_forecast.json");
            if (fs.existsSync(forecastPath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(forecastPath, 'utf-8'));
                    resolve(data.forecast || "");
                } catch (e) { resolve(""); }
            } else {
                resolve("");
            }
        });
    });
}

export { runSwarmAudit, generateMiroForecast };
