const CACHE = "shiftforge-shell-v1";
const PRECACHE = [
  "/shiftbuilder",
  "/icons/shiftforge-icon.svg",
  "/icons/shiftforge-maskable.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

// === NUCLEAR OPTION FOR DEV ===
// If this SW ever activates while the page is on localhost / dev port,
// immediately unregister itself and clear its caches.
// This prevents the SW from ever being the cause of "module factory is not available"
// errors in Turbopack HMR, even if a stale registration from a previous build survives.
self.addEventListener("activate", (event) => {
  const isDev =
    self.location.hostname === "localhost" ||
    self.location.hostname === "127.0.0.1" ||
    self.location.hostname.endsWith(".local") ||
    self.location.port === "3000" ||
    self.location.port === "3001";

  if (isDev) {
    event.waitUntil(
      (async () => {
        // Clear our own cache
        await caches.delete(CACHE);

        // Unregister this service worker so it can never control the page again
        const registration = await self.registration.unregister();

        // Tell all clients to reload so they get a clean slate without SW control
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "SW_SELF_DESTRUCTED_IN_DEV" });
          // Force a hard reload from the SW side (best effort)
          client.navigate(client.url);
        }
      })()
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // === CRITICAL: Never interfere with Turbopack / Next.js HMR in development ===
  // This prevents "module factory is not available" errors caused by the SW
  // serving stale /_next/static chunks or the main app shell during hot updates.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.includes("hot-update") ||
    url.searchParams.has("_rsc") // React Server Components / HMR hints
  ) {
    return; // Let the browser handle it directly (no SW interception)
  }

  // Extra dev safety: if running on localhost/127.0.0.1, bail out entirely for fetch handling.
  // Complements the aggressive unregister + cache clear done in src/app/layout.tsx.
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".local")
  ) {
    return;
  }

  const isShell =
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    url.pathname === "/shiftbuilder";

  if (!isShell) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200) return response;
        const clone = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, clone));
        return response;
      });
    }),
  );
});