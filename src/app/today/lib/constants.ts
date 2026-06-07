import type { StageInsets } from "@/app/shiftbuilder/hooks/useZoom";

/** Matches FloatingNav h-14 + top-2 offset. */
export const TODAY_NAV_HEIGHT = 56;
export const TODAY_NAV_TOP_OFFSET = 8;
export const TODAY_NAV_CLEARANCE = TODAY_NAV_TOP_OFFSET + TODAY_NAV_HEIGHT + 8;

/** @deprecated use TODAY_NAV_CLEARANCE */
export const TODAY_HEADER_HEIGHT = TODAY_NAV_HEIGHT;

/** Stage padding around the scaled 1056×816 artboard. */
export const TODAY_STAGE_INSETS: StageInsets = {
  top: TODAY_NAV_CLEARANCE,
  right: 12,
  bottom: 12,
  left: 12,
};