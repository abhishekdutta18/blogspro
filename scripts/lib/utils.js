/**
 * scripts/lib/utils.js
 * Shared institutional utilities for BlogsPro Swarm.
 */

/**
 * [V17.2] Availability Guard
 * Polls the public URL to ensure GitHub Pages has finished the deployment build.
 */
export async function waitForPublicAvailability(url, maxWaitSeconds = 120) {
  console.log(`⏳ [Guard] Waiting for manuscript availability: ${url}`);
  const start = Date.now();
  const interval = 8000; // 8 seconds
  
  while (Date.now() - start < maxWaitSeconds * 1000) {
    try {
      // [V22.1] Cache-buster prevents CDN edge from returning stale 200
      const checkUrl = `${url}?v=${Date.now()}`;
      const res = await fetch(checkUrl, { method: 'HEAD', cache: 'no-store' });
      if (res.ok) {
        const elapsed = Math.round((Date.now() - start) / 1000);
        console.log(`✅ [Guard] Manuscript is LIVE after ${elapsed}s.`);
        return true;
      }
      console.log(`⏳ [Guard] Manuscript still 404/Unavailable... retrying in ${interval/1000}s`);
    } catch (e) {
      console.warn(`⚠️ [Guard] availability check error:`, e.message);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  
  console.warn(`⚠️ [Guard] Wait timeout reached (${maxWaitSeconds}s). Proceeding anyway...`);
  return false;
}
