import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = path.join(__dirname, '..');
const frequencies = ['hourly', 'daily', 'weekly', 'monthly'];

/**
 * Prunes duplicate entries for the same period.
 * For 'hourly', it keeps one per hour.
 * For 'daily', 'weekly', 'monthly', it keeps one per date.
 */
function cleanupGhosts() {
    console.log("👻 Starting BlogsPro Ghost Pruning Protocol...");

    frequencies.forEach(freq => {
        const type = (freq === 'hourly' || freq === 'daily') ? 'briefings' : 'articles';
        const dir = path.join(baseDir, type, freq);
        const indexPath = path.join(dir, 'index.json');

        if (!fs.existsSync(indexPath)) return;

        console.log(`📦 Processing ${freq.toUpperCase()} ${type}...`);
        const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        const seen = new Set();
        const newIndex = [];
        const filesToKeep = new Set();
        const filesToDelete = [];

        index.forEach(entry => {
            let key;
            if (freq === 'hourly') {
                const hour = new Date(entry.timestamp).getHours();
                key = `${entry.date}-${hour}`;
            } else {
                key = entry.date;
            }

            if (!seen.has(key)) {
                seen.add(key);
                newIndex.push(entry);
                filesToKeep.add(entry.fileName);
            } else {
                filesToDelete.push(entry.fileName);
            }
        });

        // Write cleaned index
        fs.writeFileSync(indexPath, JSON.stringify(newIndex, null, 2));
        console.log(`✅ Cleaned index.json. Kept ${newIndex.length} entries, removed ${filesToDelete.length} duplicates.`);

        // Delete redundant files
        filesToDelete.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log(`🗑️ Deleted ghost: ${file}`);
            }
        });
    });

    console.log("🏁 Pruning Complete. Terminal fidelity restored.");
}

cleanupGhosts();
