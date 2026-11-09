// Service worker : l'appli fonctionne hors ligne une fois installée.
// Stratégie « réseau d'abord » : en ligne, on récupère toujours la dernière version ;
// hors ligne, on sert la copie gardée en cache.

const CACHE = 'juglog-v16';
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
  './js/player.js',
  './js/zip.js',
  './js/drag.js',
  './js/history.js',
  './js/clipcut.js',
  './js/views/compare.js',
  './js/views/train.js',
  './js/views/journal.js',
  './js/views/resources.js',
  './js/views/settings.js',
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

// Partage Android : le téléphone envoie un POST ; on met de côté le contenu et
// on renvoie l'appli sur #/partage, qui le récupère.
async function stashShare(req) {
  const fd = await req.formData();
  const c = await caches.open('juglog-share');
  const file = fd.get('media');
  if (file && file.size) {
    await c.put('shared-file', new Response(file, {
      headers: { 'content-type': file.type || 'video/mp4', 'x-filename': encodeURIComponent(file.name || '') },
    }));
  }
  const text = ['title', 'text', 'url'].map(k => fd.get(k)).filter(Boolean).join(' ').trim();
  if (text) await c.put('shared-text', new Response(text));
  return Response.redirect(new URL('#/partage', self.registration.scope).href, 303);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method === 'POST' && new URL(req.url).pathname.endsWith('/share')) {
    e.respondWith(stashShare(req).catch(() => Response.redirect(new URL('#/ressources', self.registration.scope).href, 303)));
    return;
  }
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
