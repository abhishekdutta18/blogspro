import 'dotenv/config';
async function test() {
  const vaultUrl = 'https://blogspro-pulse.abhishek-dutta1996.workers.dev';
  const vaultSecret = 'BPRO_GIGA_PULSE_2026_HARDENED';
  console.log('Sending request to vault...');
  const res = await fetch(`${vaultUrl}/vault`, { method: 'POST', headers: { 'X-Vault-Auth': vaultSecret } });
  const text = await res.text();
  console.log('Vault Response:', text);
}
test();
