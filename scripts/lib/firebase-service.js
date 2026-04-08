import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { normalizeInstitutionalPem } from './sanitizer.js';

let db, storageBucket;

/**
 * hydrateServiceAccount
 * Institutional Utility: Ensures all mission-critical GCP fields are present and correctly formatted.
 */
function hydrateServiceAccount(sa) {
    if (!sa || typeof sa !== 'object') return sa;
    
    // 1. [V5.4.4] RSA Logic Restoration: Force strict 64-char line PEM format
    if (sa.private_key) {
        sa.private_key = normalizeInstitutionalPem(sa.private_key);
    }
    
    // 2. Definitive Recovery for client_email
    if (!sa.client_email && sa.project_id) {
        console.warn(`🛡️ [Hydration] Missing client_email. Recovering via project_id: ${sa.project_id}`);
        sa.client_email = `firebase-adminsdk-q0p9j@${sa.project_id}.iam.gserviceaccount.com`;
    }
    
    return sa;
}

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

    // [V5.4.2] Institutional Priority: Prefer local knowledge-file to avoid ENV truncation
    const saFile = path.join(process.cwd(), 'knowledge', 'firebase-service-account.json');
    if (fs.existsSync(saFile)) {
        try {
            const raw = fs.readFileSync(saFile, 'utf8');
            let serviceAccount = JSON.parse(raw);
            
            // 💧 HYDRATE: Standardize fields before SDK consumption
            serviceAccount = hydrateServiceAccount(serviceAccount);
            
            console.log(`🛡️ [Firebase] Authenticated via Institutional Key: ${saFile}`);
            options.credential = admin.credential.cert(serviceAccount);
            admin.initializeApp(options);
            db = admin.firestore();
            storageBucket = admin.storage().bucket();
            return { db, storageBucket };
        } catch (e) {
            console.warn('⚠️ Institutional Knowledge-Key Load Fail:', e.message);
        }
    }

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        // For CI/CD and Swarm environments
        try {
            // 🛡️ INSTITUTIONAL BRUTE-FORCE SANITIZER (V5.4.1)
            let saString = String(process.env.FIREBASE_SERVICE_ACCOUNT).trim();
            
            // Pass 1: Purge all non-printable control characters
            saString = saString.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
            
            // Pass 2: Trim to JSON boundaries to ignore prefix/suffix noise (e.g. logs)
            const firstBrace = saString.indexOf('{');
            const lastBrace = saString.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                saString = saString.substring(firstBrace, lastBrace + 1);
            }

            let serviceAccount = JSON.parse(saString);
            
            // 💧 HYDRATE: Standardize fields before SDK consumption
            serviceAccount = hydrateServiceAccount(serviceAccount);
            
            options.credential = admin.credential.cert(serviceAccount);
        } catch (e) {
            console.error(`❌ [Firebase] Critical Error: Failed to parse FIREBASE_SERVICE_ACCOUNT: ${e.message}`);
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
