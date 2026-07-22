import { askAI } from '../scripts/lib/ai-service.js';

async function testAIService() {
  console.log('Fetching Vault secrets...');
  const vaultUrl = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev';
  const vaultSecret = 'BPRO_GIGA_PULSE_2026_HARDENED';
  const res = await fetch(`${vaultUrl}/vault`, { method: 'POST', headers: { 'X-Vault-Auth': vaultSecret } });
  if (!res.ok) {
    console.error('Failed to fetch vault:', res.status);
    return;
  }
  const data = await res.json();
  const secrets = data.secrets || {};

  // Populate process.env and pass secrets in the environment
  process.env.GEMINI_API_KEY = secrets.GEMINI;
  process.env.GROQ_API_KEY = secrets.GROQ;
  process.env.SAMBANOVA_API_KEY = secrets.SAMBANOVA; // This contains the Cerebras key starting with 'csk-'
  process.env.HF_TOKEN = secrets.HUGGINGFACE;
  process.env.VAULT_MASTER_KEY = 'bpro_institutional_master_2026_v54';
  process.env.SWARM_AI_BRIDGE = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev/ai-gateway';
  
  console.log('\n--- 1. Testing Direct Groq ---');
  try {
    const groqReply = await askAI('Respond with exactly: DIRECT_GROQ_OK', { model: 'llama-3.3-70b-versatile', role: 'research' });
    console.log('Direct Groq reply:', groqReply);
  } catch (err) {
    console.error('Direct Groq test failed:', err);
  }

  console.log('\n--- 2. Testing Direct Gemini (Flash fallback) ---');
  try {
    const geminiReply = await askAI('Respond with exactly: DIRECT_GEMINI_OK', { model: 'gemini-3.5-flash', role: 'draft' });
    console.log('Direct Gemini reply:', geminiReply);
  } catch (err) {
    console.error('Direct Gemini test failed:', err);
  }

  console.log('\n--- 3. Testing Direct Cerebras (via Re-routed SambaNova Key) ---');
  try {
    const cerebrasReply = await askAI('Respond with exactly: DIRECT_CEREBRAS_OK', { model: 'zai-glm-4.7', role: 'generate' });
    console.log('Direct Cerebras reply:', cerebrasReply);
  } catch (err) {
    console.error('Direct Cerebras test failed:', err);
  }

  console.log('\n--- 4. Testing Groq Proxy via Swarm AI Bridge ---');
  try {
    const proxyReply = await askAI('Respond with exactly: PROXY_GROQ_OK', { model: 'llama-3.3-70b-versatile', role: 'research', env: { GROQ_API_KEY: 'REPLACE_WITH_KEY' } });
    console.log('Proxy Groq reply:', proxyReply);
  } catch (err) {
    console.error('Proxy Groq test failed:', err);
  }
}

testAIService();
