import fs from 'fs';
const envPath = '.env';
const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split('\n');

const validLines = lines.filter(line => {
    // Keep comments and valid KEY=VALUE pairs that aren't part of the corrupted block
    if (line.startsWith('#') || line.trim() === '') return true;
    if (line.includes('=') && !line.includes('MIIEvQIBADANBgkqhkiG9w0BAQEFA')) return true;
    return false;
});

// Re-add the clean FIREBASE_SERVICE_ACCOUNT if it was stripped or ensure it's at the end
const saKey = 'FIREBASE_SERVICE_ACCOUNT';
const saLine = lines.find(l => l.startsWith(saKey));
if (saLine && !validLines.some(l => l.startsWith(saKey))) {
    validLines.push(saLine);
}

fs.writeFileSync(envPath, validLines.join('\n'));
console.log("✅ .env cleaned.");
