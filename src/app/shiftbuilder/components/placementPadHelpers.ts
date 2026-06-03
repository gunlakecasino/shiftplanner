import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";

/** Nights of history used for the placement spread grid. */
export const PLACEMENT_SPREAD_NIGHTS = 30;

/** Unique slot keys the TM worked at least once in the last N grave nights (before viewed night). */
export function getSpreadPlacementKeys(
  h: ZoneDetailEntry | null,
  nightCount: number = PLACEMENT_SPREAD_NIGHTS,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));

  const nightsIncluded = new Set<string>();
  const keys = new Set<string>();

  for (const e of events) {
    if (nightsIncluded.size >= nightCount && !nightsIncluded.has(e.d)) continue;
    nightsIncluded.add(e.d);
    keys.add(e.ui);
  }

  return Array.from(keys);
}

/** Most recent N placement UI keys for a TM, prior to viewed night. */
export function getRecentPlacementKeys(
  h: ZoneDetailEntry | null,
  n: number,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));
  const topN = events.slice(0, n);
  const seen = new Set<string>();
  const uniques: string[] = [];
  for (const e of topN) {
    if (!seen.has(e.ui)) {
      seen.add(e.ui);
      uniques.push(e.ui);
    }
  }
  return uniques;
}

export function getDaysSinceForKey(
  h: ZoneDetailEntry | null,
  key: string,
  beforeIso: string,
): string {
  const dates = (h?.zoneDates?.[key] || []).filter((d: string) => d <= beforeIso);
  if (!dates.length) return "—";
  const latest = dates.sort().reverse()[0];
  if (latest === beforeIso) return "today";
  const d1 = new Date(beforeIso + "T12:00:00");
  const d2 = new Date(latest + "T12:00:00");
  const diffMs = d1.getTime() - d2.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 3600 * 24)));
  return `${days}d`;
}

export function nightIsoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Last N placement nights, newest → oldest (most recent first).
 * Includes duplicate locations (e.g. Z1, Z1, Z1, Z4, ADM).
 */
export function getLastPlacementSequence(
  h: ZoneDetailEntry | null,
  n: number,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));
  return events.slice(0, n).map((e) => e.ui);
}

/** Compact label for matrix cells and last-5 pills (no spaces). */
export function formatPlacementUiLabel(ui: string, fallback?: string): string {
  if (ui === "Z9SR") return "Z9SR";
  if (/^Z\d+$/.test(ui)) return ui;
  if (ui.startsWith("MRR")) return `RR${ui.replace("MRR", "")}M`;
  if (ui.startsWith("WRR")) return `RR${ui.replace("WRR", "")}W`;
  if (ui.startsWith("TR")) return `T${ui.replace(/\D/g, "")}`;
  const raw = fallback ?? ui;
  return raw.replace(/\s+/g, "");
}