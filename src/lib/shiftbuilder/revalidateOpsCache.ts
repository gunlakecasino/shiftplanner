'use server';

import { revalidateTag } from 'next/cache';

/** Bust edge/server caches after tm_profiles or roster-affecting admin edits. */
export async function revalidateRosterCache(): Promise<void> {
  revalidateTag('roster', 'max');
}

/** Bust slot default caches after Defaults tab mutations. */
export async function revalidateSlotDefaultsCache(): Promise<void> {
  revalidateTag('slot-defaults', 'max');
}

/** Bust graves default schedule derived roster API cache. */
export async function revalidateScheduledRosterCache(): Promise<void> {
  revalidateTag('scheduled-roster', 'max');
  revalidateTag('graves-default', 'max');
  revalidateTag('night-core', 'max');
}

/** Bust assignment-heavy night-core bundles after board mutations. */
export async function revalidateNightCoreCache(): Promise<void> {
  revalidateTag('night-core', 'max');
  revalidateTag('night-lookup', 'max');
}

/** Bust deferred night-secondary bundles (tasks, breaks, borders, notes). */
export async function revalidateNightSecondaryCache(): Promise<void> {
  revalidateTag('night-secondary', 'max');
}

/**
 * Bust all ShiftBuilder per-night read caches after placement or task edits.
 * Pass isoDate (YYYY-MM-DD) when known so date-scoped tags are cleared too.
 */
export async function revalidateNightBoardCaches(isoDate?: string): Promise<void> {
  revalidateTag('night-core', 'max');
  revalidateTag('night-secondary', 'max');
  revalidateTag('night-lookup', 'max');
  if (isoDate) {
    revalidateTag(`night-${isoDate}`, 'max');
  }
}