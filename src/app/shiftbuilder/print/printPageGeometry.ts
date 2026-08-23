import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";
import { PORTRAIT_HEIGHT_PX, PORTRAIT_WIDTH_PX } from "./portraitConstants";

export type PrintSheetOrientation = "landscape" | "portrait";

export function printPageOrientation(kind: string): PrintSheetOrientation {
  return kind === "planner" ? "portrait" : "landscape";
}

export function printArtboardSizePx(kind: string): { width: number; height: number } {
  if (kind === "planner") {
    return { width: PORTRAIT_WIDTH_PX, height: PORTRAIT_HEIGHT_PX };
  }
  return { width: GOLDEN_WIDTH_PX, height: GOLDEN_HEIGHT_PX };
}
