# Newsletter Feature Setup Guide

The newsletter feature generates AI-powered newsletters from your latest blog posts and sends them to all subscribers via email.

## 📋 How It Works

```
User clicks "Generate Newsletter"
  ↓
AI writes HTML email from 5 latest posts
  ↓
User previews, can modify tone/style/subject
  ↓
User clicks "Send to All Subscribers"
  ↓
Frontend calls Cloudflare Worker with secret
  ↓
Worker fetches subscribers from Firestore
  ↓
Worker sends email batch via Resend API
  ↓
✓ Email delivered to all subscribers
```

---

## 🔧 Setup Steps

### Step 1: Get Resend API Key

1. Go to [Resend.com](https://resend.com)
2. Sign up or log in
3. Go to **API Keys** section
4. Click "Create API Key"
5. Copy the key (format: `re_xxxxxxxxxxxxxxxxxxxxx`)

### Step 2: Set Cloudflare Worker Secrets

You need to set TWO secrets in your Cloudflare Worker:

**Generate a Newsletter Secret:**
```bash
# In terminal:
openssl rand -base64 32
# Output something like: abc123def456ghi789jkl...
```

**Set the secrets:**
```bash
cd /Users/nandadulaldutta/Desktop/BlogsPro/blogspro-1

# Set Resend API key
npx wrangler secret put RESEND_API_KEY
# Paste your Resend key when prompted

# Set Newsletter secret
npx wrangler secret put NEWSLETTER_SECRET
# Paste the generated secret from above
```

### Step 3: Save Newsletter Secret in Your Project

You'll need to provide the same secret to the frontend so it can authenticate requests.

**Add to your admin panel or remember it for later:**
```javascript
// In admin.html <script> or firebase-init.js:
window.NEWSLETTER_SECRET = 'your-secret-here'; // Same as NEWSLETTER_SECRET from Step 2
window.NEWSLETTER_WORKER_URL = 'https://blogspro-newsletter.workers.dev'; // Your worker URL
```

Or, set it in **Firebase Remote Config** (recommended):
1. Go to Firebase Console → Remote Config
2. Add parameter:
   - **Key**: `NEWSLETTER_SECRET`
   - **Value**: (paste the secret from Step 2)
3. Click "Publish Changes"
4. Update `firebase-init.js` to load it:
   ```javascript
   window.NEWSLETTER_SECRET = await getRemoteConfigValue('NEWSLETTER_SECRET');
   ```

### Step 4: Deploy Worker

```bash
cd /Users/nandadulaldutta/Desktop/BlogsPro/blogspro-1

# Deploy the newsletter worker
npx wrangler deploy api/newsletter-worker.js

# Or if you have multiple workers:
npx wrangler deploy --name blogspro-newsletter
```

Your worker will be deployed to: `https://blogspro-newsletter.workers.dev`

### Step 5: Verify Subscriber Collection

The worker needs a Firestore collection called `subscribers` with email addresses.

**Check/Create collection:**
1. Go to Firebase Console → Firestore Database
2. Look for `subscribers` collection
3. If it doesn't exist, create it:
   - Collection ID: `subscribers`
   - Add a test document:
     - Document ID: `test-subscriber`
     - Field: `email` (string) = `your-email@example.com`

**Firestore Security Rules** (already configured):
```firestore
allow read: if request.auth.uid != null && hasRole('admin');
// Allows authenticated admins to read subscribers
```

---

## 🧪 Test Newsletter

### Test 1: Generate Newsletter
1. Go to Admin Dashboard → SEO & Tools → Newsletter
2. Click "Generate Newsletter"
3. Select:
   - Style: `roundup`, `deep-dive`, or `digest`
   - Tone: `professional`, `casual`, or `technical`
   - Subject: Custom subject line
4. Click "✉ Generate Newsletter"
5. Wait for AI to write content (~10-30 seconds)
6. Should see a preview with generated HTML

**If stuck on "Generating...:"**
- Check browser console for errors
- Verify AI provider is working (Cloudflare Worker / Groq / Gemini)
- Check Firebase limits aren't exceeded

### Test 2: Send Newsletter
1. After generation, click "Send to All Subscribers"
2. Should show "Sending to subscribers..." then "✓ Sent to X subscribers"

**If sends fail:**

| Error | Cause | Fix |
|-------|-------|-----|
| "Unauthorized" | NEWSLETTER_SECRET missing/wrong | Check Remote Config or window.NEWSLETTER_SECRET |
| "Email API Key not configured" | RESEND_API_KEY not set | Run `wrangler secret put RESEND_API_KEY` |
| "Failed to fetch subscribers" | No subscribers in Firestore | Add a test subscriber first |
| "No subscribers found" | subscribers collection empty | Add test subscriber |
| Network error / CORS | Worker URL unreachable | Check NEWSLETTER_WORKER_URL is correct |

---

## ✉️ Sending Real Emails

### Using Resend Domain

By default, emails come from `newsletter@blogspro.in`

**To verify this domain in Resend:**
1. Go to Resend → Domains
2. Add domain: `blogspro.in`
3. Follow DNS instructions
4. Once verified, emails won't mark as spam

**Without verification:** Emails come from `no-reply@resend.dev` (works but less professional)

### Customizing Email Template

Edit [api/newsletter-worker.js](api/newsletter-worker.js#L58-L74) to change email design:

```javascript
const emailHtml = `
  <div style="font-family: sans-serif; max-width: 600px;">
    <h1>Your Custom Header</h1>
    <p>${state.generatedNewsletter}</p>
    <!-- Edit colors, fonts, layout here -->
  </div>
`;
```

---

## 📊 Monitor Newsletter Metrics

### Track in Firebase
Create a `newsletter_sends` collection to log:
```javascript
{
  sentAt: timestamp,
  subject: string,
  recipientCount: number,
  status: 'queued' | 'sent' | 'failed'
}
```

### Resend Analytics
1. Go to Resend Dashboard
2. See email deliverability:
   - Delivered
   - Bounced
   - Complained
   - Opened (if tracking enabled)

### Add Open Tracking
Update worker to use Resend's tracking:
```javascript
const resendPayload = {
  from: 'BlogsPro <newsletter@blogspro.in>',
  to: batch,
  subject: title,
  html: emailHtml,
  track_opens: true,  // ← Add this
  track_clicks: true  // ← And this
};
```

---

## 🔐 Security

### Protect Newsletter Endpoint
Currently, only the `NEWSLETTER_SECRET` protects the worker. Additional options:

**Option 1: IP Whitelist (Cloudflare)**
```toml
# In wrangler.toml
[routes]
pattern = "api.example.com/newsletter"
zone_name = "example.com"
```

**Option 2: Cloudflare Access (OAuth)**
```bash
wrangler cloudflare-access-auth --name newsletter
```

**Option 3: Firebase Token Verification**
```javascript
// In worker:
const authHeader = request.headers.get('Authorization');
const token = authHeader?.replace('Bearer ', '');
// Verify Firebase ID token: admin.auth().verifyIdToken(token)
```

### Rate Limiting
Prevent newsletter spam:
```javascript
// Add to worker:
const rateLimitKey = 'newsletter-' + request.headers.get('cf-connecting-ip');
// Check how many requests from this IP in last hour
if (requestsInLastHour > 5) {
  return new Response('Too many requests', { status: 429 });
}
```

---

## 🐛 Troubleshooting

### "Generate Newsletter" doesn't work
- **Check**: AI provider is working (test with "Generate Article")
- **Check**: Firebase collection `posts` has published articles
- **Fix**: Publish at least 1 blog post first

### "Send Newsletter" gets "Unauthorized"
- **Problem**: NEWSLETTER_SECRET not configured
- **Fix**: 
  ```bash
  npx wrangler secret put NEWSLETTER_SECRET
  # Paste the same secret from setup
  ```

### "No subscribers found"
- **Problem**: Firestore `subscribers` collection is empty
- **Fix**: Add at least one test subscriber:
  1. Firebase Console → Firestore
  2. Create collection `subscribers`
  3. Add document with `email` field

### Emails not delivered
- **Check**: Resend API key is valid → https://resend.com/api-keys
- **Check**: Recipient emails are real (check `subscribers` collection)
- **Check**: Domain verified (optional but recommended)
- **Fix**: Check Resend dashboard for bounce reasons

### Worker deploy fails
```bash
# Try this:
npm install -g wrangler  # Update Wrangler
wrangler deploy api/newsletter-worker.js --production
```

---

## 📚 Code Files

| File | Purpose | Status |
|------|---------|--------|
| [js/newsletter.js](../js/newsletter.js) | Frontend UI + send logic | ✅ Fixed |
| [api/newsletter-worker.js](../api/newsletter-worker.js) | Cloudflare Worker + Resend | ✅ Ready |
| [wrangler.toml](../wrangler.toml) | Worker config | ✅ Updated |

---

## 🚀 Next Steps

1. ✅ Get Resend API key
2. ✅ Set worker secrets (RESEND_API_KEY + NEWSLETTER_SECRET)
3. ✅ Deploy worker
4. ✅ Add test subscriber
5. ✅ Test generate
6. ✅ Test send
7. **Verify domain** (optional, for production)
8. **Set up analytics** (optional, for tracking)

---

**Last Updated**: March 23, 2026
