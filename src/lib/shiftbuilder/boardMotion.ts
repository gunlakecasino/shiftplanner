/**
 * SheetBuilder P0 motion helpers — settle pulses + poll hairline.
 * CSS-only cues; never remount the board.
 */

export const SB_MOTION_INSTANT_MS = 100;
export const SB_MOTION_QUICK_MS = 170;
export const SB_MOTION_MOVE_MS = 220;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function restartClass(el: Element, className: string): void {
  el.classList.remove(className);
  if (el instanceof HTMLElement) void el.offsetWidth;
  el.classList.add(className);
}

/** Thin topbar hairline — global cue that a ~20s poll ticked. */
export function pulseBoardPollHairline(): void {
  if (typeof document === "undefined") return;
  const topbar = document.querySelector(".sb-sheetbuilder-topbar");
  if (!topbar) return;
  restartClass(topbar, "sb-poll-hairline-pulse");
}

/** Short overshoot + rail pulse on the drop target. Visual no-op if missing. */
export function pulseDropTarget(slotKey: string): void {
  if (typeof document === "undefined" || !slotKey) return;
  if (prefersReducedMotion()) return;
  const host = document.querySelector(`[data-slot-key="${CSS.escape(slotKey)}"]`);
  if (!host) return;
  const card =
    host.matches(".assignment-card, .sb-assignment-card")
      ? host
      : host.querySelector(".assignment-card, .sb-assignment-card");
  if (!card) return;
  restartClass(card, "sb-dnd-settle");
  globalThis.setTimeout(() => card.classList.remove("sb-dnd-settle"), SB_MOTION_MOVE_MS + 40);
}

/** Stable presence key — same TM stays mounted across assigned ↔ draft. */
export function placementIdentityKey(state: {
  kind: string;
  tmId?: string;
  tmName?: string;
  proposedTmId?: string;
  proposedName?: string;
}): string {
  if (state.kind === "assigned") return `tm:${state.tmId || state.tmName || "assigned"}`;
  if (state.kind === "draft") {
    return `tm:${state.proposedTmId || state.proposedName || "draft"}`;
  }
  return state.kind;
}
