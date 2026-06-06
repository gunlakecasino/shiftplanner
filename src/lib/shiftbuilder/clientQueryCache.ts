/**
 * In-browser TTL caches for hot Supabase read paths.
 * Complements TanStack Query (per-night) and server unstable_cache (roster).
 * Keeps repeated getNightIdForDate / getSlotDefaults calls near-instant within a session.
 */

const NIGHT_ID_TTL_MS = 5 * 60 * 1000;
const SLOT_DEFAULTS_TTL_MS = 10 * 60 * 1000;
const ENGINE_CONFIG_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { value: T; expiresAt: number };

const nightIdByDate = new Map<string, CacheEntry<string | null>>();
let slotDefaultsCache: CacheEntry<unknown[]> | null = null;
let engineConfigCache: CacheEntry<unknown> | null = null;

function isFresh<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
  return !!entry && entry.expiresAt > Date.now();
}

export function readNightIdCache(dateKey: string): string | null | undefined {
  const hit = nightIdByDate.get(dateKey);
  if (!isFresh(hit)) {
    if (hit) nightIdByDate.delete(dateKey);
    return undefined;
  }
  return hit.value;
}

export function writeNightIdCache(dateKey: string, nightId: string | null): void {
  nightIdByDate.set(dateKey, {
    value: nightId,
    expiresAt: Date.now() + NIGHT_ID_TTL_MS,
  });
}

export function invalidateNightIdCache(dateKey?: string): void {
  if (dateKey) nightIdByDate.delete(dateKey);
  else nightIdByDate.clear();
}

export function readSlotDefaultsCache<T>(): T[] | undefined {
  if (!isFresh(slotDefaultsCache)) {
    slotDefaultsCache = null;
    return undefined;
  }
  return slotDefaultsCache!.value as T[];
}

export function writeSlotDefaultsCache<T>(rows: T[]): void {
  slotDefaultsCache = {
    value: rows,
    expiresAt: Date.now() + SLOT_DEFAULTS_TTL_MS,
  };
}

export function invalidateSlotDefaultsCache(): void {
  slotDefaultsCache = null;
}

export function readEngineConfigCache<T>(): T | undefined {
  if (!isFresh(engineConfigCache)) {
    engineConfigCache = null;
    return undefined;
  }
  return engineConfigCache!.value as T;
}

export function writeEngineConfigCache<T>(config: T): void {
  engineConfigCache = {
    value: config,
    expiresAt: Date.now() + ENGINE_CONFIG_TTL_MS,
  };
}

export function invalidateEngineConfigCache(): void {
  engineConfigCache = null;
}