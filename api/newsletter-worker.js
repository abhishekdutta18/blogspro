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

    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const body = await request.json();
      const { subject, html, secret } = body;

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
      
      // 1. Fetch all subscribers from Firestore REST API
      console.log('Fetching subscribers from Firestore...');
      const firebaseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/subscribers`;
      const dbRes = await fetch(firebaseUrl);
      
      if (!dbRes.ok) {
        const dbError = await dbRes.text();
        throw new Error(`Failed to fetch subscribers: ${dbRes.status} - ${dbError}`);
      }

      const data = await dbRes.json();
      if (!data.documents || data.documents.length === 0) {
        return new Response(JSON.stringify({ success: true, count: 0, message: 'No subscribers found' }), { 
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }

      // Collect email addresses
      const emails = data.documents.map(doc => doc.fields?.email?.stringValue).filter(Boolean);
      console.log(`Found ${emails.length} subscribers`);

      // 2. Send individual emails via Resend Batch API (100 per request)
      // Using /emails/batch so each subscriber gets a private, individual email
      const BATCH_SIZE = 100;
      let emailsSentCount = 0;

      for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);

        console.log(`Sending batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} emails...`);

        const resendPayload = batch.map(email => ({
          from: 'BlogsPro Newsletter <newsletter@mail.blogspro.in>',
          to: [email],
          subject: subject,
          html: html
        }));

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
