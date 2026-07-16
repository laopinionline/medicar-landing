/* MEDICAR — app del socio (PWA). Service worker mínimo: cachea el shell para
   arranque offline. SIN push en esta etapa. Firebase (auth/firestore) y el CDN
   gstatic son cross-origin → se dejan pasar a la red (nunca se cachean). */
const CACHE = 'medicar-socio-v13'; // Referente R1: acceso de referente (auth + código + ponderación)
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

// Instala: cachea el shell de forma resiliente (un recurso faltante no rompe el install).
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

// Activa: limpia caches viejas.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: solo GET same-origin (el shell). Cache-first con fallback a red y, si
// todo falla, al index cacheado. Lo cross-origin (Firebase/gstatic) no se intercepta.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase/gstatic → red directa
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
