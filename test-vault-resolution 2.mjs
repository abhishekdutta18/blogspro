import 'dotenv/config';
async function test() {
  const vaultUrl = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev';
  const vaultSecret = 'BPRO_GIGA_PULSE_2026_HARDENED';
  const res = await fetch(`${vaultUrl}/vault`, { method: 'POST', headers: { 'X-Vault-Auth': vaultSecret } });
  const data = await res.json();
  const key = data.secrets?.GEMINI;
  console.log('Vault Response GEMINI Key: ' + (key ? key.substring(0, 10) + '...' + key.substring(key.length - 5) : 'MISSING'));
  
  if (key) {
    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + key, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] })
    });
    console.log('Gemini Direct Test Status:', geminiRes.status);
    const geminiData = await geminiRes.json();
    console.log('Gemini Direct Test Data:', JSON.stringify(geminiData));
  }
}
test();
