const fs = require('fs');
const path = require('path');

// Files that were modified
const modifiedFiles = [
  'js/utils.js',
  'js/config.js',
  'js/ai-core.js',
  'js/ai-tools.js',
  'js/ai/router.js',
  'js/ai/image-engine.js',
  'js/posts.js',
  'js/images-upload.js',
  'js/users.js'
];

const payload = {
  files: []
};

for (const file of modifiedFiles) {
  const filePath = path.join(__dirname, file);
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    payload.files.push({ path: file, content });
    console.log(`✓ Added ${file}`);
  } catch (err) {
    console.error(`✗ Failed to read ${file}:`, err.message);
  }
}

payload.message = 'Fix critical security vulnerabilities and improve reliability';

// Write deploy-payload.json
fs.writeFileSync('deploy-payload.json', JSON.stringify(payload, null, 2));
console.log(`\nCreated deploy-payload.json with ${payload.files.length} files`);
console.log(`Total payload size: ${(JSON.stringify(payload).length / 1024).toFixed(1)} KB`);
