# Email Configuration Guide - BlogsPro Newsletter

## Overview
Your newsletter system is fully operational with the following stack:
- **Frontend**: Admin Dashboard (admin.html)
- **Backend**: Cloudflare Worker (api/newsletter-worker.js)
- **Email Service**: Resend API
- **Database**: Firestore

## Current Configuration

### Resend Setup ✅
- **API Key**: Configured in Cloudflare Worker secrets
- **Sender Email**: `newsletter@mail.blogspro.in`
- **Domain Verified**: `mail.blogspro.in`

### Cloudflare Worker ✅
- **URL**: https://blogspro-newsletter.abhishek-dutta1996.workers.dev
- **Secrets Set**:
  - `RESEND_API_KEY`: ✅ Active
  - `NEWSLETTER_SECRET`: biltu123
  - `FIREBASE_PROJECT_ID`: blogspro-ai

## Step 1: Verify Your Domain (SPF)

SPF (Sender Policy Framework) proves that your domain authorizes Resend to send emails on its behalf.

### For `mail.blogspro.in`:

1. Go to your DNS provider (where you manage blogspro.in DNS records)
2. Add an SPF record:
   ```
   v=spf1 include:resend.com ~all
   ```
3. For subdomain `mail.blogspro.in`, add:
   ```
   v=spf1 include:resend.com ~all
   ```

### Verification:
```bash
# Test SPF record (from terminal)
nslookup -type=TXT mail.blogspro.in
# Should show: v=spf1 include:resend.com ~all
```

## Step 2: Add DKIM Record (DKIM)

DKIM (DomainKeys Identified Mail) digitally signs your emails, improving deliverability.

### In Resend Dashboard:

1. Go to [Resend Domains](https://resend.com/domains)
2. Find `mail.blogspro.in`
3. Copy the DKIM record data provided (looks like):
   ```
   v=DKIM1; h=sha256; p=MIGfMA0GCS...
   ```

### In Your DNS Provider:

Add a CNAME record:
- **Name**: `default._domainkey.mail.blogspro.in`
- **Value**: The CNAME provided by Resend (usually something like `[prefix].dkim.resend.com`)

### ⚠️ Important DNS Provider Tip:

Some DNS providers will ask:
```
"Putting your domain in the Name field means this record will resolve on 
default._domainkey.mail.blogspro.in.blogspro.in.

Do you want this to resolve on default._domainkey.mail.blogspro.in instead?"
```

**✅ Answer: YES** — You want the record on:
```
default._domainkey.mail.blogspro.in
```

NOT on:
```
default._domainkey.mail.blogspro.in.blogspro.in  ❌ (double domain - wrong!)
```

### Verification:
```bash
# Test DKIM record
nslookup -type=CNAME default._domainkey.mail.blogspro.in
# Should resolve to Resend's DKIM server (e.g., [prefix].dkim.resend.com)
```

## Step 3: Add DMARC Record (Optional but Recommended)

DMARC (Domain-based Message Authentication) tells email providers what to do if SPF/DKIM fail.

1. In your DNS provider, add a TXT record:
   ```
   Name: _dmarc.mail.blogspro.in
   Value: v=DMARC1; p=quarantine; rua=mailto:abhishek@blogspro.in
   ```
2. This tells providers to quarantine (hold) emails that fail authentication

### ⚠️ Important DNS Provider Tip:

Some DNS providers will ask:
```
"Putting your domain in the Name field means this record will resolve on 
_dmarc.mail.blogspro.in.blogspro.in.

Do you want this to resolve on _dmarc.mail.blogspro.in instead?"
```

**✅ Answer: YES** — You want the record on:
```
_dmarc.mail.blogspro.in
```

NOT on:
```
_dmarc.mail.blogspro.in.blogspro.in  ❌ (double domain - wrong!)
```

### Verification:
```bash
nslookup -type=TXT _dmarc.mail.blogspro.in
# Should show: v=DMARC1; p=quarantine; rua=mailto:abhishek@blogspro.in
```

## Testing Email Deliverability

### Test 1: Send Test Email via Admin Dashboard

1. Go to Admin Dashboard → **Newsletter**
2. Write a test newsletter
3. Click **"✉ Generate Newsletter"**
4. Click **"📤 Send to All Subscribers"**
5. Check your inbox for email from `newsletter@mail.blogspro.in`

### Test 2: Check Email Headers

If you receive the email in Gmail:
1. Open the email
2. Click **"Show original"** (or ⋮ → View message source)
3. Look for:
   - `Authentication-Results: pass spf` ✅
   - `Authentication-Results: pass dkim` ✅
   - `Authentication-Results: pass dmarc` ✅

### Test 3: Use Email Testing Tools

- [MXToolbox - Email Header Analysis](https://mxtoolbox.com/emailhealth/)
- [Mail-Tester](https://www.mail-tester.com/)
- [GlockApps](https://www.glockapps.com/)

Send a test newsletter and check your score (aim for 9+/10).

## Common Issues & Solutions

### ❌ Email Goes to Spam

**Cause**: SPF/DKIM not configured or missing

**Solution**:
1. Verify SPF record is live (nslookup test)
2. Add DKIM record to DNS
3. Wait 24-48 hours for DNS propagation
4. Resend a test email

### ❌ "Domain not verified" Error

**Cause**: Domain not fully verified in Resend

**Solution**:
1. Go to Resend Dashboard → Domains
2. Check if `mail.blogspro.in` shows "Verified" ✅
3. If not, add missing DNS records
4. Click "Try verify again"

### ❌ High Email Bounce Rate

**Cause**: Invalid subscriber emails

**Solution**:
1. Go to Admin Dashboard → **Subscribers**
2. Review email list for typos
3. Remove invalid emails (bounce detection)
4. Re-send to valid subscribers

### ❌ Low Email Open Rate

**Cause**: Subject line or content quality

**Solution**:
1. Use compelling subject lines
2. Keep emails under 100KB
3. Include clear CTA (Call To Action)
4. Test with different subject lines A/B test

## Production Checklist

Before sending newsletters to all subscribers:

- [ ] SPF record added to DNS
- [ ] DKIM record added to DNS
- [ ] DMARC record added to DNS (optional)
- [ ] Domain verified in Resend ✅
- [ ] Test email sent and received ✅
- [ ] Test email passes authentication checks ✅
- [ ] Subscriber list reviewed and cleaned
- [ ] Newsletter content reviewed for typos
- [ ] Unsubscribe link working (Resend handles this)
- [ ] Reply-to email set (newsletter@mail.blogspro.in)

## DNS Configuration Details

### Current DNS Setup for `blogspro.in`:

```json
{
  "domain": "blogspro.in",
  "subdomains": {
    "mail": {
      "type": "A/CNAME to mail server or left blank",
      "records": [
        {
          "name": "mail.blogspro.in",
          "type": "SPF",
          "value": "v=spf1 include:resend.com ~all"
        },
        {
          "name": "default._domainkey.mail.blogspro.in",
          "type": "CNAME",
          "value": "default._domainkey.resend.com"
        },
        {
          "name": "_dmarc.mail.blogspro.in",
          "type": "TXT",
          "value": "v=DMARC1; p=quarantine; rua=mailto:abhishek@blogspro.in"
        }
      ]
    }
  }
}
```

## Monitor Email Performance

### In Resend Dashboard:

1. Go to [Resend Analytics](https://resend.com/emails)
2. View:
   - Emails sent
   - Delivery rate
   - Bounce rate
   - Open rate
   - Click rate

### In Admin Dashboard:

1. Go to **Subscribers** tab
2. View:
   - Total subscribers: [count]
   - Active subscribers: [count]
   - Last email sent: [date/time]
   - Delivery status: [status]

## Newsletter Best Practices

### Content
- **Subject Line**: 40-60 characters, no spam words
- **Length**: 200-500 words
- **Format**: Mix text and images (ideal 70/30)
- **CTA**: 1-2 clear calls to action

### Timing
- **Best Day**: Tuesday-Thursday
- **Best Time**: 10 AM - 2 PM (subscriber timezone)
- **Frequency**: Weekly or bi-weekly

### Compliance
- **Unsubscribe Link**: Required by law (Resend auto-adds)
- **Privacy**: Include privacy policy link
- **From Address**: Use branded sender (BlogsPro)

## Support & Debugging

### Check Worker Logs

```bash
wrangler tail blogspro-newsletter
```

Look for:
- ✅ Subscribers fetched: [N]
- ✅ Emails sent: [N]
- ❌ Resend API error: [code]
- ❌ Firestore fetch error: [message]

### Resend Support

- [Resend Docs](https://resend.com/docs)
- [Resend Discord](https://resend.com/discord)
- Email: support@resend.com

### BlogsPro Support

See [NEWSLETTER_SETUP.md](NEWSLETTER_SETUP.md) for backend configuration details.

---

**Last Updated**: 23 March 2026
**Status**: ✅ Fully Operational
