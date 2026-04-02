const fs = require('fs');

// Read the payload
const payload = JSON.parse(fs.readFileSync('deploy-payload.json', 'utf8'));

// Add deployment metadata
const deployPayload = {
  owner: 'abhishekdutta18',
  repo: 'blogspro',
  branch: 'main',
  message: payload.message,
  files: payload.files,
  pr: false // Deploy directly to main, not as PR
};

console.log('📦 Deploying to GitHub...');
console.log(`   Owner: ${deployPayload.owner}`);
console.log(`   Repo: ${deployPayload.repo}`);
console.log(`   Branch: ${deployPayload.branch}`);
console.log(`   Files: ${deployPayload.files.length}`);
console.log(`   PR Mode: ${deployPayload.pr}\n`);

// Call Cloudflare Worker
fetch('https://github-push.abhishekdutta18.workers.dev/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(deployPayload)
})
.then(res => {
  console.log(`Response Status: ${res.status}`);
  return res.json();
})
.then(data => {
  console.log('\n✅ Deployment successful!');
  console.log(JSON.stringify(data, null, 2));
  if (data.url) console.log(`\n🔗 View on GitHub: ${data.url}`);
  if (data.commit) console.log(`📝 Commit: ${data.commit}`);
})
.catch(err => {
  console.error('\n❌ Deployment failed:');
  console.error(err.message);
  process.exit(1);
});
