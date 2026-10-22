// Formwright service worker: lets Android install Formwright as an app, and lets it open with
// no signal on a device that has opened it before.
//   Page loads: the network first, always, so an update is never held back; with no signal (or
//     no answer in 6 seconds) the copy kept on this device opens instead.
//   The app's own files (precache.json lists them; each build's names are new) are kept on the
//     device after each visit with a signal, and old builds' copies are cleared away.
//   Fonts are kept as they're used. Firestore and Storage aren't touched here: Firestore keeps
//     its own offline copy (firebase.js), and uploads wait in the app (offlinequeue.js).
const SHELL = 'fw-shell-v1', FONTS = 'fw-fonts-v1';
const OFFLINE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#3346c8">
<title>Formwright</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#f3f4f7;color:#141826;text-align:center;padding:24px}
@media (prefers-color-scheme:dark){body{background:#0f1117;color:#e7e9f0}}b{display:block;font-size:1.25rem;margin-bottom:6px}</style></head>
<body><div><b>You’re offline</b>Formwright hasn’t been opened on this device with a signal yet. Open it once with a connection, and after that it works offline.</div></body></html>`;

self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(syncShell()); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('fw-') && k !== SHELL && k !== FONTS) await caches.delete(k);
  await self.clients.claim();
})()));

let syncing = null;
/** Keep this build's files on the device (and only this build's). */
function syncShell() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const res = await fetch('/precache.json', { cache: 'no-store' });
      if (!res.ok) return;
      const list = await res.json();
      if (!list || !Array.isArray(list.files)) return;
      const cache = await caches.open(SHELL);
      const had = await cache.match('/precache.json');
      const old = had ? await had.json().catch(() => null) : null;
      const have = new Set((await cache.keys()).map((q) => new URL(q.url).pathname));
      for (const f of list.files) {
        if (have.has(f) && f.startsWith('/assets/') && old && old.id === list.id) continue; // built files never change under the same name
        try { const r = await fetch(f, { cache: 'no-cache' }); if (r.ok) await cache.put(f, r); } catch (e) { /* signal dropped: next time */ }
      }
      const keep = new Set([...list.files, '/precache.json']);
      for (const q of await cache.keys()) if (!keep.has(new URL(q.url).pathname)) await cache.delete(q);
      await cache.put('/precache.json', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));
    } catch (e) { /* offline, or the list isn't there: try again on the next visit */ } finally { syncing = null; }
  })();
  return syncing;
}

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // page loads: network first; the device copy with no signal
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await Promise.race([fetch(req), timeout(6000)]);
        if (res && res.ok) { e.waitUntil(syncShell()); return res; }
        return res;
      } catch (err) {
        const cache = await caches.open(SHELL);
        return (await cache.match('/index.html')) || (await cache.match('/')) || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  // the app's own files: the device copy if there is one (the network for anything new)
  if (url.origin === self.location.origin) {
    if (url.pathname === '/sw.js' || url.pathname === '/precache.json') return;
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(url.pathname);
      if (hit && url.pathname.startsWith('/assets/')) return hit; // a build's files never change
      try {
        const res = await fetch(req);
        if (res.ok && url.pathname.startsWith('/assets/')) cache.put(url.pathname, res.clone());
        return res;
      } catch (err) { if (hit) return hit; throw err; }
    })());
    return;
  }
  // fonts: kept as they're used
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith((async () => {
      const cache = await caches.open(FONTS);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })());
  }
});
