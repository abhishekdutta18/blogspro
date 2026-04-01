// Cloudflare Worker: simple KV-backed cache proxy for AI/chart responses
// Set KV binding CACHE_KV in wrangler.toml for this worker.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });

    // health check
    if (url.pathname === '/health') return new Response('ok', { status: 200 });

    if (!env.CACHE_KV) return new Response('KV not bound', { status: 500 });

    // Cache key: method + path + body hash
    const body = await request.clone().text().catch(() => '');
    const key = await hash(`${request.method}:${url.pathname}:${body}`);

    if (request.method === 'GET') {
      const cached = await env.CACHE_KV.get(key);
      if (cached) {
        return new Response(cached, {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Status': 'HIT' }
        });
      }
    }

    // Proxy to upstream (expect target param)
    const target = url.searchParams.get('target');
    if (!target) return new Response('Missing target', { status: 400 });

    const upstream = await fetch(target, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' ? undefined : body,
    });
    const text = await upstream.text();

    if (upstream.ok && request.method === 'GET') {
      await env.CACHE_KV.put(key, text, { expirationTtl: 3600 }); // 1h TTL
    }

    return new Response(text, { status: upstream.status, headers: upstream.headers });
  }
};

async function hash(str) {
  const msg = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', msg);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
