const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const MIROFISH_CLI = path.join(__dirname, "../../mirofish/backend/swarm-audit-cli.py");
const TEMP_CONTENT = path.join(__dirname, "../../tmp/swarm_input.html");

/**
 * runSwarmAudit
 * High-fidelity institutional review via MiroFish Swarm simulation
 */
async function runSwarmAudit(content, frequency = "daily") {
    console.log("🛠️  Preparing MiroFish Swarm Review...");
    
    // 1. Ensure tmp directory exists
    const tmpDir = path.dirname(TEMP_CONTENT);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // 2. Write content to temp file for Python consumption
    fs.writeFileSync(TEMP_CONTENT, content, 'utf-8');

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn("python3", [
            MIROFISH_CLI,
            "--file", TEMP_CONTENT,
            "--freq", frequency
        ]);

        let output = "";
        let errorOutput = "";

        pythonProcess.stdout.on("data", (data) => {
            output += data.toString();
            // Real-time log streaming for terminal visibility
            const line = data.toString().trim();
            if (line) console.log(`[SWARM] ${line}`);
        });

        pythonProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });

        pythonProcess.on("close", (code) => {
            if (code !== 0) {
                console.error(`❌ Swarm CLI Process Error (Code ${code}):`, errorOutput);
                return reject(new Error("MiroFish Swarm QA failed at runtime."));
            }

            // 3. Read the verdict produced by the CLI
            const verdictPath = path.join(tmpDir, "swarm_qa_verdict.json");
            if (fs.existsSync(verdictPath)) {
                try {
                    const verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8'));
                    console.log(`✅ Swarm Consensus reached: ${verdict.status} (Score: ${verdict.consensus_score})`);
                    
                    // Format the verdict into the expected 'audited content' format
                    // If MiroFish rejects, we treat it as an error to trigger fallback
                    if (verdict.status === "REJECT") {
                        return reject(new Error(`Swarm Rejected Content: ${JSON.stringify(verdict.agent_critiques)}`));
                    }
                    
                    // Return the original content (already verified by swarm)
                    resolve(content); 
                } catch (e) {
                    reject(new Error("Failed to parse Swarm verdict."));
                }
            } else {
                reject(new Error("Swarm verdict not found."));
            }
        });
    });
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

module.exports = { runSwarmAudit, generateMiroForecast };
