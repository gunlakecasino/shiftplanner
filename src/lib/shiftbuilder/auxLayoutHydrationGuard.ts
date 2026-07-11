/**
 * Pure gate for aux_layout POST.
 * Prevents the pre-hydrate default shell (Admin + Z9 SR + blanks) from
 * overwriting a real night layout on mount, day switch, or slow night-core.
 */
export function shouldPersistAuxLayout(opts: {
  hydrated: boolean;
  hydratedDayKey: string | null;
  currentDayKey: string;
  layoutLength?: number;
}): boolean {
  if (!opts.hydrated) return false;
  if (opts.hydratedDayKey != null && opts.hydratedDayKey !== opts.currentDayKey) {
    return false;
  }
  if (opts.layoutLength != null && opts.layoutLength <= 0) return false;
  return true;
}
