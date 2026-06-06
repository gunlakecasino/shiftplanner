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