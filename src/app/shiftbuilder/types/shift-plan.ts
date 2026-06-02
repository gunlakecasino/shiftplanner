/**
 * ShiftAssignment type for planner / dev previews.
 * Re-exported / used by dev scaffolding and planner components.
 * Mirrors the shape used in ShiftBuilder store assignments + preview data.
 */
export type ShiftAssignment = {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap" | string;
  tmName?: string | null;
  tmId?: string;
  source?: string;
  isLocked?: boolean;
  provenance?: {
    rationale?: string;
    confidence?: number;
    fairnessSignals?: Record<string, number>;
  };
  rrSide?: "mens" | "womens" | null;
  [key: string]: any; // allow flexibility for previews
};
