import fs from 'fs';
import path from 'path';

function getAllFiles(dirPath, arrayOfFiles) {
  const files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      arrayOfFiles.push(path.join(dirPath, "/", file));
    }
  });

  return arrayOfFiles;
}

async function repairManuscriptAssets() {
    console.log("🎨 [Aesthetic-Repair] Initiating Robust Asset Path Realignment...");
    
    if (!fs.existsSync('articles')) {
        console.error("❌ 'articles' directory not found.");
        return;
    }

    const files = getAllFiles('articles').filter(f => f.endsWith('.html'));
    console.log(`🔍 Found ${files.length} manuscripts to repair.`);

    const replacements = [
        { 
            pattern: /src="\.\.\/favicon\.svg"/g, 
            replacement: 'src="/favicon.svg"' 
        },
        {
            pattern: /src="\.\.\/\.\.\/favicon\.svg"/g, 
            replacement: 'src="/favicon.svg"' 
        },
        {
            pattern: /href="\.\.\/css\//g,
            replacement: 'href="/css/'
        }
    ];

    let count = 0;
    for (const file of files) {
        try {
            let content = fs.readFileSync(file, 'utf8');
            let modified = false;

            for (const { pattern, replacement } of replacements) {
                if (pattern.test(content)) {
                    content = content.replace(pattern, replacement);
                    modified = true;
                }
            }

            if (modified) {
                fs.writeFileSync(file, content);
                console.log(`✅ Repaired: ${file}`);
                count++;
            }
        } catch (err) {
            console.error(`❌ Failed to repair ${file}:`, err.message);
        }
    }

    console.log(`✨ Asset Realignment Complete. Repaired ${count} files.`);
}

repairManuscriptAssets().catch(console.error);
