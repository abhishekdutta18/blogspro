import 'dotenv/config';
async function test() {
  const vaultUrl = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev';
  const vaultSecret = 'BPRO_GIGA_PULSE_2026_HARDENED';
  const res = await fetch(`${vaultUrl}/vault`, { method: 'POST', headers: { 'X-Vault-Auth': vaultSecret } });
  const data = await res.json();
  const key = data.secrets?.GEMINI;
  if (key) {
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash-exp'];
    for (const model of models) {
      console.log('Testing Model:', model);
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=` + key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
      });
      console.log(`${model} Status:`, geminiRes.status);
      const geminiData = await geminiRes.json();
      console.log(`${model} Error:`, geminiData.error ? geminiData.error.message : 'SUCCESS');
    }
  }
}
test();
