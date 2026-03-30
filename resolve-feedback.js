const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'knowledge', 'ai-feedback.json');
const content = fs.readFileSync(filePath, 'utf-8');

// Regex to find all complete JSON objects { ... }
const matches = content.match(/\{[\s\S]*?\}/g);
if (matches) {
    const uniqueObjects = new Set();
    const result = [];
    
    matches.forEach(m => {
        try {
            // Clean up internal conflict markers if any
            const cleaned = m.replace(/<<<<<<<[\s\S]*?=======/g, "").replace(/=======[\s\S]*?>>>>>>>[\s\S]*?\n/g, "");
            const obj = JSON.parse(cleaned);
            const key = JSON.stringify(obj);
            if (!uniqueObjects.has(key)) {
                uniqueObjects.add(key);
                result.push(obj);
            }
        } catch (e) {
            // If it's a broken chunk, skip or try harder
        }
    });

    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log(`Resolved ${result.length} unique feedback entries.`);
} else {
    console.error("No JSON objects found in feedback ledger.");
}
