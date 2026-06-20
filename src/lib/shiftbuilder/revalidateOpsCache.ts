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
  revalidateTag('night-core', { expire: 0 });
}

/** Bust assignment-heavy night-core bundles after board mutations. */
export async function revalidateNightCoreCache(): Promise<void> {
  revalidateTag('night-core', { expire: 0 });
  revalidateTag('night-lookup', { expire: 0 });
}

/** Bust deferred night-secondary bundles (tasks, breaks, borders, notes). */
export async function revalidateNightSecondaryCache(): Promise<void> {
  revalidateTag('night-secondary', { expire: 0 });
}

/**
 * Bust all ShiftBuilder per-night read caches after placement or task edits.
 * Pass isoDate (YYYY-MM-DD) when known so date-scoped tags are cleared too.
 * Use { expire: 0 } (read-your-own-writes) so hard refresh immediately sees the change
 * instead of serving stale-while-revalidate content.
 */
export async function revalidateNightBoardCaches(isoDate?: string): Promise<void> {
  revalidateTag('night-core', { expire: 0 });
  revalidateTag('night-secondary', { expire: 0 });
  revalidateTag('night-lookup', { expire: 0 });
  revalidateTag('scheduled-roster', { expire: 0 });
  revalidateTag('graves-default', { expire: 0 });
  if (isoDate) {
    revalidateTag(`night-${isoDate}`, { expire: 0 });
  }
}