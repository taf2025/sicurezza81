/* ============================================================
   sw.js — Service Worker: cache offline (app shell)
   ============================================================ */
const CACHE = 'sicurezza81-v25';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/data.js',
  './js/utils.js',
  './js/dashboard.js',
  './js/verifiche.js',
  './js/nc.js',
  './js/figure.js',
  './js/reports.js',
  './js/exports.js',
  './js/app.js',
  './vendor/bootstrap.min.css',
  './vendor/bootstrap.bundle.min.js',
  './vendor/chart.umd.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',
  './vendor/xlsx.full.min.js',
  './vendor/docx.umd.js',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Strategia:
//  - File dell'app (HTML/JS/CSS, stessa origine, esclusi vendor/icone): NETWORK-FIRST
//    → quando c'è rete si prende sempre la versione aggiornata; offline si usa la cache.
//  - Librerie vendor e icone (stabili, pesanti): CACHE-FIRST (veloce).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const stabile = url.pathname.includes('/vendor/') || url.pathname.includes('/icons/');

  const fromNetwork = () => fetch(e.request).then((resp) => {
    const copy = resp.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
    return resp;
  });

  if (sameOrigin && !stabile) {
    // network-first con fallback alla cache (offline)
    e.respondWith(fromNetwork().catch(() => caches.match(e.request).then((c) => c || caches.match('./index.html'))));
  } else {
    // cache-first con fallback alla rete
    e.respondWith(caches.match(e.request).then((cached) => cached || fromNetwork().catch(() => caches.match('./index.html'))));
  }
});
