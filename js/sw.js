const CACHE_NAME = 'sgp-cache-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/addproduct.html',
  '/settings.html',
  '/manifest.json',
  '/css/style.css',
  '/js/main.js',
  '/js/addproduct.js',
  '/js/settings.js',
  '/js/register-sw.js'
  // add icons if present: '/icons/icon-192.png', '/icons/icon-512.png'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  // Try cache first, then network
  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) return cached;
      return fetch(evt.request).then(res => {
        // optionally cache new requests (best for same-origin static assets)
        return res;
      }).catch(() => {
        // fallback: could return an offline page if provided
        return caches.match('/index.html');
      });
    })
  );
});
