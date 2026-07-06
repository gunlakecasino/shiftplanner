"use client";

import { useEffect } from "react";

/**
 * Canonical production service-worker registrar + update lifecycle.
 *
 * Registering is only half the job — without an update flow a redeploy can pin the
 * installed iPad PWA to a stale build (its cached HTML references chunk hashes that no
 * longer exist on the server), with no in-app way to recover. This:
 *   1. registers /sw.js in production,
 *   2. proactively checks for a new build on load, on tab-focus, and hourly, and
 *   3. when a new worker installs over the current one, promotes it and reloads once.
 *
 * Dev is a hard no-op — the pre-hydration inline script in layout.tsx unregisters any SW
 * and clears caches so Turbopack HMR stays healthy. We avoid any `process`/`process.env`
 * reference here (crashes iPad Safari simulator under Turbopack).
 */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const host = location.hostname;
    const isDev =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      location.port === "3000" ||
      location.port === "3001";
    if (isDev) return;
    // Secure contexts only.
    if (location.protocol !== "https:") return;

    let reloaded = false;
    let updatePending = false;
    let cleanup = () => {};

    // Fired when the new worker takes control — reload once so the fresh build renders.
    const onControllerChange = () => {
      if (!updatePending || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          const checkForUpdate = () => reg.update().catch(() => undefined);
          checkForUpdate();

          const onVisible = () => {
            if (document.visibilityState === "visible") checkForUpdate();
          };
          document.addEventListener("visibilitychange", onVisible);
          const interval = window.setInterval(checkForUpdate, 60 * 60 * 1000);

          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              // A new worker reaching "installed" while one already controls the page is a
              // genuine update (not the first install) — promote it and let
              // controllerchange trigger the reload.
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                updatePending = true;
                installing.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });

          cleanup = () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.clearInterval(interval);
          };
        })
        .catch(() => undefined);
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      cleanup();
    };
  }, []);

  return null;
}
