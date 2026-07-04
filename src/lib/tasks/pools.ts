// Pure pool-distribution logic — no ShiftBuilder imports, no Supabase.
// Given a set of pool task ids and a set of eligible member ids, produce an
// assignment of each task to a member. Deterministic given a seed (random mode),
// so it is unit-testable and reproducible.

import type { DistributionMode } from "./types";

export type { DistributionMode };

export interface DistributionResult {
  taskId: string;
  assigneeTmId: string;
}

/** Small deterministic PRNG (mulberry32) so 'random' mode is seedable/testable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Distributes tasks across members.
 *   - round_robin: tasks assigned by cycling members in given order (fair, stable).
 *   - random: members shuffled (seeded) first, then cycled — spreads without a
 *     fixed order bias across repeated runs with different seeds.
 *   - manual: no automatic assignment (returns []).
 * Returns [] when there are no members or no tasks.
 */
export function distributeTasks(
  taskIds: string[],
  memberIds: string[],
  mode: DistributionMode,
  seed = 1,
): DistributionResult[] {
  if (mode === "manual") return [];
  if (taskIds.length === 0 || memberIds.length === 0) return [];

  const order = mode === "random" ? seededShuffle(memberIds, seed) : memberIds;
  return taskIds.map((taskId, i) => ({
    taskId,
    assigneeTmId: order[i % order.length],
  }));
}
