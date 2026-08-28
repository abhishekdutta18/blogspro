import fs from 'fs';
let content = fs.readFileSync('wrangler.toml', 'utf8');
content = content.replace(/\n\n\n\n# KV cache worker/, '\n[build]\ncommand = "echo \'Skipping build\'"\n\n# KV cache worker');
fs.writeFileSync('wrangler.toml', content);
