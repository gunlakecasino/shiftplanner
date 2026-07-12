/** Light haptic pulse on touch tablet — assignment confirmations, pad open, etc. */
export function tabletHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  // Any coarse pointer (incl. Split View), not only full-width tablet.
  try {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
  } catch {
    return;
  }
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}