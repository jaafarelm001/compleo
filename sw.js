/* Service worker : l'appli s'ouvre même hors-ligne. Les données Supabase ne sont jamais mises en cache ici. */
const VERSION = 'compleo-2.0.0';
const SHELL = [
  './', './index.html', './404.html', './styles.css?v=2.0.0', './config.js?v=2.0.0', './vendor/supabase.js',
  './js/app.js?v=2.0.0', './js/core.js', './js/fx.js', './js/ui.js', './js/state.js', './js/pages.js',
  './fonts/fraunces-latin-full-normal.woff2', './fonts/fraunces-latin-full-italic.woff2', './fonts/figtree-latin-wght-normal.woff2',
  './icon.svg', './icon-512.png', './apple-touch-icon.png', './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, YouTube… : jamais interceptés

  // pages : réseau d'abord (4 s max), sinon la version en cache
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([fetch(req), timeout(4000)]);
        // on ne met en cache que la vraie page d'accueil ; un 404 renvoie 404.html qui redirige vers la bonne route
        const path = new URL(req.url).pathname;
        if (res && res.ok && (path.endsWith('/') || path.endsWith('/index.html'))) cache.put('./index.html', res.clone());
        return res;
      } catch {
        return (await cache.match('./index.html')) || (await cache.match('./')) || new Response('<h1>Hors ligne</h1>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // fichiers de l'appli : cache immédiat + mise à jour en arrière-plan
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req);
    const fresh = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(fresh); return hit; }
    const res = await fresh;
    return res || new Response('', { status: 504 });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) return c.focus(); }
    return self.clients.openWindow('./');
  })());
});
