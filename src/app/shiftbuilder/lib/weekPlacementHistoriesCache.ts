import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import { PLACEMENT_SPREAD_NIGHTS } from "@/app/shiftbuilder/components/placementPadHelpers";

const SESSION_KEY = "oms_week_placement_histories_v1";

/** In-memory TM → 30-night spread (survives re-renders; hydrated from sessionStorage on load). */
const byTmId = new Map<string, ZoneDetailEntry | null>();

/** Dedupes concurrent fetches for the same missing TM set. */
let inflight: Promise<void> | null = null;
let inflightKey = "";

let sessionHydrated = false;

function hydrateFromSession(): void {
  if (sessionHydrated || typeof window === "undefined") return;
  sessionHydrated = true;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, ZoneDetailEntry | null>;
    for (const [id, entry] of Object.entries(parsed)) {
      if (!byTmId.has(id)) byTmId.set(id, entry ?? null);
    }
  } catch {
    // ignore corrupt cache
  }
}

function persistToSession(): void {
  if (typeof window === "undefined") return;
  try {
    const obj: Record<string, ZoneDetailEntry | null> = {};
    for (const [id, entry] of byTmId.entries()) {
      obj[id] = entry;
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
  } catch {
    // quota / private mode
  }
}

export function hasWeekPlacementHistory(tmId: string): boolean {
  hydrateFromSession();
  return byTmId.has(tmId);
}

export function getCachedWeekPlacementHistories(
  tmIds: string[],
): Record<string, ZoneDetailEntry | null> {
  hydrateFromSession();
  const out: Record<string, ZoneDetailEntry | null> = {};
  for (const id of tmIds) {
    if (byTmId.has(id)) out[id] = byTmId.get(id) ?? null;
  }
  return out;
}

export function allWeekPlacementHistoriesCached(tmIds: string[]): boolean {
  hydrateFromSession();
  return tmIds.length > 0 && tmIds.every((id) => byTmId.has(id));
}

/**
 * Returns histories for all requested TMs, fetching only IDs not yet cached.
 * Incremental — adding a TM to the week plan does not invalidate prior entries.
 */
export async function ensureWeekPlacementHistories(
  tmIds: string[],
): Promise<Record<string, ZoneDetailEntry | null>> {
  hydrateFromSession();
  const unique = [...new Set(tmIds.filter(Boolean))];
  const missing = unique.filter((id) => !byTmId.has(id));

  if (missing.length > 0) {
    const fetchKey = missing.sort().join(",");
    if (!inflight || inflightKey !== fetchKey) {
      inflightKey = fetchKey;
      inflight = (async () => {
        try {
          const res = await fetch("/api/shiftbuilder/placement-histories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tmIds: missing, days: PLACEMENT_SPREAD_NIGHTS }),
          });
          const data = await res.json();
          const histories =
            (data.histories as Record<string, ZoneDetailEntry | null>) ?? {};
          for (const id of missing) {
            byTmId.set(id, histories[id] ?? null);
          }
          persistToSession();
        } finally {
          inflight = null;
          inflightKey = "";
        }
      })();
    }
    await inflight;
  }

  return getCachedWeekPlacementHistories(unique);
}