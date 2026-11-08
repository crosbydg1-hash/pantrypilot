/* PantryPilot service worker: makes the app installable and usable offline.
 * - The app itself (page, scripts) is cached on install and refreshed in the background.
 * - Recipe photos are cached the first time you see them.
 * - Accounts, comments and payments always go to the server (never cached).
 * build-zip.sh replaces VERSION on every build so phones pick up updates. */
const VERSION = 'dev';
const CACHE = 'pantrypilot-' + VERSION;
const SHELL = ['./', 'index.html', 'app.js?v=' + VERSION, 'backend.js?v=' + VERSION, 'recipes.js?v=' + VERSION, 'nutrition.js?v=' + VERSION, 'config.js?v=' + VERSION,
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'privacy.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pantrypilot-') && k !== CACHE && k !== 'pantrypilot-photos').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache forever once loaded.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(caches.open(CACHE).then(async c => (await c.match(req)) || fetch(req).then(res => { c.put(req, res.clone()); return res; })));
    return;
  }
  if (url.origin !== location.origin) return; // Supabase, Stripe, ads, imports: always live

  // Recipe photos: cache-first.
  if (url.pathname.includes('/img/') || url.pathname.includes('/icons/')) {
    event.respondWith(caches.open('pantrypilot-photos').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) c.put(req, res.clone());
      return res;
    }));
    return;
  }

  // Pages: network first, fall back to the cached app when offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => { caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
      .catch(async () => (await caches.match(req)) || (await caches.match('index.html')) || (await caches.match('./'))));
    return;
  }

  // Scripts and other files: use the cache, refresh it in the background.
  event.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req);
    const live = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || live;
  }));
});

// Tapping a "Time's up" notification brings PantryPilot back to the front.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
