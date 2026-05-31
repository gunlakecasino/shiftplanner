/**
 * Velvet ShiftForge Service Worker — Phase 0 (Minimal Safe Foundation)
 *
 * Goals for this phase:
 * - Instant repeat-visit shell (precached)
 * - Long-lived immutable cache for all fingerprinted Next.js assets
 * - Zero behavior change for the live board on first deployment
 *
 * Future phases (behind flag):
 * - Stale-While-Revalidate for roster / engine config / historical nights
 * - Network-First + Background Sync queue for active night mutations
 * - IndexedDB-backed offline roster + last 7 nights
 * - Grok suggestion response cache by snapshot signature
 *
 * Registration lives in src/app/layout.tsx (only in production + supported browsers).
 * Unregister / kill-switch will be exposed in Sudo for 30 days after full rollout.
 */

// === DEV SAFETY (defense in depth) ===
// If this SW ever runs in development (localhost), become a complete no-op.
// Turbopack HMR requires fresh, uncached module factories for chunks.
// This prevents "module factory is not available" errors during active refactoring.
if (self.location.hostname === 'localhost' ||
    self.location.hostname === '127.0.0.1' ||
    self.location.hostname.includes('.local')) {

  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });
  self.addEventListener('fetch', () => {
    // Let everything through — especially /_next/static chunks during dev
  });
  self.addEventListener('message', () => {});
  return; // Exit early. Never execute the production caching logic below.
}

// --- Real production SW code continues below ---

const CACHE_VERSION = "velvet-sf-v0.1.0";
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const SHELL_CACHE = `shell-${CACHE_VERSION}`;

// === PRECACHE LIST (Phase 0 — deliberately tiny and safe) ===
// Add more as we validate in prod.
const PRECACHE_ASSETS = [
  "/",                    // root landing (Operations Hub)
  "/shiftbuilder",        // the money surface — shell only
  "/manifest.json",
  // Next.js will serve hashed files; we let the fetch handler catch _next/static
];

// Install: Precache the critical shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(SHELL_CACHE);
      await shellCache.addAll(PRECACHE_ASSETS.filter(Boolean));
      // Immediately activate — we are not doing fancy skipWaiting dances yet.
      await self.skipWaiting();
    })()
  );
});

// Activate: Clean up old caches (simple + safe)
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.includes(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
      console.log("[Velvet SW] Activated", CACHE_VERSION);
    })()
  );
});

// Fetch strategy (Phase 0 — deliberately conservative)
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Immutable hashed assets → Cache First, 1 year (Next.js already gives us hashes)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.includes("/fonts/") ||
    url.pathname.includes("/material-symbols/") ||
    request.destination === "font" ||
    request.destination === "style"
  ) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      })
    );
    return;
  }

  // 2. Shell / navigation documents → Cache First, background update (very safe)
  if (request.mode === "navigate") {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached); // offline fallback to cache if we have it

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3. Everything else (API, Supabase, images, etc.) → pass through for now
  // Phase 1+ will add SWR / NetworkFirst + offline queue here.
  // This keeps risk at absolute zero for the first deployment.
  return;
});

// Optional: message handler for future kill-switch / version checks from the app
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "GET_VERSION") {
    event.ports[0]?.postMessage({ version: CACHE_VERSION });
  }
});
