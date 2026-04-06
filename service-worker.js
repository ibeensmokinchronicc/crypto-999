const CACHE_NAME = "crypto-999-v1";

// files to cache (add your icons if named differently)
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// install → cache static assets
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// activate → clean old cache
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if(key !== CACHE_NAME) return caches.delete(key);
      }))
    )
  );
});

// fetch strategy
self.addEventListener("fetch", event => {

  const url = event.request.url;

  // 🔥 API CACHE (SMART)
  if(url.includes("/sync")){
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request)) // fallback offline
    );
    return;
  }

  // ⚡ STATIC CACHE FIRST
  event.respondWith(
    caches.match(event.request).then(res => res || fetch(event.request))
  );
});
