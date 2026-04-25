import { initFirebase } from './lib/firebase-service.js';
import 'dotenv/config';

async function restoreAbout() {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = './knowledge/firebase-service-account.json';
    const { db } = initFirebase();
    if (!db) {
        console.error('❌ Firebase init failed');
        process.exit(1);
    }

    const aboutData = {
        name: 'BlogsPro',
        heading: 'Institutional Fintech Intelligence',
        tagline: 'Sharp insights for fintech practitioners.',
        bio: 'We publish practical fintech analysis, execution playbooks, and market breakdowns for builders and operators. Powered by a sovereign AI swarm.',
        mission: 'To democratize institutional-grade market intelligence through autonomous AI synthesis.',
        email: 'desk@blogspro.in',
        twitter: 'https://x.com/blogspro',
        linkedin: 'https://linkedin.com/company/blogspro',
        website: 'https://blogspro.in',
        avatarUrl: '',
        updatedAt: new Date()
    };

    try {
        console.log('📡 [Restore] Injecting site/about metadata...');
        await db.collection('site').doc('about').set(aboutData);
        console.log('✅ [Restore] site/about successfully restored.');
    } catch (e) {
        console.error(`❌ Restore failed: ${e.message}`);
    }
    process.exit(0);
}

restoreAbout();
