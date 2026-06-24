import type { QueryClient } from "@tanstack/react-query";

/** TanStack query roots that hold per-night schedule payloads. */
export const BUILDER_NIGHT_QUERY_ROOTS = ["nightCore", "nightSecondary", "night"] as const;

type SessionCacheResetHandler = () => void;

let registeredHandler: SessionCacheResetHandler | null = null;

/** QueryProvider registers a handler that clears night query caches (and optional live state). */
export function registerOpsSessionQueryCacheHandler(
  handler: SessionCacheResetHandler,
): () => void {
  registeredHandler = handler;
  return () => {
    if (registeredHandler === handler) registeredHandler = null;
  };
}

/** Drop cached night bundles so a new PIN session never inherits another role's data. */
export function clearBuilderNightQueries(queryClient: QueryClient): void {
  for (const root of BUILDER_NIGHT_QUERY_ROOTS) {
    queryClient.removeQueries({ queryKey: [root] });
  }
}

/**
 * Called on PIN login, logout, and operator identity/permission changes.
 * Safe no-op when QueryProvider has not mounted yet.
 */
export function notifyOpsSessionChanged(): void {
  registeredHandler?.();
}