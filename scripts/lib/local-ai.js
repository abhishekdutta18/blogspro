const fetch = require('node-fetch');

/**
 * Local AI Bridge (V1.0)
 * Connects to Ollama (127.0.0.1:11434) for offline Reinforcement Learning.
 */
async function askLocalAI(prompt, systemPrompt = "You are a professional financial strategist.") {
    try {
        const response = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            body: JSON.stringify({
                model: 'llama3:8b',
                prompt: prompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: 0.1, // Low temp for structural consistency (RL)
                    num_predict: 2048
                }
            })
        });

        if (!response.ok) throw new Error(`Ollama Error: ${response.statusText}`);
        const data = await response.json();
        return data.response;
    } catch (e) {
        console.error("❌ Local AI Failure:", e.message);
        throw e;
    }
}

module.exports = { askLocalAI };
