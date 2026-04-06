const CACHE_NAME = "crypto-app-v5";

// CORE FILES (APP SHELL)
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
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// ======================
// 🔄 ACTIVATE
// ======================
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );

  self.clients.claim();
});

// ======================
// ⚡ FETCH STRATEGY
// ======================
self.addEventListener("fetch", event => {

  const req = event.request;

  // API STRATEGY (SMART CACHE)
  if (req.url.includes("/sync")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // STATIC FILES (CACHE FIRST)
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
// 🌐 NETWORK FIRST (DATA)
// ======================
async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(req);
    return cached || new Response(JSON.stringify({ offline: true }));
  }
}

// ======================
// 🔔 PUSH NOTIFICATIONS
// ======================
self.addEventListener("push", event => {
  const data = event.data?.json() || {};

  self.registration.showNotification(data.title || "999 Crypto", {
    body: data.body || "Update",
    icon: "/icon-192.png"
  });
});

// ======================
// 🔘 NOTIFICATION CLICK
// ======================
self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow("/")
  );
});
