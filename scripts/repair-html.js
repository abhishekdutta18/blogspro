const fs = require('fs');
const path = require('path');

function repairHtmlFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf-8');

    // 1. Remove recursive broken <p> tags around block elements
    content = content.replace(/<p>\s*(<div|<ul|<h2|<h3|<section)/gi, '$1');
    content = content.replace(/(<\/div>|<\/ul>|<\/h2>|<\/h3>|<\/section>)\s*<\/p>/gi, '$1');
    
    // 2. Remove AI hallucinated code blocks and raw JSON dumps
    content = content.replace(/```[a-z]*\s*/gi, '');
    content = content.replace(/```/gi, '');
    
    // 3. Prevent duplicate empty paragraph chains
    content = content.replace(/(<p><\/p>\s*)+/gi, '');
    
    // 4. Remove AI hallucinated SVGs directly injected into strings
    content = content.replace(/<svg[\s\S]*?<\/svg>/gi, '');

    // 5. Remove inner <script> blocks hallucinated by AI
    content = content.replace(/<div class="manuscript-body">([\s\S]*?)<\/div>\s*<footer/i, (match, bodyContent) => {
        const cleanedBody = bodyContent.replace(/<script[\s\S]*?<\/script>/gi, '');
        return `<div class="manuscript-body">${cleanedBody}</div>\n        <footer`;
    });

    fs.writeFileSync(filePath, content, 'utf-8');
    console.log(`Repaired: ${filePath}`);
}

function processDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.html') && !fullPath.includes('demo') && !fullPath.includes('smoke')) {
            repairHtmlFile(fullPath);
        }
    }
}

const baseDir = path.join(__dirname, '..');
processDirectory(path.join(baseDir, 'articles'));
processDirectory(path.join(baseDir, 'briefings'));
console.log("All files repaired globally.");
