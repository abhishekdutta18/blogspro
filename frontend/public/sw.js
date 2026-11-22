/**
 * sw.js — retires the service worker an earlier version of blogspro.in registered.
 *
 * That old worker kept answering requests from its own cache, so browsers that had it
 * never saw new deploys (stale admin page, stale scripts, sign-in requests that never
 * reached the server). Browsers re-check this URL on each visit; when they find this
 * version they install it, and it clears every cache, unregisters itself and reloads
 * open tabs from the network. It has no fetch handler, so it never intercepts anything.
 *
 * Keep this file deployed for a few months so returning visitors pick it up.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    await self.registration.unregister();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map(client => client.navigate(client.url).catch(() => undefined)));
  })());
});
