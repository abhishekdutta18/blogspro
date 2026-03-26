export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // Handle GET for unsubscriptions
    if (request.method === 'GET') {
      const { searchParams } = new URL(request.url);
      const email = searchParams.get('email');
      const secret = searchParams.get('secret');

      if (!email || secret !== env.NEWSLETTER_SECRET) {
        return new Response('Invalid unsubscribe link.', { status: 400 });
      }

      try {
        const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'blogspro-ai';
        // Find document ID for this email
        const queryUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
        const queryBody = {
          structuredQuery: {
            from: [{ collectionId: 'subscribers' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'email' },
                op: 'EQUAL',
                value: { stringValue: email }
              }
            },
            limit: 1
          }
        };

        const listRes = await fetch(queryUrl, {
          method: 'POST',
          body: JSON.stringify(queryBody)
        });
        const results = await listRes.json();
        
        if (results && results[0] && results[0].document) {
          const docPath = results[0].document.name;
          const delRes = await fetch(`https://firestore.googleapis.com/v1/${docPath}`, { method: 'DELETE' });
          if (!delRes.ok) throw new Error('Delete failed');
        }

        return new Response(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Unsubscribed — BlogsPro</title>
            <style>
              body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #080d1a; color: #f5f0e8; text-align: center; }
              .card { background: #0f1628; padding: 3rem; border-radius: 8px; border: 1px solid rgba(201,168,76,0.2); max-width: 400px; }
              h1 { color: #c9a84c; margin-bottom: 1rem; }
              p { color: #8896b3; line-height: 1.6; }
              a { color: #c9a84c; text-decoration: none; font-weight: bold; margin-top: 2rem; display: inline-block; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Unsubscribed</h1>
              <p>You have been successfully removed from our list. You will no longer receive daily fintech briefings from ${email}.</p>
              <a href="https://blogspro.in">Back to BlogsPro</a>
            </div>
          </body>
          </html>
        `, { headers: { 'Content-Type': 'text/html' } });
      } catch (e) {
        return new Response('Error processing unsubscription.', { status: 500 });
      }
    }

    // Only accept POST requests for sending
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const body = await request.json();
      const { subject, html, secret, from: fromName } = body;
      const displayFromName = fromName || 'BlogsPro Newsletter';

      // Validate secret
      if (secret !== env.NEWSLETTER_SECRET) {
        console.error('Invalid secret provided');
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Validate required fields
      if (!subject || !html) {
        return new Response(JSON.stringify({ error: 'Missing subject or html' }), { 
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const RESEND_API_KEY = env.RESEND_API_KEY;
      if (!RESEND_API_KEY) {
        console.error('RESEND_API_KEY not configured');
        return new Response(JSON.stringify({ error: 'Email API Key not configured' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      const PROJECT_ID = env.FIREBASE_PROJECT_ID || 'blogspro-ai';
      
      // 1. Fetch ALL subscribers from Firestore REST API (handling pagination)
      console.log('Fetching subscribers from Firestore...');
      let emails = [];
      let pageToken = '';
      const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/subscribers`;

      do {
        const url = pageToken ? `${baseUrl}?pageToken=${pageToken}` : baseUrl;
        const dbRes = await fetch(url);
        if (!dbRes.ok) {
          const dbError = await dbRes.text();
          throw new Error(`Failed to fetch subscribers: ${dbRes.status} - ${dbError}`);
        }
        const data = await dbRes.json();
        if (data.documents) {
          const batchSubs = data.documents.map(doc => ({
            email: doc.fields?.email?.stringValue,
            name: doc.fields?.name?.stringValue || doc.fields?.displayName?.stringValue || 'Reader'
          })).filter(s => s.email);
          emails = emails.concat(batchSubs);
        }
        pageToken = data.nextPageToken || '';
      } while (pageToken);

      console.log(`Found ${emails.length} total subscribers`);

      // 2. Send individual emails via Resend Batch API (100 per request)
      // Using /emails/batch so each subscriber gets a private, individual email
      const BATCH_SIZE = 100;
      let emailsSentCount = 0;

      const workerUrl = new URL(request.url).origin;

      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);

        console.log(`Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails...`);

        const resendPayload = batch.map(sub => {
          const unsubLink = `${workerUrl}/?email=${encodeURIComponent(sub.email)}&secret=${encodeURIComponent(secret)}`;
          const personalHtml = html
            .replace('{{UNSUBSCRIBE_LINK}}', unsubLink)
            .replace(/{{NAME}}/g, sub.name);

          return {
            from: `${displayFromName} <newsletter@mail.blogspro.in>`,
            to: [sub.email],
            subject: subject,
            html: personalHtml
          };
        });

        const resendRes = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(resendPayload)
        });

        if (!resendRes.ok) {
          const resendError = await resendRes.text();
          console.error(`Resend API error: ${resendRes.status}`);
          console.error(`Response: ${resendError}`);
          throw new Error(`Resend API failed: ${resendRes.status} - ${resendError}`);
        }

        emailsSentCount += batch.length;
      }

      console.log(`✅ Newsletter sent to ${emailsSentCount} subscribers`);
      return new Response(JSON.stringify({ success: true, count: emailsSentCount }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });

    } catch (err) {
      console.error('Worker error:', err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
// v2.0 - Updated to handle newsletter sending with subject and html
// CI Trigger: Hardening Verification
