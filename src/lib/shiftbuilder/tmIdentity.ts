/**
 * TM identity helpers — tm_profiles uses both `id` (UUID) and `tm_id` (legacy slug).
 * Assignments and zone cards use `tm_id`; some admin APIs return UUID as `id`.
 */

export function assignmentTmId(tm: {
  id?: string;
  tmId?: string;
  tm_id?: string;
  profileId?: string;
}): string {
  return (tm.tm_id || tm.tmId || tm.id || "").trim();
}

/**
 * Canonical board id for schedule sets and roster rows.
 * Prefer tm_id slug (matches zone_assignments + roster `id` from data.ts).
 * Scheduled-roster API rows expose UUID as `id` and slug as `tmId`.
 */
export function boardTmId(tm: {
  id?: string;
  tmId?: string;
  tm_id?: string;
}): string {
  return (tm.tmId || tm.tm_id || tm.id || "").trim();
}

/** Build a Set of board ids from scheduled-roster API payloads. */
export function boardTmIdsFromScheduled(allScheduled: unknown[]): Set<string> {
  const out = new Set<string>();
  for (const row of allScheduled) {
    const id = boardTmId(row as { id?: string; tmId?: string; tm_id?: string });
    if (id) out.add(id);
  }
  return out;
}

/** Index a roster array by every known id form for O(1) lookup. */
export function buildTmLookupIndex(roster: any[]): Map<string, any> {
  const map = new Map<string, any>();
  for (const tm of roster) {
    if (!tm) continue;
    const keys = [tm.id, tm.tmId, tm.tm_id, tm.profileId].filter(Boolean) as string[];
    for (const k of keys) {
      if (!map.has(k)) map.set(k, tm);
    }
  }
  return map;
}

/** Resolve any stored id to the TM row used on the board (assignments use assignmentTmId). */
export function resolveTmFromLookup(
  lookup: Map<string, any>,
  storedId: string
): any | undefined {
  return lookup.get(storedId);
}

/** True when a roster row matches any id in the placed set (slug/UUID alias-safe). */
export function isTmPlacedTonight(
  tm: { id?: string; tmId?: string; tm_id?: string },
  placedIds: Set<string>,
  lookup?: Map<string, { id?: string; tmId?: string; tm_id?: string }>,
): boolean {
  const boardId = boardTmId(tm);
  if (!boardId) return false;
  if (placedIds.has(boardId)) return true;
  for (const pid of placedIds) {
    if (!pid) continue;
    if (pid === boardId) return true;
    const resolved = lookup?.get(pid);
    if (resolved && boardTmId(resolved) === boardId) return true;
  }
  return false;
}

/** Collect every assignment tm id (committed + draft proposals). */
export function collectPlacedTmIds(
  assignments: Record<string, { tmId?: string | null } | undefined>,
  draftAssignments?: Record<string, { tmId?: string | null; proposedTmId?: string; proposedClear?: boolean } | undefined>,
): Set<string> {
  const out = new Set<string>();
  for (const a of Object.values(assignments)) {
    if (a?.tmId) out.add(a.tmId);
  }
  if (draftAssignments) {
    for (const d of Object.values(draftAssignments)) {
      if (d?.proposedClear) continue;
      const id = d?.proposedTmId || d?.tmId;
      if (id) out.add(id);
    }
  }
  return out;
}
