import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import path from 'path';

let db, storageBucket;

/**
 * Initialize Firebase Admin SDK
 */
export function initFirebase() {
    if (admin.apps.length > 0) return { db, storageBucket };

    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID || 'blogspro-ai';
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

    let options = {
        projectId: projectId,
        storageBucket: bucketName
    };

    // If service account path is provided, use it (for local testing)
    if (serviceAccountPath) {
        try {
            const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
            options.credential = admin.credential.cert(serviceAccount);
        } catch (e) {
            console.warn('⚠️ Could not load service account from path, falling back to default credentials');
        }
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // For CI/CD environments
        try {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            options.credential = admin.credential.cert(serviceAccount);
        } catch (e) {
            console.warn('⚠️ Could not parse FIREBASE_SERVICE_ACCOUNT env var');
        }
    }

    admin.initializeApp(options);
    db = admin.firestore();
    storageBucket = admin.storage().bucket();

    return { db, storageBucket };
}

/**
 * Upload a file to Firebase Storage
 * @param {string} localPath 
 * @param {string} destination 
 * @param {string} contentType 
 */
export async function uploadToStorage(localPath, destination, contentType = 'text/html') {
    const { storageBucket } = initFirebase();
    try {
        await storageBucket.upload(localPath, {
            destination,
            metadata: {
                contentType,
                cacheControl: 'public, max-age=31536000'
            }
        });
        
        // Make the file public (optional - adjust based on needs)
        const file = storageBucket.file(destination);
        await file.makePublic();
        
        const publicUrl = `https://storage.googleapis.com/${storageBucket.name}/${destination}`;
        console.log(`✅ [Firebase] Uploaded to: ${publicUrl}`);
        return publicUrl;
    } catch (error) {
        console.error(`❌ [Firebase] Upload failed: ${error.message}`);
        throw error;
    }
}

/**
 * Download a file from Firebase Storage
 * @param {string} fileName 
 * @returns {Promise<string>} File content
 */
export async function downloadFromStorage(fileName) {
    const { storageBucket } = initFirebase();
    try {
        const file = storageBucket.file(fileName);
        const [content] = await file.download();
        return content.toString('utf8');
    } catch (error) {
        console.error(`❌ [Firebase] Download failed: ${error.message}`);
        throw error;
    }
}
/**
 * Push a telemetry log to Firestore
 * @param {string} eventName 
 * @param {object} data 
 * @param {object} env 
 */
export async function pushTelemetryLog(eventName, data = {}, env = {}) {
    const { db } = initFirebase();
    if (!db) return;

    try {
        const docRef = db.collection('swarm_telemetry').doc();
        await docRef.set({
            event: eventName,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            data: data,
            environment: {
                node: process.version,
                platform: process.platform,
                os: process.release?.name || 'unknown'
            }
        });
        console.log(`📡 [Telemetry] Logged ${eventName} to Firestore.`);
    } catch (error) {
        console.warn(`⚠️ [Telemetry] Failed to push log: ${error.message}`);
    }
}

/**
 * Save a manuscript for human review (Phase 8 HIL)
 * @param {object} auditData 
 */
export async function savePendingAudit(auditData) {
    const { db } = initFirebase();
    if (!db) throw new Error("Firestore not initialized");

    const docId = auditData.jobId || `audit-${Date.now()}`;
    const docRef = db.collection('pending_audits').doc(docId);
    
    await docRef.set({
        ...auditData,
        status: 'PENDING',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`📡 [HIL] Manuscript saved to 'pending_audits' as: ${docId}`);
    return docId;
}

/**
 * Get all pending audits for the HIL Station
 */
export async function getPendingAudits() {
    const { db } = initFirebase();
    if (!db) return [];

    const snapshot = await db.collection('pending_audits')
        .where('status', '==', 'PENDING')
        .orderBy('createdAt', 'desc')
        .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Update the status of a pending audit
 */
export async function updateAuditStatus(docId, status, feedback = "") {
    const { db } = initFirebase();
    if (!db) return;

    const docRef = db.collection('pending_audits').doc(docId);
    await docRef.update({
        status,
        feedback,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [HIL] Audit ${docId} updated to: ${status}`);
}
