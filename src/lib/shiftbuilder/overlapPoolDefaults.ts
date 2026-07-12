/**
 * Overlap standing-pool helpers for Projects → Defaults (PR5).
 *
 * Seats within AM or PM are fungible; standing tasks are a **band pool**.
 * - Read: union any `overlap_am_*` / `overlap_pm_*` (and bare `overlap_am` / `overlap_pm`).
 * - Write (new pool members): always `overlap_am_0` / `overlap_pm_0`.
 *
 * Pure — no Supabase / React.
 */

export type OverlapPoolBand = "am" | "pm";

/** Match pool keys: `overlap_am`, `overlap_am_0`…`5`, same for pm. */
const OVERLAP_POOL_SLOT_RE = /^overlap_(am|pm)(?:_\d+)?$/i;

/** Band for a DB slot_key, or null if not an overlap pool key. */
export function overlapPoolBand(slotKey: string): OverlapPoolBand | null {
  const m = String(slotKey ?? "").trim().match(OVERLAP_POOL_SLOT_RE);
  if (!m) return null;
  return m[1].toLowerCase() as OverlapPoolBand;
}

/** True when slot_key belongs to the AM or PM standing pool. */
export function isOverlapPoolSlotKey(slotKey: string): boolean {
  return overlapPoolBand(slotKey) != null;
}

/** Canonical bucket for new pool members (create / Defaults UX write path). */
export function canonicalOverlapPoolSlotKey(band: OverlapPoolBand): string {
  return band === "am" ? "overlap_am_0" : "overlap_pm_0";
}

/**
 * If `slotKey` is any overlap pool key, return the canonical `_0` bucket;
 * otherwise return the original key unchanged.
 */
export function canonicalizeDefaultSlotKey(slotKey: string): string {
  const band = overlapPoolBand(slotKey);
  if (!band) return slotKey;
  return canonicalOverlapPoolSlotKey(band);
}

/** Group key used in DefaultsView for the band pool card. */
export function overlapPoolGroupKey(band: OverlapPoolBand): string {
  return `overlap_pool_${band}`;
}

export function overlapPoolLabel(band: OverlapPoolBand): string {
  return band === "am" ? "AM Overlap Pool" : "PM Overlap Pool";
}

export const OVERLAP_POOL_BLURB =
  "Standing pool for staffed seats — distributed when you Apply Overlap Tasks (not auto-seeded on night create).";
