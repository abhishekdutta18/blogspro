// ═══════════════════════════════════════════════════════════════
// GOOGLE CLOUD SETUP GUIDE
// ═══════════════════════════════════════════════════════════════

/**
 * STEP 1: Create a Google Cloud Project
 * ────────────────────────────────────
 * 1. Go to https://console.cloud.google.com/
 * 2. Click "Select a Project" → "New Project"
 * 3. Name: "BlogsPro" (or your project name)
 * 4. Click "Create"
 * 5. Wait for project creation
 */

/**
 * STEP 2: Enable Google Cloud Storage API
 * ────────────────────────────────────────
 * 1. In Cloud Console, go to "APIs & Services" → "Library"
 * 2. Search for "Cloud Storage API"
 * 3. Click it, then click "Enable"
 * 4. Wait for API to enable
 */

/**
 * STEP 3: Create a Storage Bucket
 * ─────────────────────────────────
 * 1. Go to "Cloud Storage" → "Buckets"
 * 2. Click "Create Bucket"
 * 3. Bucket name: "blogspro-assets" (must be globally unique)
 * 4. Location: Choose nearest region (e.g., "us-central1")
 * 5. Storage class: "Standard"
 * 6. Access control: "Uniform"
 * 7. Uncheck "Enforce public access prevention" (if you want public URLs)
 * 8. Click "Create Bucket"
 */

/**
 * STEP 4: Create a Service Account (for backend API)
 * ───────────────────────────────────────────────────
 * 1. Go to "IAM & Admin" → "Service Accounts"
 * 2. Click "Create Service Account"
 * 3. Service account name: "blogspro-worker"
 * 4. Click "Create and Continue"
 * 5. Role: "Editor" (for testing) or create custom role with:
 *    - storage.objects.create
 *    - storage.objects.delete
 *    - storage.objects.get
 * 6. Click "Continue" → "Done"
 */

/**
 * STEP 5: Generate API Key
 * ────────────────────────
 * 1. Go to "APIs & Services" → "Credentials"
 * 2. Click "Create Credentials" → "API Key"
 * 3. In the popup, click "Restrict Key"
 * 4. API restrictions: Select "Cloud Storage API"
 * 5. HTTP referrers: Add your domain(s):
 *    - https://yourdomain.com
 *    - https://*.github.io (if using GitHub Pages)
 * 6. Click "Save"
 * 7. Copy the API key
 */

/**
 * STEP 6: Configure BlogsPro with GCS
 * ──────────────────────────────────
 * In Firebase Console → Remote Config, add these values:
 * 
 * Key: "GCP_PROJECT_ID"
 * Value: "your-project-id" (from Cloud Console)
 * 
 * Key: "GCS_BUCKET_NAME"
 * Value: "blogspro-assets" (your bucket name)
 * 
 * Key: "GCS_API_KEY"
 * Value: "AIza..." (your API key from Step 5)
 * 
 * Then click "Publish" to deploy
 */

/**
 * STEP 7: Set Bucket Permissions (Public Read)
 * ──────────────────────────────────────────────
 * 1. Go to Cloud Storage → Buckets → Your bucket
 * 2. Click "Permissions" tab
 * 3. Click "Grant Access"
 * 4. New principals: "allUsers"
 * 5. Role: "Storage Object Viewer"
 * 6. Click "Save"
 * 
 * This allows public read of uploaded files (images)
 */

/**
 * STEP 8: (OPTIONAL) Set up Signed URLs via Cloud Function
 * ─────────────────────────────────────────────────────────
 * For enhanced security, use signed URLs (time-limited access):
 * 
 * Create a Cloud Function:
 * - Runtime: Node.js (your version)
 * - Entry point: "generateSignedUrl"
 * - Code:
 * 
 * const storage = require('@google-cloud/storage');
 * const bucket = storage.bucket('blogspro-assets');
 * 
 * exports.generateSignedUrl = async (req, res) => {
 *   const file = bucket.file(req.query.object);
 *   const [url] = await file.getSignedUrl({
 *     version: 'v4',
 *     action: 'read',
 *     expires: Date.now() + 7776000000, // 90 days
 *   });
 *   res.json({ signedUrl: url });
 * };
 * 
 * Then update cloud-storage.js to call this function
 */

/**
 * STEP 9: Verify Storage Limits (100 MB quota)
 * ──────────────────────────────────────────────
 * 1. Go to Cloud Console → Billing
 * 2. Your project should show: $100/month free tier
 * 3. Go to Budgets & Alerts → Create Budget
 * 4. Set threshold to $50 (early warning)
 * 5. Add email notifications
 * 
 * Free tier includes:
 * - 5 GB storage
 * - 50 GB egress per month
 * - Sufficient for 100 MB project quota
 */

/**
 * TROUBLESHOOTING
 * ───────────────
 * 
 * Q: "Google Cloud Storage not configured"
 * A: Make sure Remote Config values are set and published
 * 
 * Q: "403 Forbidden" when uploading
 * A: Check API key HTTP referrers match your domain
 *    Or wait 5 minutes for permission propagation
 * 
 * Q: Uploaded files not accessible
 * A: Ensure bucket permissions allow public read (Step 7)
 * 
 * Q: How much will this cost?
 * A: Free tier: 5GB storage, 50GB egress/month
 *    After free tier: ~$0.020/GB stored, ~$0.12/GB egress
 *    100 MB project = ~$0.002/month stored
 * 
 * Q: Can I use Workload Identity instead of API keys?
 * A: Yes! More secure. Requires Cloud Run deployment.
 *    Current setup uses API keys for simplicity on GitHub Pages.
 */

// ═══════════════════════════════════════════════════════════════
// For implementation, see:
// - js/cloud-storage.js (upload logic)
// - js/images-upload.js (integration)
// - firebase-init.js (Remote Config setup)
// ═══════════════════════════════════════════════════════════════

export const GCS_SETUP_STEPS = {
  step1: 'Create Google Cloud Project',
  step2: 'Enable Cloud Storage API',
  step3: 'Create Storage Bucket',
  step4: 'Create Service Account',
  step5: 'Generate API Key',
  step6: 'Configure Firebase Remote Config',
  step7: 'Set Bucket Permissions',
  step8: '(Optional) Set up Signed URLs',
  step9: 'Verify Storage Limits',
};

export default GCS_SETUP_STEPS;
