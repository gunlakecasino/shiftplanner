// ShiftForge service worker.
//
// Strategy (production only — dev is hard-bailed below):
//   • App navigations (HTML)      → network-first, fall back to cached shell, then an
//                                    offline page. A fresh deploy ALWAYS wins for the
//                                    document, so a redeploy can never pin the installed
//                                    PWA to an HTML that references dead chunk hashes.
//   • /_next/static/* (immutable) → cache-first. Hash-named, safe to keep forever; the
//                                    version bump below purges them on activate. This is
//                                    what makes an offline / spotty-wifi launch actually
//                                    boot the board instead of showing a white screen.
//   • Icons + manifest            → stale-while-revalidate.
//   • Everything else             → passthrough.
//
// Bump CACHE_VERSION on every release so activate() purges the previous caches.
const CACHE_VERSION = "v2";
const SHELL_CACHE = `shiftforge-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `shiftforge-static-${CACHE_VERSION}`;
const OFFLINE_URL = "/shiftbuilder";

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
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => undefined)),
  );
  // Take over as soon as installed; the page controls the reload via controllerchange.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Let the page promote a waiting worker immediately (belt-and-suspenders with skipWaiting).
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// === NUCLEAR OPTION FOR DEV ===
// If this SW ever activates while the page is on localhost / a dev port, immediately
// unregister itself and clear its caches. Prevents the SW from ever being the cause of
// "module factory is not available" errors in Turbopack HMR from a stale registration.
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
        await caches.delete(SHELL_CACHE);
        await caches.delete(STATIC_CACHE);
        await self.registration.unregister();
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.postMessage({ type: "SW_SELF_DESTRUCTED_IN_DEV" });
          client.navigate(client.url);
        }
      })(),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never interfere with HMR / RSC streaming.
  if (url.pathname.includes("hot-update") || url.searchParams.has("_rsc")) return;

  // Dev safety: bail out entirely (complements the unregister in layout.tsx).
  if (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname.endsWith(".local") ||
    self.location.port === "3000" ||
    self.location.port === "3001"
  ) {
    return;
  }

  // Immutable build assets → cache-first (this is the offline-boot fix).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
  // Other /_next/ paths (image optimizer, data, RSC) → let the network handle them.
  if (url.pathname.startsWith("/_next/")) return;

  // HTML navigations → network-first so a live deploy always wins.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Shell assets → stale-while-revalidate.
  if (url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json") {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Everything else → passthrough.
});

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.status === 200) {
    const clone = response.clone();
    caches.open(cacheName).then((c) => c.put(request, clone));
  }
  return response;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      // Keep the canonical shell fresh for offline fallback.
      const clone = response.clone();
      caches.open(SHELL_CACHE).then((c) => c.put(OFFLINE_URL, clone));
    }
    return response;
  } catch {
    const cached = (await caches.match(request)) || (await caches.match(OFFLINE_URL));
    if (cached) return cached;
    return new Response(
      "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
        "<title>Offline — ShiftForge</title>" +
        "<body style='font-family:system-ui;background:#111113;color:#f2f2f4;display:grid;place-items:center;height:100vh;margin:0'>" +
        "<div style='text-align:center;max-width:24rem;padding:0 1.5rem'>" +
        "<h1 style='font-weight:600;margin:0 0 .5rem'>Offline</h1>" +
        "<p style='opacity:.7;margin:0'>ShiftForge needs a connection to load. It will recover automatically when you're back online.</p>" +
        "</div>",
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(cacheName).then((c) => c.put(request, clone));
      }
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
