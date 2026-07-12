/**
 * Pure rotation / placement-fit helpers (no React).
 * Formerly lived under `@/app/shiftbuilder/components/*` and were imported by lib —
 * that inverted dependency direction (lib → UI). Canonical home is here.
 */
export * from "./placementPadHelpers";
export * from "./placementFitScore";
export * from "./placementFitForSlot";
export * from "./placementFitPrerender";
export * from "./shiftRotationHealth";
export * from "./overlapTaskApply";
// overlapTaskFairness: import from "@/lib/shiftbuilder/rotation/overlapTaskFairness"
// (duplicate OverlapBand / mulberry32 names vs overlapTaskApply)
export * from "./buildOverlapTaskInsight";
