/** Light haptic pulse on touch tablet — assignment confirmations, pad open, etc. */
export function tabletHaptic(ms = 12): void {
  if (typeof navigator === "undefined" || !navigator.vibrate) return;
  if (!window.matchMedia("(pointer: coarse) and (min-width: 768px)").matches) return;
  try {
    navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}