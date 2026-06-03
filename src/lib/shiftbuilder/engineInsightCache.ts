/**
 * In-process insight cache (single-operator ShiftBuilder; survives warm serverless instances).
 */

const CACHE_TTL_MS = 50 * 60 * 1000;
const MAX_ENTRIES = 80;

type CacheEntry<T> = { at: number; value: T };

const store = new Map<string, CacheEntry<unknown>>();

export function getInsightCache<T>(key: string): T | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return hit.value as T;
}

export function setInsightCache<T>(key: string, value: T): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = [...store.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) store.delete(oldest[0]);
  }
  store.set(key, { at: Date.now(), value });
}

export function stableInsightKey(parts: Record<string, string | undefined>): string {
  return Object.entries(parts)
    .filter(([, v]) => v != null && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("|");
}