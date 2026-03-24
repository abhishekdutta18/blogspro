# Google Cloud Integration for BlogsPro

This guide helps you set up **Google Cloud Storage (GCS)** and **Gemini API** with your 100MB Google AI plan.

## 📋 Overview

Your new Google integration includes:

| Component | Purpose | Quota |
|-----------|---------|-------|
| **Google Cloud Storage** | Store all user uploads + generated images | 5GB free / month |
| **Gemini API** | AI text generation (fallback + primary option) | Unlimited* |
| **Google AI Studio** | Free API access | 60 req/min free |

*Pricing: $0.075 USD per 1M input tokens, $0.3 USD per 1M output tokens

---

## 🔧 Part 1: Google Cloud Storage Setup (100 MB Storage)

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top left)
3. Click "**New Project**"
4. **Project name**: `blogspro` (or your preference)
5. Click "**Create**"
6. Wait for creation (typically 30 seconds)

### Step 2: Enable Cloud Storage API

1. In Cloud Console, search for "**Cloud Storage API**"
2. Click the result → "**Enable**"
3. Wait for API to enable (1-2 minutes)

### Step 3: Create a Storage Bucket

1. Go to **Cloud Storage** → **Buckets** (in left sidebar)
2. Click "**Create Bucket**"
3. **Bucket name**: `blogspro-assets-[your-unique-id]` (globally unique!)
4. **Location**: Select nearest to you (e.g., `us-central1`)
5. **Storage class**: `Standard`
6. **Access control**: `Uniform`
7. **Uncheck** "Enforce public access prevention"
8. Click "**Create**"

### Step 4: Generate API Key

1. Go to **APIs & Services** → **Credentials** (left sidebar)
2. Click "**+ Create Credentials**" → "**API Key**"
3. In the popup, click "**Restrict Key**"
4. **API restrictions**: Select "**Cloud Storage API**"
5. **HTTP referrers**: Add your domain:
   ```
   https://yourdomain.com/*
   https://*.github.io/*
   ```
6. Click "**Save**"
7. **Copy the API key** (you'll need it)

### Step 5: Set Bucket Permissions

1. Go to **Cloud Storage** → **Buckets** → Your bucket
2. Click the "**Permissions**" tab
3. Click "**Grant Access**"
4. **New principals**: `allUsers`
5. **Role**: `Storage Object Viewer` (allows public read)
6. Click "**Save**"

---

## 🤖 Part 2: Gemini API Setup

### Step 6: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "**Create API Key**"
3. Select your Google Cloud project
4. **Copy the API key** (different from GCS key!)

### Step 7: Configure Firebase Remote Config

Now add both API keys to Firebase Remote Config so BlogsPro can access them:

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your BlogsPro project
2. Click **Remote Config** (left sidebar)
3. Click "**Create Config**" if this is your first parameter

#### Add 4 parameters:

**Parameter 1:**
- **Key**: `GCP_PROJECT_ID`
- **Default value**: Your Google Cloud project ID (from Cloud Console)

**Parameter 2:**
- **Key**: `GCS_BUCKET_NAME`
- **Default value**: Your bucket name (e.g., `blogspro-assets-123`)

**Parameter 3:**
- **Key**: `GCS_API_KEY`
- **Default value**: Your GCS API key (from Step 4 or Step 5 above)

**Parameter 4:**
- **Key**: `GEMINI_API_KEY`
- **Default value**: Your Gemini API key (from Step 6)

4. Click "**Publish Changes**" (top right)

---

## 📊 Part 3: Integration in BlogsPro

### File Structure

```
js/
├── cloud-storage.js      ← New: Unified storage abstraction
├── gemini-config.js      ← New: Gemini API client
├── images-upload.js      ← Updated: Uses cloud-storage.js
└── firebase.js           ← Existing: Remote Config
```

### How It Works

**Automatic Fallback Chain:**
1. **User uploads image** → tries **Google Cloud Storage** first
2. If GCS fails → falls back to **Cloudinary** (existing)
3. Seamless transition, no user-facing errors

**AI Generation:**
- **Text generation** uses fallback chain:
  1. Cloudflare Worker (primary - fastest & cheapest)
  2. Groq API (free tier)
  3. **Gemini API** (your new resource - high quality)
  4. Error if all fail

### Example: Using Gemini for Content

```javascript
import { callGemini } from './gemini-config.js';

// Generate article
const result = await callGemini(
  'Write a 1500-word blog post about fintech regulations...',
  { temperature: 0.7, maxTokens: 4096 }
);

console.log(result.text);          // Generated content
console.log(result.usage);         // Token usage
console.log(result.cost);          // Estimated cost
```

---

## 💰 Cost & Quota Management

### Free Tier

- **Cloud Storage**: 5 GB/month free
- **Gemini API**: First 60 requests/minute free ($0 cost for those requests)
- **Your 100MB project**:
  - Storage: Fits in 5GB free tier ✓
  - Text generation: ~$0.02-0.50/month* at typical usage

### Monitor Usage

1. **Cloud Console** → **Billing** → View current costs
2. Set a budget alert:
   - Go to **Budgets & Alerts**
   - Click "**Create Budget**"
   - Set **threshold**: $50/month (early warning)
3. Email notifications on budget alerts

### Cost Examples

| Scenario | Input | Output | Cost |
|----------|-------|--------|------|
| 1 article (2k words) | 200 tokens | 1,500 tokens | ~$0.0005 |
| 10 articles | 2,000 tokens | 15,000 tokens | ~$0.005 |
| 100 articles | 20,000 tokens | 150,000 tokens | ~$0.05 |

---

## 🧪 Testing

### Test Storage Upload

Add this to `admin.html` console:

```javascript
import { uploadToStorage } from './cloud-storage.js';

const file = new File(['test'], 'test.txt', { type: 'text/plain' });
const result = await uploadToStorage(file, 'test');
console.log('Upload URL:', result.url);
```

### Test Gemini

```javascript
import { callGemini } from './gemini-config.js';

const result = await callGemini('Hello, what do you know about fintech?');
console.log(result.text);
console.log('Cost:', result.usage);
```

---

## 🐛 Troubleshooting

### "Google Cloud Storage not configured"

**Problem**: Images fail to upload

**Solution**:
1. Check Remote Config values are published
2. Refresh admin page (hard refresh: Cmd+Shift+R)
3. Check browser console for errors

### "403 Forbidden" when uploading

**Problem**: Permission denied

**Solution**:
1. Verify API key HTTP referrers include your domain
2. Wait 5 minutes for permissions to propagate
3. Re-create API key if needed

### "Gemini API error"

**Problem**: AI generation fails

**Solution**:
1. Check `GEMINI_API_KEY` is in Remote Config
2. Verify quota at [Google AI Studio](https://aistudio.google.com/app/dashboard)
3. Check daily query limits haven't been exceeded

### Files not accessible after upload

**Problem**: Uploaded images return 404

**Solution**:
1. Go to Cloud Storage bucket
2. Click "Permissions" tab
3. Verify `allUsers` has "Storage Object Viewer" role
4. If not visible, add it (Step 5 above)

---

## 🔐 Security Best Practices

### 1. Restrict API Keys

- ✅ **Already done**: API keys limited to specific APIs
- ✅ **Already done**: HTTP referrers configured

### 2. Set Budget Alerts

- Go to **Cloud Console** → **Budgets & Alerts**
- Alert at $50/month (before 100MB budget exhausted)

### 3. Rotate Keys Monthly

Every 30 days:
1. Generate new API keys in Cloud Console
2. Update Remote Config
3. Publish changes
4. Delete old keys

### 4. Monitor Access

- Cloud Console → **Cloud Audit Logs**
- Storage details at gs://your-bucket-name in Cloud Console

---

## 📈 Next Steps

1. **Test uploads**: Upload an image from Admin Dashboard
2. **Test AI generation**: Use "Generate Article" feature
3. **Monitor costs**: Check Cloud Console → Billing weekly
4. **Scale gradually**: Start with blog images, expand to all assets

---

## 📞 Support

- [Google Cloud Storage Docs](https://cloud.google.com/storage/docs)
- [Gemini API Docs](https://ai.google.dev/docs)
- [Firebase Remote Config Docs](https://firebase.google.com/docs/remote-config)

---

**Last Updated**: March 23, 2026
