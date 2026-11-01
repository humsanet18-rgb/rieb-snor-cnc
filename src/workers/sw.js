// Template: the build fills in the version and the file list, then writes it to dist/sw.js.
const CACHE = 'rieb-snor-__VERSION__';
const FILES = [/*FILES*/];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('rieb-snor-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Pages come from the network first so an update is seen; hashed assets never change.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('./')));
    return;
  }
  // ignoreVary: hosts often send Vary: Origin, which would hide cached module scripts.
  e.respondWith(caches.match(e.request, { ignoreVary: true }).then(hit => hit ?? fetch(e.request)));
});
