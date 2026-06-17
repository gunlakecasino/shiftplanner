import type { PlacementPadProps } from "../PlacementPad";

export type PlacementDockTab = "assign" | "tasks" | "intel";

/** Props for the tablet inspector — same surface as PlacementPad minus flyout positioning. */
export type PlacementDockProps = Omit<
  PlacementPadProps,
  "presentation" | "anchor" | "hostId" | "dockTab" | "onDockTabChange"
>;