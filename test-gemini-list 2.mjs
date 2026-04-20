import 'dotenv/config';
async function test() {
  const vaultUrl = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev';
  const vaultSecret = 'BPRO_GIGA_PULSE_2026_HARDENED';
  const res = await fetch(`${vaultUrl}/vault`, { method: 'POST', headers: { 'X-Vault-Auth': vaultSecret } });
  const data = await res.json();
  const key = data.secrets?.GEMINI;
  if (key) {
    console.log('Listing Models...');
    const geminiRes = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key, {
      method: 'GET', headers: { 'Content-Type': 'application/json' }
    });
    const geminiData = await geminiRes.json();
    if (geminiData.models) {
      console.log('Available Models:', geminiData.models.map(m => m.name).join(', '));
    } else {
      console.log('Error:', JSON.stringify(geminiData));
    }
  }
}
test();
