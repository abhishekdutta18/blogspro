import { initFirebase } from './lib/firebase-service.js';

async function auditAll() {
    const { storageBucket } = initFirebase();
    console.log(`📡 [Audit] Storage Bucket: ${storageBucket.name}`);

    const [files] = await storageBucket.getFiles({ prefix: '' });
    console.log(`📄 [Found] ${files.length} total files in bucket.`);

    // List top 20 files
    files.slice(0, 20).forEach(f => {
        console.log(`  - ${f.name}`);
    });
}

auditAll().catch(console.error);
