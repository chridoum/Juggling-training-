// Service worker : l'appli fonctionne hors ligne une fois installée.
// Stratégie « réseau d'abord » : en ligne, on récupère toujours la dernière version ;
// hors ligne, on sert la copie gardée en cache.

const CACHE = 'juglog-v4';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/data.js',
  './js/ui.js',
  './js/theme.js',
  './js/catalog.js',
  './js/media.js',
  './js/metronome.js',
  './js/views/home.js',
  './js/views/agres.js',
  './js/views/figure.js',
  './js/views/train.js',
  './js/views/journal.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
