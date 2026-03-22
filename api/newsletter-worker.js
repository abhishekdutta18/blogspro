export default {
  async fetch(request, env, ctx) {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    try {
      const { postId, title, slug, excerpt, secret } = await request.json();

      // Basic authentication so only your admin panel can trigger email blasts
      // You must set this securely in your Cloudflare environment variables
      if (secret !== env.NEWSLETTER_SECRET) {
        return new Response('Unauthorized', { status: 401 });
      }

      const RESEND_API_KEY = env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        return new Response('Email API Key not configured', { status: 500 });
      }

      const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'blogspro-ai';
      
      // 1. Fetch all subscribers from Firestore REST API securely
      const firebaseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/subscribers`;
      const dbRes = await fetch(firebaseUrl);
      
      if (!dbRes.ok) {
        throw new Error('Failed to fetch subscribers from Firebase');
      }

      const data = await dbRes.json();
      if (!data.documents || data.documents.length === 0) {
        return new Response('No subscribers found', { status: 200 });
      }

      // Collect email addresses
      const emails = data.documents.map(doc => doc.fields?.email?.stringValue).filter(Boolean);

      // 2. Draft the HTML Email
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <h1 style="color: #111;">New Article: ${title}</h1>
          <p style="font-size: 16px; line-height: 1.5; color: #555;">
            ${excerpt || 'We just published a brand new article on BlogsPro!'}
          </p>
          <div style="margin: 30px 0;">
            <a href="https://blogspro.in/p/${slug}.html" style="background-color: #c9a84c; color: #111; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Read Full Article →</a>
          </div>
          <p style="font-size: 12px; color: #999; margin-top: 50px;">
            You are receiving this because you subscribed to BlogsPro.
          </p>
        </div>
      `;

      // 3. Fire the blast via Resend API
      // Since Resend has a 50 recipients per request limit for bulk, we batch them.
      const BATCH_SIZE = 50;
      let emailsSentCount = 0;

      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);
        
        const resendPayload = {
          from: 'BlogsPro <newsletter@blogspro.in>',
          to: batch,
          subject: title,
          html: emailHtml
        };

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(resendPayload)
        });
        
        emailsSentCount += batch.length;
      }

      return new Response(JSON.stringify({ success: true, count: emailsSentCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
// v1.1
