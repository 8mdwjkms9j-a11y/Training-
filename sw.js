// Service worker: permite abrir la app sin conexión.
const CACHE = "entreno-v8";
const ASSETS = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "plan.js",
  "manifest.webmanifest",
  "icons/entreno-180-v2.png",
  "icons/entreno-192-v2.png",
  "icons/entreno-512-v2.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Red primero (para recibir cambios de la pauta), caché si no hay conexión.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
