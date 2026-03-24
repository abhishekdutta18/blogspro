// ═══════════════════════════════════════════════════════════════
// cloud-storage.js — Unified storage abstraction layer
// Supports: Google Cloud Storage (primary) + Cloudinary (fallback)
// ═══════════════════════════════════════════════════════════════

import { state } from './state.js';
import { showToast } from './config.js';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from './constants.js';

// Google Cloud Storage configuration
// Set these in Firebase Remote Config or environment variables
export const GCS_CONFIG = {
  projectId: null,          // Set from Remote Config: GCP_PROJECT_ID
  bucketName: null,         // Set from Remote Config: GCS_BUCKET_NAME
  apiKey: null,             // Set from Remote Config: GCS_API_KEY
  signedUrlExpiry: 7776000, // 90 days in seconds
};

let gcsInitialized = false;

/**
 * Initialize GCS configuration from Firebase Remote Config
 * Called automatically on first storage operation
 */
export async function initializeGCS() {
  if (gcsInitialized) return;
  
  try {
    // Import Firebase to fetch remote config
    const { getRemoteConfig, getValue } = await import('./remote-config.js');
    const config = await getRemoteConfig();
    
    GCS_CONFIG.projectId  = getValue('GCP_PROJECT_ID');
    GCS_CONFIG.bucketName = getValue('GCS_BUCKET_NAME');
    GCS_CONFIG.apiKey     = getValue('GCS_API_KEY');
    
    gcsInitialized = GCS_CONFIG.projectId && GCS_CONFIG.bucketName;
    console.log('[Cloud Storage] GCS initialized:', { 
      projectId: GCS_CONFIG.projectId,
      bucket: GCS_CONFIG.bucketName,
      ready: gcsInitialized 
    });
  } catch (err) {
    console.warn('[Cloud Storage] Failed to initialize GCS from Remote Config', err);
    gcsInitialized = false;
  }
}

/**
 * Upload file to Google Cloud Storage (primary)
 * Generates a signed URL valid for 90 days
 */
export async function uploadToGCS(file, folder = 'content', onProgress = null) {
  await initializeGCS();
  
  if (!gcsInitialized) {
    throw new Error('Google Cloud Storage not configured. Set GCP_PROJECT_ID, GCS_BUCKET_NAME, GCS_API_KEY in Remote Config.');
  }

  const fileName = `${folder}/${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, '_')}`;
  const metadata = {
    contentType: file.type || 'application/octet-stream',
    metadata: {
      uploadedBy: state.currentUser?.email || 'admin',
      uploadedAt: new Date().toISOString(),
    },
  };

  try {
    // Step 1: Get upload URL from GCS
    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_CONFIG.bucketName}/o?uploadType=media&name=${encodeURIComponent(fileName)}&key=${GCS_CONFIG.apiKey}`;

    // Step 2: Upload file with progress tracking
    const response = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      xhr.setRequestHeader('Content-Type', metadata.contentType);

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch (e) {
            reject(new Error('Invalid GCS response'));
          }
        } else {
          reject(new Error(`GCS upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('GCS network error'));
      xhr.ontimeout = () => reject(new Error('GCS upload timeout'));

      xhr.send(file);
    });

    // Step 3: Generate signed URL
    const signedUrl = await generateGCSSignedUrl(GCS_CONFIG.bucketName, fileName, GCS_CONFIG.signedUrlExpiry);
    
    return {
      url: signedUrl,
      gcsPath: `gs://${GCS_CONFIG.bucketName}/${fileName}`,
      metadata: {
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedBy: state.currentUser?.email || 'admin',
      },
    };
  } catch (err) {
    console.error('[Cloud Storage] GCS upload failed:', err);
    throw err;
  }
}

/**
 * Generate a signed URL for GCS object (requires backend service account)
 * For now, use public object URL (make sure bucket has proper permissions)
 */
export async function generateGCSSignedUrl(bucket, objectName, expirySeconds) {
  // For client-side, return public URL (bucket must allow public read with proper security rules)
  // For production, use a Cloud Function to generate signed URLs server-side
  return `https://storage.googleapis.com/${bucket}/${objectName}`;
}

/**
 * Upload file to Cloudinary (fallback)
 */
export async function uploadToCloudinary(file, folder = 'content', onProgress = null) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', `blogspro/${folder}`);
  formData.append('context', `uploaded_by=${state.currentUser?.email || 'admin'}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`);

    if (onProgress) {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
    }

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.secure_url) {
            resolve({
              url: data.secure_url,
              cloudinaryPath: data.public_id,
              metadata: {
                name: file.name,
                size: file.size,
                type: file.type,
                uploadedBy: state.currentUser?.email || 'admin',
              },
            });
          } else {
            reject(new Error('Cloudinary: no URL returned'));
          }
        } catch (e) {
          reject(new Error('Cloudinary: invalid response'));
        }
      } else {
        reject(new Error(`Cloudinary: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Cloudinary: network error'));
    xhr.ontimeout = () => reject(new Error('Cloudinary: timeout'));

    xhr.send(formData);
  });
}

/**
 * Upload with fallback chain: GCS → Cloudinary
 * Tries GCS first, falls back to Cloudinary if GCS fails or unconfigured
 */
export async function uploadToStorage(file, folder = 'content', onProgress = null) {
  try {
    // Try GCS first
    await initializeGCS();
    if (gcsInitialized) {
      try {
        console.log('[Cloud Storage] Attempting GCS upload...');
        const result = await uploadToGCS(file, folder, onProgress);
        console.log('[Cloud Storage] GCS upload successful');
        return result;
      } catch (gcsErr) {
        console.warn('[Cloud Storage] GCS upload failed, falling back to Cloudinary:', gcsErr.message);
      }
    }

    // Fallback to Cloudinary
    console.log('[Cloud Storage] Using Cloudinary (fallback)');
    return await uploadToCloudinary(file, folder, onProgress);
  } catch (err) {
    console.error('[Cloud Storage] All upload methods failed:', err);
    throw new Error(`Upload failed: ${err.message}`);
  }
}

/**
 * Delete file from storage
 * Supports both GCS and Cloudinary
 */
export async function deleteFromStorage(filePath, storageType = 'auto') {
  if (storageType === 'auto') {
    storageType = filePath.includes('cloudinary') ? 'cloudinary' : 'gcs';
  }

  try {
    if (storageType === 'gcs') {
      return await deleteFromGCS(filePath);
    } else {
      return await deleteFromCloudinary(filePath);
    }
  } catch (err) {
    console.error('[Cloud Storage] Delete failed:', err);
    throw err;
  }
}

/**
 * Delete from GCS
 * Requires backend Cloud Function or service account
 */
async function deleteFromGCS(gcsPath) {
  // This requires a backend Cloud Function with proper authentication
  // Example implementation:
  // POST /api/storage/delete with { gcsPath: "gs://bucket/path" }
  console.warn('[Cloud Storage] GCS deletion requires backend implementation');
  return { success: false, message: 'Not implemented' };
}

/**
 * Delete from Cloudinary
 */
async function deleteFromCloudinary(publicId) {
  // Requires Cloudinary API key (use backend endpoint)
  console.warn('[Cloud Storage] Cloudinary deletion requires backend implementation');
  return { success: false, message: 'Not implemented' };
}

/**
 * Get storage statistics (used space, files count)
 */
export async function getStorageStats() {
  await initializeGCS();

  return {
    gcs: gcsInitialized ? {
      configured: true,
      bucket: GCS_CONFIG.bucketName,
      // Requires backend API call to get actual stats
      stats: 'Use Google Cloud Console for detailed stats',
    } : { configured: false },
    cloudinary: {
      configured: true,
      cloud: CLOUDINARY_CLOUD_NAME,
    },
  };
}

export default {
  uploadToStorage,
  uploadToGCS,
  uploadToCloudinary,
  deleteFromStorage,
  getStorageStats,
  initializeGCS,
  GCS_CONFIG,
};
