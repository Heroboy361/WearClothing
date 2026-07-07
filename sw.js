// Service Worker: macht die App offline nutzbar (PWA).
const CACHE = 'wearclothing-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/lock.js',
  './js/app.js',
  './js/avatar.js',
  './js/advisor.js',
  './js/scan.js',
  './js/vendor/three.module.js',
  './js/vendor/OrbitControls.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Einzeln cachen, damit ein fehlgeschlagenes Asset nicht die Installation blockiert
      Promise.allSettled(ASSETS.map((a) => cache.add(a)))
    ).then(() => self.skipWaiting())
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
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok && e.request.url.startsWith(self.location.origin)) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
