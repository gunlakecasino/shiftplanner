import type { ReportWindow } from "./data";

export type { ReportWindow };

export type ReportsStatusFilter = "history" | "published" | "built" | "all";

export type ReportDefinitionId =
  | "weekly-placement-review"
  | "night-coverage-exceptions"
  | "tm-placement-history"
  | "area-coverage-history";

export type ReportFindingSeverity = "critical" | "warning" | "info";

export type ReportConfidenceLevel = "high" | "medium" | "low";

export type ReportSourceCount = {
  label: string;
  rows: number;
  note?: string;
};

export type ReportConfidenceFlag = {
  id: string;
  level: ReportConfidenceLevel;
  label: string;
  detail: string;
};

export type ReportFinding = {
  id: string;
  severity: ReportFindingSeverity;
  title: string;
  detail: string;
  evidence: string[];
  action: string;
  confidence: ReportConfidenceLevel;
};

export type ReportRunDefinition = {
  id: ReportDefinitionId;
  title: string;
  category: "weekly" | "night" | "team" | "area";
  description: string;
  sections: string[];
  recommended: boolean;
  estimatedPages: number;
};

export type ReportNightIntel = {
  nightDate: string;
  status: string | null;
  directZones: number;
  coveredZones: number;
  restroomAssignments: number;
  auxAssignments: number;
  overlapAssignments: number;
  assignmentCoveragePairs: number;
  coverageBannerRows: number;
  callOffs: number;
  boardChanges: number;
  repeatRisks: number;
  invalidLocks: number;
  historyConflicts: number;
  isFuture: boolean;
};

export type ReportTeamMemberIntel = {
  tmId: string;
  tmName: string;
  status: string | null;
  gravePool: string | null;
  assignedNights: number;
  zoneNights: number;
  restroomNights: number;
  auxNights: number;
  overlapNights: number;
  compositeDutyNights: number;
  uniquePhysicalAreas: number;
  zoneGaps: number;
  callOffs: number;
  boardChanges: number;
  repeatRisks: number;
  lastWorkedNight: string | null;
  topAreas: Array<{ areaKey: string; count: number; lastNight: string }>;
};

export type ReportAreaIntel = {
  areaKey: string;
  areaLabel: string;
  areaType: "zone" | "restroom" | "aux" | "overlap" | "coverage";
  directNights: number;
  coverageNights: number;
  totalExposureNights: number;
  carrierCount: number;
  coverageRatePct: number;
  repeatRisks: number;
  topTms: Array<{ tmId: string; tmName: string; count: number; lastNight: string }>;
  lastCoveredNight: string | null;
};

export type ReportPackageSnapshot = {
  id: ReportDefinitionId;
  title: string;
  sections: string[];
  summary: string;
  pageEstimate: number;
  kpis: Array<{ label: string; value: string; detail: string }>;
  rows: Array<Record<string, string | number>>;
};

export type OpsReportsSnapshot = {
  runId: string;
  generatedAt: string;
  operationalDate: string;
  rolloverLabel: string;
  dateRange: { from: string; to: string };
  window: ReportWindow;
  statusFilter: ReportsStatusFilter;
  method: {
    source: string;
    denominator: string;
    caveats: string[];
  };
  sourceCounts: ReportSourceCount[];
  confidence: ReportConfidenceFlag[];
  definitions: ReportRunDefinition[];
  packages: Record<ReportDefinitionId, ReportPackageSnapshot>;
  nights: ReportNightIntel[];
  teamMembers: ReportTeamMemberIntel[];
  areas: ReportAreaIntel[];
  findings: ReportFinding[];
  totals: {
    nights: number;
    directZoneAssignments: number;
    coveredZoneNights: number;
    assignmentCoveragePairs: number;
    coverageBannerRows: number;
    deployedTms: number;
    callOffs: number;
    boardChanges: number;
    repeatRisks: number;
    invalidLocks: number;
    historyConflicts: number;
  };
};
