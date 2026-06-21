// Emberlock service worker — cache-first for own assets, runtime cache for fonts.
const CACHE = 'emberlock-v9';
const ASSETS = [
  '.',
  'index.html',
  'manifest.json',
  'css/main.css?v=7',
  'js/main.js?v=9',
  'js/audio.js',
  'js/engine/vec.js',
  'js/engine/loop.js',
  'js/engine/pool.js',
  'js/engine/fx.js',
  'js/engine/canvas.js',
  'js/engine/input.js',
  'js/game/data.js',
  'js/game/meta.js',
  'js/game/world.js',
  'js/game/render.js',
  'js/game/ui.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // cache:'reload' bypasses the HTTP cache — never snapshot stale files into a new SW cache
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // runtime-cache Google Fonts so the game works offline after first load
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => hit))
    );
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: false }).then((hit) => hit || fetch(e.request).then((res) => {
      if (res.ok && e.request.method === 'GET') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }))
  );
});

// hub-stats tracker v1
