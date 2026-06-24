import type { ReportWindow } from "./data";

export type { ReportWindow };

/** Per-grave-night zone fill snapshot (Z1–Z10). */
export type NightZoneFill = {
  nightDate: string;
  zonesFilled: number;
  /** UI zone key → tm_id when filled */
  zoneAssignments: Record<string, string>;
  rrAssignments: number;
  auxAssignments: number;
  overlapAssignments: number;
};

/** TM rotation row — zones are primary; other areas tracked separately. */
export type TmRotationEntry = {
  tmId: string;
  tmName: string;
  /** Z1–Z10 only */
  zoneCounts: Record<string, number>;
  zoneDates: Record<string, string[]>;
  zoneDow: Record<string, number[]>;
  rrCount: number;
  auxCount: number;
  overlapCount: number;
  /** Distinct grave nights with any zone (Z1–Z10) assignment */
  zoneNights: number;
  /** Distinct grave nights with any deployment assignment */
  totalNights: number;
  /** How many of Z1–Z10 this TM worked in the window */
  uniqueZones: number;
  /** Z1–Z10 slots never worked in window */
  zoneGaps: number;
  /** Most recent zone assignment date */
  lastZoneDate: string;
  lastDate: string;
  totalZonePlacements: number;
  totalOtherPlacements: number;
};

export type ZoneFillSummary = {
  avgZonesFilled: number;
  fullFillNights: number;
  fullFillPct: number;
  /** Per-zone % of nights that slot was filled (0–100) */
  perZoneFillRate: Record<string, number>;
  /** Nights where fewer than 10 zones were filled */
  underfillNights: number;
};

export type AreaCoverageSummary = {
  zonePlacements: number;
  rrPlacements: number;
  auxPlacements: number;
  overlapPlacements: number;
  /** % of all placement rows that were zones vs other areas */
  zoneSharePct: number;
  otherAreaSharePct: number;
};

export type RotationReport = {
  entries: TmRotationEntry[];
  nightFills: NightZoneFill[];
  dateRange: { from: string; to: string };
  totalNights: number;
  zoneFill: ZoneFillSummary;
  areaCoverage: AreaCoverageSummary;
};