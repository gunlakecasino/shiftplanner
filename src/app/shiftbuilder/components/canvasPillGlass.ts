import type { CSSProperties } from "react";
import {
  BUILDER_CANVAS_MAX_WIDTH_PX,
  DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
  FLOATING_NAV_HEIGHT_PX,
  FLOATING_NAV_MAX_WIDTH_PX,
  FLOATING_NAV_TOP_PX,
} from "@/lib/shiftbuilder/canvasLayout";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

export {
  BUILDER_CANVAS_MAX_WIDTH_PX,
  DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
  FLOATING_NAV_MAX_WIDTH_PX,
};

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

/** Fixed stack anchor — sits above ops status pill (bottom 10px, ~36px tall). */
export const ROTATION_HEALTH_BOTTOM_PX = 52;

/** Bottom-corner chrome — below placement dock (70) and task/placement pads (210+). */
export const OPS_PILL_Z = 45;
export const ROTATION_HEALTH_Z = OPS_PILL_Z - 1;

/** Per-day week health tracker — stacked above the rotation health cluster. */
export const WEEK_HEALTH_TRACKER_BOTTOM_PX = ROTATION_HEALTH_BOTTOM_PX + 92;

export const WEEK_HEALTH_BELOW_NAV_GAP_PX = 4;
export const WEEK_HEALTH_TRACKER_BELOW_NAV_TOP_PX =
  FLOATING_NAV_TOP_PX + FLOATING_NAV_HEIGHT_PX + WEEK_HEALTH_BELOW_NAV_GAP_PX;

/** `bar` variant shell height — keep chrome slot in sync. */
export const WEEK_HEALTH_TRACKER_BAR_HEIGHT_PX = 56;

/** Estimated in-flow chrome row height (intrinsic bar + tight vertical padding). */
export const WEEK_HEALTH_CHROME_SLOT_HEIGHT_PX = 48;

/** Breathing room between the week health bar and sheet header below. */
export const WEEK_HEALTH_BELOW_CONTENT_GAP_PX = 2;

/** Stage top inset — clears fixed FloatingNav; week health is in-flow in the chrome slot below. */
export function stageTopInsetPx(): number {
  return FLOATING_NAV_TOP_PX + FLOATING_NAV_HEIGHT_PX;
}

/** Bottom inset for LIVE ops pill clearance (footer is pinned inside the canvas column). */
export function builderStageBottomInsetPx(): number {
  return isTabletTouchDevice() ? 44 : 36;
}

/** Pinned sheet footer slot inside sb-builder-canvas (must be subtracted from fit height). */
export const BUILDER_PINNED_FOOTER_SLOT_PX = 48;

