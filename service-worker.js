const CACHE_NAME = "crypto-app-v6";

// STATIC FILES
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png"
];

// ======================
// 🚀 INSTALL
// ======================
self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// ======================
// 🔄 ACTIVATE
// ======================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

// ======================
// ⚡ FETCH HANDLER
// ======================
self.addEventListener("fetch", event => {
  const req = event.request;

  // 💎 HANDLE API DATA (/sync)
  if (req.url.includes("/sync")) {
    event.respondWith(networkWithCache(req));
    return;
  }

  // 📦 STATIC FILES
  event.respondWith(cacheFirst(req));
});

// ======================
// ⚡ CACHE FIRST (UI)
// ======================
async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(req);

  if (cached) return cached;

  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cached;
  }
}

// ======================
// 🧠 NETWORK + CACHE (DATA)
// ======================
async function networkWithCache(req) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(req);

    // clone response
    const clone = fresh.clone();

    // store in cache
    cache.put(req, clone);

    // ALSO store JSON in IndexedDB-like cache (via Cache API)
    const data = await fresh.clone().json();
    await cache.put("/offline-data", new Response(JSON.stringify(data)));

    return fresh;

  } catch (e) {

    // fallback to last cached API response
    const cached = await cache.match(req);

    if (cached) return cached;

    // fallback to saved offline data
    const offline = await cache.match("/offline-data");

    if (offline) return offline;

    // final fallback
    return new Response(JSON.stringify({
      balances: [],
      trades: [],
      alerts: [],
      staking: [],
      rewards: [],
      offline: true
    }));
  }
}

// ======================
// 🔔 PUSH
// ======================
self.addEventListener("push", event => {
  const data = event.data?.json() || {};

  self.registration.showNotification(data.title || "999 Crypto", {
    body: data.body || "Update",
    icon: "/icon-192.png"
  });
});

// ======================
// 🔘 CLICK
// ======================
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});
