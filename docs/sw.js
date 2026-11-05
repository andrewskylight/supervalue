/* Offline cache for the app itself. Data lives in localStorage; the sheet API is never cached. */
var CACHE = 'sva-v1.2.1';
var FILES = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest',
  'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // cache:'reload' skips the browser's HTTP cache, so a new version never mixes with stale files
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Cached copy first (opens instantly even on weak store signal); refresh the cache in the background.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
      if (hit) { net.catch(function () {}); return hit; }
      return net.catch(function () { return req.mode === 'navigate' ? caches.match('index.html') : Response.error(); });
    })
  );
});
