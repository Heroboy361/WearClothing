// Service Worker: macht die App-Oberfläche offline nutzbar (PWA).
const CACHE = 'wearclothing-v14';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/lock.js',
  './js/app.js',
  './js/i18n.js',
  './js/icons.js',
  './js/db.js',
  './js/openai.js',
  './js/gemini.js',
  './js/advisor.js',
  './js/style-knowledge.js',
  './fonts/instrument-sans-latin-wght-normal.woff2',
  './fonts/instrument-sans-latin-ext-wght-normal.woff2',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
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
  if (e.request.method !== 'GET') return; // KI-Aufrufe (POST) gehen direkt ins Netz
  if (!e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((res) => {
          if (res.ok) {
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
