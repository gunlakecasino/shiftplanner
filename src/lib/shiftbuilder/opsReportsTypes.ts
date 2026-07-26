export type ReportWindow =
  | 14
  | 30
  | 60
  | "wtd"
  | "mtd"
  | "qtd"
  | "week-ending"
  | "date-range"
  | "this-week"
  | "last-4-weeks";

export type ReportRangeMode = Extract<
  ReportWindow,
  "wtd" | "mtd" | "qtd" | "week-ending" | "date-range" | "this-week" | "last-4-weeks"
>;

export type ReportsStatusFilter = "history" | "published" | "built" | "all";

export type ReportDefinitionId =
  | "matrix-report"
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
  category: "matrix" | "weekly" | "night" | "team" | "area";
  description: string;
  sections: string[];
  recommended: boolean;
  estimatedPages: number;
};

export type MatrixReportParams = {
  window: ReportWindow;
  from?: string;
  to?: string;
  weekEnding?: string;
  includeInactive: boolean;
  tmPool: string;
};

export type MatrixReportRow = {
  tmId: string;
  tmName: string;
  pool: string | null;
  active: boolean;
  placement: string;
  prev1: string;
  prev2: string;
  prev3: string;
  prev4: string;
  prev5: string;
  lastSame: string;
  lastZone: string;
  lastRR: string;
  lastZ9: string;
  lastAdmin: string;
  lastAux: string;
};

export type MatrixReportSnapshot = {
  columns: Array<keyof Omit<MatrixReportRow, "tmId" | "pool" | "active">>;
  rows: MatrixReportRow[];
  params: MatrixReportParams;
  poolOptions: string[];
  generatedLabel: string;
  matrixAsOfDate: string | null;
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
  matrixReport: MatrixReportSnapshot;
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
