import { initFirebase } from './lib/firebase-service.js';

async function checkFile() {
    const { storageBucket } = initFirebase();
    const targetFile = 'swarm-hourly-1776148977438.html';
    
    const possiblePaths = [
        `articles/weekly/${targetFile}`,
        `weekly/${targetFile}`,
        targetFile
    ];

    console.log(`🔍 Checking location of: ${targetFile}`);

    for (const p of possiblePaths) {
        const file = storageBucket.file(p);
        const [exists] = await file.exists();
        console.log(`${exists ? '✅' : '❌'} ${p}`);
    }
}

checkFile().catch(console.error);
