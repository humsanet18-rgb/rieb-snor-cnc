// Template: the build fills in the version and the file list, then writes it to dist/sw.js.
const CACHE = 'rieb-snor-257a59c4cb4a';
const FILES = ["./","manifest.webmanifest","favicon.ico","favicon-16x16.png","favicon-32x32.png","apple-touch-icon.png","icon-192.png","icon-512.png","samples/block-letters.svg","samples/mixed-shapes.svg","samples/file-with-problems.svg","assets/index-Ci6vkznu.js","assets/battambang-khmer-400-normal-qFamkjv4.woff","assets/battambang-khmer-400-normal-s3caPRQm.woff2","assets/battambang-khmer-700-normal-C6Gn1NAv.woff2","assets/battambang-khmer-700-normal-DTQADywV.woff","assets/engine.worker-BjQ4hote.js","assets/index-DOFS5y6a.css","assets/moul-khmer-400-normal-BGpNh90c.woff2","assets/moul-khmer-400-normal-Lf6ZT74W.woff"];

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
