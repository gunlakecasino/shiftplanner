import type { CSSProperties } from "react";

/** Velvet glass shell — matches MarkerPad / command palette (--sb-glass*). */
export function velvetGlassPillStyle(extra?: CSSProperties): CSSProperties {
  return {
    background: "var(--sb-glass)",
    backdropFilter: "var(--sb-glass-blur)",
    WebkitBackdropFilter: "var(--sb-glass-blur)",
    border: "1px solid var(--sb-glass-border)",
    boxShadow:
      "inset 0 1px 0 var(--sb-glass-highlight), 0 8px 28px -10px rgba(0,0,0,0.4)",
    borderRadius: 6,
    color: "var(--sb-text-1, #1c1c1e)",
    ...extra,
  };
}

export const CANVAS_PILL_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

/** Fixed stack anchor — sits above ops status pill (bottom 10px). */
export const ROTATION_HEALTH_BOTTOM_PX = 44;

/** Per-day week health tracker — stacked above the rotation health cluster. */
export const WEEK_HEALTH_TRACKER_BOTTOM_PX = ROTATION_HEALTH_BOTTOM_PX + 92;

/** FloatingNav: fixed top + h-14 pill — keep week health gap in sync with nav layout. */
export const FLOATING_NAV_TOP_PX = 8;
export const FLOATING_NAV_HEIGHT_PX = 56;
export const WEEK_HEALTH_BELOW_NAV_GAP_PX = 4;
export const WEEK_HEALTH_TRACKER_BELOW_NAV_TOP_PX =
  FLOATING_NAV_TOP_PX + FLOATING_NAV_HEIGHT_PX + WEEK_HEALTH_BELOW_NAV_GAP_PX;

/** `bar` variant shell height — keep chrome slot in sync. */
export const WEEK_HEALTH_TRACKER_BAR_HEIGHT_PX = 56;

/** In-flow chrome row above builder workspace — centers the week health pill. */
export const WEEK_HEALTH_CHROME_SLOT_HEIGHT_PX = 72;

/** Breathing room between the floater and sheet header below. */
export const WEEK_HEALTH_BELOW_CONTENT_GAP_PX = 4;

/** Stage top inset — clears fixed FloatingNav only; week health lives in-flow in the chrome slot. */
export function stageTopInsetPx(): number {
  return WEEK_HEALTH_TRACKER_BELOW_NAV_TOP_PX;
}