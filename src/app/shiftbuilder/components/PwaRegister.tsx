"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";

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
    let waitingWorker: ServiceWorker | null = null;
    let cleanup = () => {};

    const activateWaitingWorker = () => {
      if (!waitingWorker) return;
      updatePending = true;
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
      waitingWorker = null;
    };

    const unsubscribeDraft = useShiftBuilderStore.subscribe((state) => {
      if (waitingWorker && Object.keys(state.draftAssignments).length === 0) {
        activateWaitingWorker();
      }
    });

    // Fired when the new worker takes control — reload once so the fresh build renders.
    const onControllerChange = () => {
      if (!updatePending || reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const register = () => {
      navigator.serviceWorker
        // updateViaCache:"none" — never serve sw.js (or its imports) from the HTTP
        // cache during update checks, so a new build's worker is always detected.
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
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
                waitingWorker = installing;
                const draftCount = Object.keys(
                  useShiftBuilderStore.getState().draftAssignments,
                ).length;
                if (draftCount > 0) {
                  toast.info("Update ready", {
                    description: "Finish or discard the open draft; the app will update safely afterward.",
                    duration: 10_000,
                  });
                } else {
                  activateWaitingWorker();
                }
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
      unsubscribeDraft();
      cleanup();
    };
  }, []);

  return null;
}
