/* Shipyard Calc - offline cache. Bump VERSION when any file changes. */
var PREFIX = "shipyard-calc-preview-"; // PREVIEW copy: never shares or deletes the live app's caches
var VERSION = PREFIX + "v10";
var FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./calc.js",
  "./i18n.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png",
  "./qr.svg"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: "reload" }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Page, code and styles: try the network first (so online phones always get the newest version),
// fall back to the saved copy after 4 s or when offline. Images: saved copy first.
function isCode(req, url) {
  return req.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(url.pathname) || /\/$/.test(url.pathname);
}
function networkFirst(req) {
  return new Promise(function (resolve) {
    var done = false;
    function fromCache() {
      return caches.open(VERSION).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || (req.mode === "navigate" ? c.match("./index.html") : undefined);
        });
      });
    }
    var timer = setTimeout(function () {
      fromCache().then(function (hit) { if (hit && !done) { done = true; resolve(hit); } });
    }, 4000);
    fetch(req, { cache: "no-cache" }).then(function (res) {
      if (res && res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
      }
      if (!done) { done = true; clearTimeout(timer); resolve(res); }
    }).catch(function () {
      clearTimeout(timer);
      fromCache().then(function (hit) { if (!done) { done = true; resolve(hit || Response.error()); } });
    });
  });
}

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf("/shipyard-calc-preview/") !== 0) return; // PREVIEW: never answer for anything outside this folder
  if (isCode(e.request, url)) { e.respondWith(networkFirst(e.request)); return; }
  e.respondWith(
    caches.open(VERSION).then(function (c) { return c.match(e.request, { ignoreSearch: true }); }).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
        return res;
      });
    })
  );
});
