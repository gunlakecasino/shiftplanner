import "server-only";

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { ZONE_DEFS } from "./constants";
import { currentShiftDate, formatLocalDateISO, startOfShiftWeek } from "./dateUtils";
import { dbToUi } from "./slot-keys";
import type {
  OpsReportsSnapshot,
  MatrixReportParams,
  MatrixReportRow,
  ReportAreaIntel,
  ReportDefinitionId,
  ReportFinding,
  ReportPackageSnapshot,
  ReportRunDefinition,
  ReportsStatusFilter,
  ReportTeamMemberIntel,
  ReportWindow,
} from "./opsReportsTypes";

const PAGE_SIZE = 1000;
const ZONE_KEYS = ZONE_DEFS.map((z) => z.key);
const REPORT_DEFINITIONS: ReportRunDefinition[] = [
  {
    id: "matrix-report",
    title: "Matrix Report",
    category: "matrix",
    description: "Live TM matrix table with latest placement, prior trail, and last-seen zone/RR/Admin/Aux markers.",
    sections: ["Filters", "TM matrix", "Previous placements", "Last-seen markers"],
    recommended: true,
    estimatedPages: 3,
  },
  {
    id: "weekly-placement-review",
    title: "People Snapshot",
    category: "weekly",
    description: "TM-first handoff: assigned nights, recorded call-offs, board movement, repeats, and doubled RR.",
    sections: ["People list", "Recorded call-offs", "Board movement", "Rotation flags"],
    recommended: true,
    estimatedPages: 4,
  },
  {
    id: "night-coverage-exceptions",
    title: "Call-Off & Movement",
    category: "team",
    description: "Who had recorded call-offs or board changes in the selected window.",
    sections: ["People list", "Recorded call-offs", "Board changes", "Night context"],
    recommended: true,
    estimatedPages: 3,
  },
  {
    id: "tm-placement-history",
    title: "TM Placement History",
    category: "team",
    description: "Per-TM area history with doubled-restroom nights, repeat flags, call-offs, and caveats.",
    sections: ["TM summary", "Top areas", "Rotation flags"],
    recommended: true,
    estimatedPages: 5,
  },
  {
    id: "area-coverage-history",
    title: "Doubled RR Watchlist",
    category: "team",
    description: "TMs carrying composite restroom duty, with rotation flags and restroom context.",
    sections: ["People list", "Doubled RR", "Restroom nights", "Rotation notes"],
    recommended: false,
    estimatedPages: 4,
  },
];

function definition(id: ReportDefinitionId): ReportRunDefinition {
  return REPORT_DEFINITIONS.find((item) => item.id === id) ?? REPORT_DEFINITIONS[0];
}

type NightRow = {
  id: string;
  night_date: string;
  status?: string | null;
  is_locked?: boolean | null;
};

type AssignmentRow = {
  night_id: string;
  slot_key: string;
  slot_type: string | null;
  rr_side: string | null;
  tm_id: string | null;
  is_locked?: boolean | null;
  additional_coverage_slots?: string[] | null;
};

type ProfileRow = {
  tm_id: string;
  display_name?: string | null;
  full_name?: string | null;
  status?: string | null;
  active?: boolean | null;
  grave_pool?: string | null;
};

type CallOffRow = {
  night_date: string;
  tm_id: string | null;
};

type ChangeRow = {
  night_date: string;
  action: string | null;
  new_tm_id?: string | null;
  previous_tm_id?: string | null;
  payload?: Record<string, unknown> | null;
};

type OptionalIssueRow = {
  night_date?: string | null;
  night_id?: string | null;
};

type MatrixLiveRow = {
  tm_id: string;
  zone_key: string | null;
  last_placed_at?: string | null;
  count_4w?: number | null;
  count_8w?: number | null;
  count_lifetime?: number | null;
  as_of_date?: string | null;
};

type TmNightViewRow = {
  night_date: string;
  tm_id: string | null;
  tm_name?: string | null;
  slot?: string | null;
  slot_label?: string | null;
  slot_type?: string | null;
  coverage_label?: string | null;
  covered_slots?: string[] | null;
};

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message?: string } | null;
  }>;
};

function parseISODate(value: string | undefined | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date: Date, days: number): Date {
  const out = new Date(date);
  out.setDate(out.getDate() + days);
  return out;
}

function resolveWindow(
  reportWindow: ReportWindow,
  params?: Partial<MatrixReportParams>,
): { from: string; to: string } {
  const today = currentShiftDate();

  if (typeof reportWindow === "number") {
    const from = new Date(today);
    from.setDate(today.getDate() - reportWindow + 1);
    return { from: formatLocalDateISO(from), to: formatLocalDateISO(today) };
  }

  if (reportWindow === "wtd") {
    return { from: formatLocalDateISO(startOfShiftWeek(today)), to: formatLocalDateISO(today) };
  }

  if (reportWindow === "mtd") {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: formatLocalDateISO(from), to: formatLocalDateISO(today) };
  }

  if (reportWindow === "qtd") {
    const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
    const from = new Date(today.getFullYear(), quarterStartMonth, 1);
    return { from: formatLocalDateISO(from), to: formatLocalDateISO(today) };
  }

  if (reportWindow === "week-ending") {
    const weekEnding = parseISODate(params?.weekEnding) ?? today;
    return {
      from: formatLocalDateISO(addDays(weekEnding, -6)),
      to: formatLocalDateISO(weekEnding),
    };
  }

  if (reportWindow === "date-range") {
    const from = parseISODate(params?.from) ?? addDays(today, -29);
    const to = parseISODate(params?.to) ?? today;
    return from <= to
      ? { from: formatLocalDateISO(from), to: formatLocalDateISO(to) }
      : { from: formatLocalDateISO(to), to: formatLocalDateISO(from) };
  }

  const thisFri = startOfShiftWeek(today);
  if (reportWindow === "this-week") {
    const thu = new Date(thisFri);
    thu.setDate(thisFri.getDate() + 6);
    return { from: formatLocalDateISO(thisFri), to: formatLocalDateISO(thu) };
  }

  const to = new Date(thisFri);
  to.setDate(thisFri.getDate() - 1);
  const from = new Date(to);
  from.setDate(to.getDate() - 27);
  return { from: formatLocalDateISO(from), to: formatLocalDateISO(to) };
}

function statusAllowed(status: string | null | undefined, filter: ReportsStatusFilter): boolean {
  if (filter === "all") return true;
  const normalized = (status ?? "").toLowerCase();
  if (filter === "published") return normalized === "published";
  if (filter === "built") return ["built", "published", "draft", "locked"].includes(normalized);
  return ["published", "locked", "closed", "committed"].includes(normalized);
}

function tmName(profile: ProfileRow | undefined, tmId: string): string {
  return profile?.display_name || profile?.full_name || tmId;
}

function classifyUiKey(key: string, slotType?: string | null): ReportAreaIntel["areaType"] {
  if (/^Z\d+$/.test(key) || key === "Z9SR") return "zone";
  if (/^[MW]RR/.test(key) || /^RR/.test(key)) return "restroom";
  if (slotType === "overlap" || key.startsWith("OL-")) return "overlap";
  if (slotType === "coverage") return "coverage";
  return "aux";
}

function physicalAreaKey(uiKey: string): string {
  if (/^[MW]RR/.test(uiKey)) return uiKey.slice(1);
  if (uiKey === "ADMIN") return "ADM";
  return uiKey;
}

function areaLabel(key: string): string {
  if (key === "ADM") return "Admin";
  if (key === "Z9SR") return "Z9 Smoking Room";
  if (/^RR/.test(key)) return key.replace("RR1", "RR1+2");
  return key;
}

async function fetchAll<T>(
  queryFactory: () => PagedQuery<T>,
): Promise<{ data: T[]; error: string | null; truncated: boolean }> {
  const out: T[] = [];
  for (let start = 0; start < 20_000; start += PAGE_SIZE) {
    const res = await queryFactory().range(start, start + PAGE_SIZE - 1);
    if (res.error) {
      return { data: out, error: res.error.message ?? "Supabase query failed", truncated: false };
    }
    const page = (res.data ?? []) as T[];
    out.push(...page);
    if (page.length < PAGE_SIZE) return { data: out, error: null, truncated: false };
  }
  return { data: out, error: null, truncated: true };
}

function incrementMap<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function topEntries(
  map: Map<string, { count: number; lastNight: string }>,
  nameForId: (id: string) => string,
  limit = 3,
) {
  return [...map.entries()]
    .map(([tmId, value]) => ({ tmId, tmName: nameForId(tmId), ...value }))
    .sort((a, b) => b.count - a.count || b.lastNight.localeCompare(a.lastNight) || a.tmName.localeCompare(b.tmName))
    .slice(0, limit);
}

function isActiveProfile(profile: ProfileRow): boolean {
  const status = (profile.status ?? "").toLowerCase();
  return profile.active !== false && !["inactive", "terminated", "separated"].includes(status);
}

function formatReportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${month}/${day}/${year.slice(-2)}`;
}

function normalizeReportSlot(row: TmNightViewRow): string {
  const raw = row.coverage_label || row.slot_label || row.slot || "";
  return raw.replace(/\s+/g, " ").trim();
}

function slotBucket(row: TmNightViewRow): "zone" | "rr" | "z9" | "admin" | "aux" | "other" {
  const slot = `${row.slot ?? ""} ${row.slot_label ?? ""} ${row.coverage_label ?? ""}`.toUpperCase();
  const type = (row.slot_type ?? "").toLowerCase();
  if (slot.includes("Z9") && (slot.includes("SMOK") || slot.includes("SR"))) return "z9";
  if (slot.includes("ADMIN") || slot === "ADM") return "admin";
  if (type === "rr" || type === "restroom" || slot.includes("RR")) return "rr";
  if (type === "zone" || /^Z\d+\b/.test(slot) || slot.includes("ZONE")) return "zone";
  if (type === "aux" || type === "coverage") return "aux";
  return "other";
}

function trailCell(row: TmNightViewRow | undefined): string {
  if (!row) return "";
  const placement = normalizeReportSlot(row);
  return placement ? `${formatReportDate(row.night_date)} - ${placement}` : formatReportDate(row.night_date);
}

function lastCell(row: TmNightViewRow | undefined): string {
  return row ? trailCell(row) : "";
}

function buildMatrixReport(args: {
  profiles: ProfileRow[];
  matrixRows: MatrixLiveRow[];
  tmNightRows: TmNightViewRow[];
  params: MatrixReportParams;
  dateRange: { from: string; to: string };
}): OpsReportsSnapshot["matrixReport"] {
  const { profiles, matrixRows, tmNightRows, params, dateRange } = args;
  const poolOptions = [...new Set(profiles.map((p) => p.grave_pool).filter((pool): pool is string => Boolean(pool)))]
    .sort((a, b) => a.localeCompare(b));
  const profileMap = new Map(profiles.map((p) => [p.tm_id, p]));
  const rowsByTm = new Map<string, TmNightViewRow[]>();
  for (const row of tmNightRows) {
    if (!row.tm_id) continue;
    const list = rowsByTm.get(row.tm_id) ?? [];
    list.push(row);
    rowsByTm.set(row.tm_id, list);
  }
  for (const list of rowsByTm.values()) {
    list.sort((a, b) => b.night_date.localeCompare(a.night_date));
  }

  const matrixByTm = new Map<string, MatrixLiveRow[]>();
  let matrixAsOfDate: string | null = null;
  for (const row of matrixRows) {
    const list = matrixByTm.get(row.tm_id) ?? [];
    list.push(row);
    matrixByTm.set(row.tm_id, list);
    if (row.as_of_date && (!matrixAsOfDate || row.as_of_date > matrixAsOfDate)) matrixAsOfDate = row.as_of_date;
  }

  function lastMatrixZone(tmId: string, includeZ9: boolean): string {
    const match = (matrixByTm.get(tmId) ?? [])
      .filter((row) => {
        const zone = (row.zone_key ?? "").toUpperCase();
        return includeZ9 ? zone === "Z9SR" : zone && zone !== "Z9SR";
      })
      .sort((a, b) => (b.last_placed_at ?? "").localeCompare(a.last_placed_at ?? ""))[0];
    if (!match?.last_placed_at || !match.zone_key) return "";
    return `${formatReportDate(match.last_placed_at)} - ${areaLabel(match.zone_key.toUpperCase())}`;
  }

  const filteredProfiles = profiles
    .filter((profile) => params.includeInactive || isActiveProfile(profile))
    .filter((profile) => params.tmPool === "all" || profile.grave_pool === params.tmPool)
    .sort((a, b) => tmName(a, a.tm_id).localeCompare(tmName(b, b.tm_id)));

  const rows: MatrixReportRow[] = filteredProfiles.map((profile) => {
    const trail = rowsByTm.get(profile.tm_id) ?? [];
    const windowTrail = trail.filter((row) => row.night_date >= dateRange.from && row.night_date <= dateRange.to);
    const latest = windowTrail[0];
    const previous = latest
      ? trail.filter((row) => row.night_date < latest.night_date).slice(0, 5)
      : trail.slice(0, 5);
    const latestPlacement = latest ? normalizeReportSlot(latest) : "";
    const lastSame = latestPlacement
      ? trail.find((row) => row.night_date < latest!.night_date && normalizeReportSlot(row) === latestPlacement)
      : undefined;
    const lastRR = trail.find((row) => (!latest || row.night_date < latest.night_date) && slotBucket(row) === "rr");
    const lastAdmin = trail.find((row) => (!latest || row.night_date < latest.night_date) && slotBucket(row) === "admin");
    const lastAux = trail.find((row) => (!latest || row.night_date < latest.night_date) && slotBucket(row) === "aux");

    return {
      tmId: profile.tm_id,
      tmName: tmName(profileMap.get(profile.tm_id), profile.tm_id),
      pool: profile.grave_pool ?? null,
      active: isActiveProfile(profile),
      placement: latestPlacement,
      prev1: trailCell(previous[0]),
      prev2: trailCell(previous[1]),
      prev3: trailCell(previous[2]),
      prev4: trailCell(previous[3]),
      prev5: trailCell(previous[4]),
      lastSame: lastCell(lastSame),
      lastZone: lastMatrixZone(profile.tm_id, false),
      lastRR: lastCell(lastRR),
      lastZ9: lastMatrixZone(profile.tm_id, true),
      lastAdmin: lastCell(lastAdmin),
      lastAux: lastCell(lastAux),
    };
  });

  return {
    columns: ["tmName", "placement", "prev1", "prev2", "prev3", "prev4", "prev5", "lastSame", "lastZone", "lastRR", "lastZ9", "lastAdmin", "lastAux"],
    rows,
    params,
    poolOptions,
    generatedLabel: `${dateRange.from} to ${dateRange.to}`,
    matrixAsOfDate,
  };
}

function buildPackages(args: {
  nights: OpsReportsSnapshot["nights"];
  teamMembers: ReportTeamMemberIntel[];
  areas: ReportAreaIntel[];
  findings: ReportFinding[];
  totals: OpsReportsSnapshot["totals"];
  dateRange: { from: string; to: string };
  matrixReport: OpsReportsSnapshot["matrixReport"];
}): Record<ReportDefinitionId, ReportPackageSnapshot> {
  const { teamMembers, totals, dateRange, matrixReport } = args;
  const peopleWithFlags = teamMembers.filter(
    (tm) => tm.callOffs > 0 || tm.boardChanges > 0 || tm.repeatRisks > 0 || tm.compositeDutyNights > 0,
  );
  const movementPeople = teamMembers
    .filter((tm) => tm.callOffs > 0 || tm.boardChanges > 0)
    .sort((a, b) => (b.callOffs + b.boardChanges) - (a.callOffs + a.boardChanges) || a.tmName.localeCompare(b.tmName));
  const doubledRestroomPeople = teamMembers
    .filter((tm) => tm.compositeDutyNights > 0 || tm.repeatRisks > 0)
    .sort((a, b) => b.compositeDutyNights - a.compositeDutyNights || b.repeatRisks - a.repeatRisks || a.tmName.localeCompare(b.tmName));
  const commonKpis = [
    { label: "People reviewed", value: String(totals.deployedTms), detail: "Distinct TMs assigned in window" },
    { label: "Nights", value: String(totals.nights), detail: `${dateRange.from} to ${dateRange.to}` },
    { label: "Call-offs", value: String(totals.callOffs), detail: "Recorded call-off rows only" },
    { label: "People flags", value: String(peopleWithFlags.length), detail: "People with call-offs, movement, repeats, or doubled RR" },
  ];

  return {
    "matrix-report": {
      id: "matrix-report",
      title: "Matrix Report",
      sections: definition("matrix-report").sections,
      summary: `${matrixReport.rows.length} TMs listed for ${matrixReport.generatedLabel}. Columns match the Matrix Report workbook header.`,
      pageEstimate: definition("matrix-report").estimatedPages,
      kpis: [
        { label: "Rows", value: String(matrixReport.rows.length), detail: "TMs matching filters" },
        { label: "Window", value: matrixReport.generatedLabel, detail: "Operational date range" },
        { label: "Pool", value: matrixReport.params.tmPool === "all" ? "All" : matrixReport.params.tmPool, detail: "TM pool filter" },
        { label: "Roster", value: matrixReport.params.includeInactive ? "Active + inactive" : "Active", detail: "Profile filter" },
      ],
      rows: matrixReport.rows.map((row) => ({
        "TM Name": row.tmName,
        Placement: row.placement,
        "Prev. 1": row.prev1,
        "Prev. 2": row.prev2,
        "Prev. 3": row.prev3,
        "Prev. 4": row.prev4,
        "Prev. 5": row.prev5,
        "Last - Same": row.lastSame,
        "Last Zone": row.lastZone,
        "Last RR": row.lastRR,
        "Last Z9": row.lastZ9,
        "Last Admin": row.lastAdmin,
        "Last Aux": row.lastAux,
      })),
    },
    "weekly-placement-review": {
      id: "weekly-placement-review",
      title: "People Snapshot",
      sections: definition("weekly-placement-review").sections,
      summary: `${totals.deployedTms} people reviewed across ${totals.nights} nights. ${peopleWithFlags.length} people have reportable call-off, movement, repeat, or doubled-RR context.`,
      pageEstimate: definition("weekly-placement-review").estimatedPages,
      kpis: commonKpis,
      rows: teamMembers.slice(0, 60).map((tm) => ({
        TM: tm.tmName,
        Pool: tm.gravePool ?? "unknown",
        "Assigned nights": tm.assignedNights,
        "Recorded call-offs": tm.callOffs,
        "Board changes": tm.boardChanges,
        "Doubled RR": tm.compositeDutyNights,
        "Repeat flags": tm.repeatRisks,
        "Top areas": tm.topAreas.map((area) => `${areaLabel(area.areaKey)} (${area.count})`).join(", "),
      })),
    },
    "night-coverage-exceptions": {
      id: "night-coverage-exceptions",
      title: "Call-Off & Movement",
      sections: definition("night-coverage-exceptions").sections,
      summary: `${movementPeople.length} people have recorded call-off or board-change context in this window.`,
      pageEstimate: definition("night-coverage-exceptions").estimatedPages,
      kpis: commonKpis,
      rows: movementPeople
        .slice(0, 24)
        .map((tm) => ({
          TM: tm.tmName,
          Pool: tm.gravePool ?? "unknown",
          "Recorded call-offs": tm.callOffs,
          "Board changes": tm.boardChanges,
          "Assigned nights": tm.assignedNights,
          "Last worked": tm.lastWorkedNight ?? "",
        })),
    },
    "tm-placement-history": {
      id: "tm-placement-history",
      title: "TM Placement History",
      sections: definition("tm-placement-history").sections,
      summary: `${totals.deployedTms} deployed TMs. Counts are assigned-night history, not a performance ranking.`,
      pageEstimate: definition("tm-placement-history").estimatedPages,
      kpis: commonKpis,
      rows: teamMembers.slice(0, 40).map((tm) => ({
        TM: tm.tmName,
        "Assigned nights": tm.assignedNights,
        Zones: tm.zoneNights,
        Restrooms: tm.restroomNights,
        "Doubled RR nights": tm.compositeDutyNights,
        "Repeat flags": tm.repeatRisks,
        "Call-offs": tm.callOffs,
        "Board changes": tm.boardChanges,
      })),
    },
    "area-coverage-history": {
      id: "area-coverage-history",
      title: "Doubled RR Watchlist",
      sections: definition("area-coverage-history").sections,
      summary: `${doubledRestroomPeople.length} people have doubled-restroom or repeat-rotation context in this window.`,
      pageEstimate: definition("area-coverage-history").estimatedPages,
      kpis: commonKpis,
      rows: doubledRestroomPeople.slice(0, 40).map((tm) => ({
        TM: tm.tmName,
        Pool: tm.gravePool ?? "unknown",
        "Doubled RR nights": tm.compositeDutyNights,
        "Restroom nights": tm.restroomNights,
        "Repeat flags": tm.repeatRisks,
        "Assigned nights": tm.assignedNights,
        "Top areas": tm.topAreas.map((area) => `${areaLabel(area.areaKey)} (${area.count})`).join(", "),
      })),
    },
  };
}

export async function getOpsReportsSnapshot(
  reportWindow: ReportWindow,
  statusFilter: ReportsStatusFilter = "history",
  matrixParams?: Partial<MatrixReportParams>,
): Promise<OpsReportsSnapshot> {
  const client = createAdminClientSafe();
  const generatedAt = new Date().toISOString();
  const operationalDate = formatLocalDateISO(currentShiftDate());
  const { from, to } = resolveWindow(reportWindow, matrixParams);
  const params: MatrixReportParams = {
    window: reportWindow,
    from,
    to,
    weekEnding: matrixParams?.weekEnding,
    includeInactive: matrixParams?.includeInactive ?? false,
    tmPool: matrixParams?.tmPool || "all",
  };
  const emptyMatrixReport: OpsReportsSnapshot["matrixReport"] = {
    columns: ["tmName", "placement", "prev1", "prev2", "prev3", "prev4", "prev5", "lastSame", "lastZone", "lastRR", "lastZ9", "lastAdmin", "lastAux"],
    rows: [],
    params,
    poolOptions: [],
    generatedLabel: `${from} to ${to}`,
    matrixAsOfDate: null,
  };
  const emptyTotals = {
    nights: 0,
    directZoneAssignments: 0,
    coveredZoneNights: 0,
    assignmentCoveragePairs: 0,
    coverageBannerRows: 0,
    deployedTms: 0,
    callOffs: 0,
    boardChanges: 0,
    repeatRisks: 0,
    invalidLocks: 0,
    historyConflicts: 0,
  };

  if (!client) {
    const snapshot: OpsReportsSnapshot = {
      runId: `report-${Date.now()}`,
      generatedAt,
      operationalDate,
      rolloverLabel: "America/Detroit, 8:30 AM rollover",
      dateRange: { from, to },
      window: reportWindow,
      statusFilter,
      method: {
        source: "Supabase admin client unavailable",
        denominator: "No live data loaded",
        caveats: ["SUPABASE_SERVICE_ROLE_KEY is required for reports."],
      },
      sourceCounts: [],
      confidence: [
        {
          id: "missing-admin-client",
          level: "low",
          label: "No data connection",
          detail: "The server report route could not create a Supabase service client.",
        },
      ],
      definitions: REPORT_DEFINITIONS,
      packages: buildPackages({ nights: [], teamMembers: [], areas: [], findings: [], totals: emptyTotals, dateRange: { from, to }, matrixReport: emptyMatrixReport }),
      matrixReport: emptyMatrixReport,
      nights: [],
      teamMembers: [],
      areas: [],
      findings: [],
      totals: emptyTotals,
    };
    return snapshot;
  }

  const nightRes = await fetchAll<NightRow>(() =>
    client
      .from("nights")
      .select("id, night_date, status, is_locked")
      .gte("night_date", from)
      .lte("night_date", to)
      .neq("night_date", "1900-01-01")
      .order("night_date", { ascending: true }),
  );
  const allNights = nightRes.data.filter((n) => statusAllowed(n.status, statusFilter));
  const nightIds = allNights.map((n) => n.id);
  const nightIdToDate = new Map(allNights.map((n) => [n.id, n.night_date]));
  const nightDateSet = new Set(allNights.map((n) => n.night_date));
  const historyFrom = formatLocalDateISO(addDays(parseISODate(from) ?? currentShiftDate(), -180));

  const [
    assignmentRes,
    callOffRes,
    changeRes,
    profileRes,
    matrixRes,
    tmNightRes,
    invalidLockRes,
    conflictRes,
  ] = await Promise.all([
    nightIds.length
      ? fetchAll<AssignmentRow>(() =>
          client
            .from("zone_assignments")
            .select("night_id, slot_key, slot_type, rr_side, tm_id, is_locked, additional_coverage_slots")
            .in("night_id", nightIds)
            .not("tm_id", "is", null),
        )
      : Promise.resolve({ data: [], error: null, truncated: false }),
    fetchAll<CallOffRow>(() =>
      client
        .from("call_offs")
        .select("night_date, tm_id")
        .gte("night_date", from)
        .lte("night_date", to),
    ),
    fetchAll<ChangeRow>(() =>
      client
        .from("today_assignment_changes")
        .select("night_date, action, new_tm_id, previous_tm_id, payload")
        .gte("night_date", from)
        .lte("night_date", to),
    ),
    fetchAll<ProfileRow>(() =>
      client
        .from("tm_profiles")
        .select("tm_id, display_name, full_name, status, active, grave_pool"),
    ),
    fetchAll<MatrixLiveRow>(() =>
      client
        .from("v_tm_zone_matrix_live")
        .select("tm_id, zone_key, last_placed_at, count_4w, count_8w, count_lifetime, as_of_date"),
    ),
    fetchAll<TmNightViewRow>(() =>
      client
        .from("v_tm_night")
        .select("night_date, tm_id, tm_name, slot, slot_label, slot_type, coverage_label, covered_slots")
        .gte("night_date", historyFrom)
        .lte("night_date", to)
        .order("night_date", { ascending: false }),
    ),
    fetchAll<OptionalIssueRow>(() =>
      client
        .from("v_invalid_locked_assignments")
        .select("*")
        .gte("night_date", from)
        .lte("night_date", to),
    ),
    fetchAll<OptionalIssueRow>(() =>
      client
        .from("v_placement_history_conflicts")
        .select("*")
        .gte("night_date", from)
        .lte("night_date", to),
    ),
  ]);

  const profiles = new Map(profileRes.data.map((p) => [p.tm_id, p]));
  const matrixReport = buildMatrixReport({
    profiles: profileRes.data,
    matrixRows: matrixRes.error ? [] : matrixRes.data,
    tmNightRows: tmNightRes.error ? [] : tmNightRes.data,
    params,
    dateRange: { from, to },
  });

  const callOffsByNight = new Map<string, number>();
  const callOffsByTm = new Map<string, number>();
  for (const row of callOffRes.data) {
    if (!nightDateSet.has(row.night_date)) continue;
    incrementMap(callOffsByNight, row.night_date);
    if (row.tm_id) incrementMap(callOffsByTm, row.tm_id);
  }

  const changesByNight = new Map<string, number>();
  const changesByTm = new Map<string, number>();
  for (const row of changeRes.data) {
    if (!nightDateSet.has(row.night_date)) continue;
    incrementMap(changesByNight, row.night_date);
    const candidates = [row.new_tm_id, row.previous_tm_id];
    const payloadTm = row.payload?.tmId;
    if (typeof payloadTm === "string") candidates.push(payloadTm);
    for (const tmId of candidates) {
      if (tmId) incrementMap(changesByTm, tmId);
    }
  }

  const issueDate = (row: OptionalIssueRow): string | null =>
    row.night_date ?? (row.night_id ? nightIdToDate.get(row.night_id) ?? null : null);
  const invalidLocksByNight = new Map<string, number>();
  for (const row of invalidLockRes.error ? [] : invalidLockRes.data) {
    const date = issueDate(row);
    if (date && nightDateSet.has(date)) incrementMap(invalidLocksByNight, date);
  }
  const conflictsByNight = new Map<string, number>();
  for (const row of conflictRes.error ? [] : conflictRes.data) {
    const date = issueDate(row);
    if (date && nightDateSet.has(date)) incrementMap(conflictsByNight, date);
  }

  const nightBuilders = new Map(
    allNights.map((n) => [
      n.night_date,
      {
        status: n.status ?? null,
        directZones: new Set<string>(),
        coveredZones: new Set<string>(),
        restroomAssignments: 0,
        auxAssignments: 0,
        overlapAssignments: 0,
        assignmentCoveragePairs: 0,
        repeatRisks: 0,
      },
    ]),
  );
  const tmBuilders = new Map<
    string,
    {
      assignedNights: Set<string>;
      zoneNights: Set<string>;
      restroomNights: Set<string>;
      auxNights: Set<string>;
      overlapNights: Set<string>;
      compositeDutyNights: Set<string>;
      physicalAreas: Set<string>;
      areaCounts: Map<string, { count: number; lastNight: string }>;
      repeatRisks: number;
      lastWorkedNight: string | null;
    }
  >();
  const areaBuilders = new Map<
    string,
    {
      areaType: ReportAreaIntel["areaType"];
      directNights: Set<string>;
      coverageNights: Set<string>;
      carriers: Map<string, { count: number; lastNight: string }>;
      repeatRisks: number;
      lastCoveredNight: string | null;
    }
  >();
  const tmWorkedTrail = new Map<string, Array<{ night: string; areas: Set<string> }>>();

  const sortedAssignments = assignmentRes.data
    .filter((row) => row.tm_id && nightIdToDate.has(row.night_id))
    .sort((a, b) => (nightIdToDate.get(a.night_id) ?? "").localeCompare(nightIdToDate.get(b.night_id) ?? ""));

  function ensureTm(tmId: string) {
    if (!tmBuilders.has(tmId)) {
      tmBuilders.set(tmId, {
        assignedNights: new Set(),
        zoneNights: new Set(),
        restroomNights: new Set(),
        auxNights: new Set(),
        overlapNights: new Set(),
        compositeDutyNights: new Set(),
        physicalAreas: new Set(),
        areaCounts: new Map(),
        repeatRisks: 0,
        lastWorkedNight: null,
      });
    }
    return tmBuilders.get(tmId)!;
  }

  function ensureArea(areaKey: string, areaType: ReportAreaIntel["areaType"]) {
    if (!areaBuilders.has(areaKey)) {
      areaBuilders.set(areaKey, {
        areaType,
        directNights: new Set(),
        coverageNights: new Set(),
        carriers: new Map(),
        repeatRisks: 0,
        lastCoveredNight: null,
      });
    }
    return areaBuilders.get(areaKey)!;
  }

  for (const row of sortedAssignments) {
    const tmId = row.tm_id!;
    const nightDate = nightIdToDate.get(row.night_id)!;
    const slotType = row.slot_type ?? "zone";
    const uiKey = dbToUi(row.slot_key, slotType, row.rr_side ?? null);
    if (uiKey.startsWith("UNK:")) continue;

    const primaryArea = physicalAreaKey(uiKey);
    const coveredAreas = [primaryArea, ...(row.additional_coverage_slots ?? []).map(physicalAreaKey)];
    const uniqueAreas = new Set(coveredAreas);
    const prior = tmWorkedTrail.get(tmId)?.slice(-3) ?? [];
    const repeatedAreas = [...uniqueAreas].filter((area) => prior.some((p) => p.areas.has(area)));
    const repeatRiskCount = repeatedAreas.filter((area) => area !== "ADM" && !area.startsWith("OL-")).length;

    const tm = ensureTm(tmId);
    tm.assignedNights.add(nightDate);
    tm.physicalAreas.add(primaryArea);
    if (!tm.lastWorkedNight || nightDate > tm.lastWorkedNight) tm.lastWorkedNight = nightDate;
    const tmArea = tm.areaCounts.get(primaryArea) ?? { count: 0, lastNight: nightDate };
    tmArea.count += 1;
    tmArea.lastNight = nightDate > tmArea.lastNight ? nightDate : tmArea.lastNight;
    tm.areaCounts.set(primaryArea, tmArea);
    if (repeatRiskCount) tm.repeatRisks += repeatRiskCount;

    const night = nightBuilders.get(nightDate);
    if (!night) continue;
    night.repeatRisks += repeatRiskCount;

    if (/^Z\d+$/.test(uiKey)) {
      night.directZones.add(uiKey);
      night.coveredZones.add(uiKey);
      tm.zoneNights.add(nightDate);
    } else if (slotType === "rr") {
      night.restroomAssignments++;
      tm.restroomNights.add(nightDate);
    } else if (slotType === "overlap") {
      night.overlapAssignments++;
      tm.overlapNights.add(nightDate);
    } else {
      night.auxAssignments++;
      tm.auxNights.add(nightDate);
    }
    if ((row.additional_coverage_slots ?? []).length > 0) {
      night.assignmentCoveragePairs += row.additional_coverage_slots?.length ?? 0;
      tm.compositeDutyNights.add(nightDate);
    }

    const area = ensureArea(primaryArea, classifyUiKey(uiKey, slotType));
    area.directNights.add(nightDate);
    const carrier = area.carriers.get(tmId) ?? { count: 0, lastNight: nightDate };
    carrier.count += 1;
    carrier.lastNight = nightDate > carrier.lastNight ? nightDate : carrier.lastNight;
    area.carriers.set(tmId, carrier);
    if (repeatRiskCount) area.repeatRisks += repeatedAreas.includes(primaryArea) ? 1 : 0;
    area.lastCoveredNight = !area.lastCoveredNight || nightDate > area.lastCoveredNight ? nightDate : area.lastCoveredNight;

    for (const coveredUiKey of row.additional_coverage_slots ?? []) {
      const coveredAreaKey = physicalAreaKey(coveredUiKey);
      night.coveredZones.add(coveredUiKey);
      tm.physicalAreas.add(coveredAreaKey);
      const coveredArea = ensureArea(coveredAreaKey, classifyUiKey(coveredUiKey, "coverage"));
      coveredArea.coverageNights.add(nightDate);
      const coveredCarrier = coveredArea.carriers.get(tmId) ?? { count: 0, lastNight: nightDate };
      coveredCarrier.count += 1;
      coveredCarrier.lastNight = nightDate > coveredCarrier.lastNight ? nightDate : coveredCarrier.lastNight;
      coveredArea.carriers.set(tmId, coveredCarrier);
      coveredArea.lastCoveredNight =
        !coveredArea.lastCoveredNight || nightDate > coveredArea.lastCoveredNight ? nightDate : coveredArea.lastCoveredNight;
    }

    const trail = tmWorkedTrail.get(tmId) ?? [];
    const last = trail[trail.length - 1];
    if (last?.night === nightDate) {
      for (const areaKey of uniqueAreas) last.areas.add(areaKey);
    } else {
      trail.push({ night: nightDate, areas: uniqueAreas });
    }
    tmWorkedTrail.set(tmId, trail);
  }

  const nights = allNights.map((n) => {
    const builder = nightBuilders.get(n.night_date)!;
    return {
      nightDate: n.night_date,
      status: builder.status,
      directZones: builder.directZones.size,
      coveredZones: builder.coveredZones.size,
      restroomAssignments: builder.restroomAssignments,
      auxAssignments: builder.auxAssignments,
      overlapAssignments: builder.overlapAssignments,
      assignmentCoveragePairs: builder.assignmentCoveragePairs,
      coverageBannerRows: 0,
      callOffs: callOffsByNight.get(n.night_date) ?? 0,
      boardChanges: changesByNight.get(n.night_date) ?? 0,
      repeatRisks: builder.repeatRisks,
      invalidLocks: invalidLocksByNight.get(n.night_date) ?? 0,
      historyConflicts: conflictsByNight.get(n.night_date) ?? 0,
      isFuture: n.night_date > operationalDate,
    };
  });

  const teamMembers = [...tmBuilders.entries()]
    .map(([tmId, b]): ReportTeamMemberIntel => ({
      tmId,
      tmName: tmName(profiles.get(tmId), tmId),
      status: profiles.get(tmId)?.status ?? null,
      gravePool: profiles.get(tmId)?.grave_pool ?? null,
      assignedNights: b.assignedNights.size,
      zoneNights: b.zoneNights.size,
      restroomNights: b.restroomNights.size,
      auxNights: b.auxNights.size,
      overlapNights: b.overlapNights.size,
      compositeDutyNights: b.compositeDutyNights.size,
      uniquePhysicalAreas: b.physicalAreas.size,
      zoneGaps: ZONE_KEYS.length - [...b.physicalAreas].filter((area) => ZONE_KEYS.includes(area)).length,
      callOffs: callOffsByTm.get(tmId) ?? 0,
      boardChanges: changesByTm.get(tmId) ?? 0,
      repeatRisks: b.repeatRisks,
      lastWorkedNight: b.lastWorkedNight,
      topAreas: [...b.areaCounts.entries()]
        .map(([areaKey, value]) => ({ areaKey, count: value.count, lastNight: value.lastNight }))
        .sort((a, b) => b.count - a.count || b.lastNight.localeCompare(a.lastNight))
        .slice(0, 4),
    }))
    .sort((a, b) => b.assignedNights - a.assignedNights || b.repeatRisks - a.repeatRisks || a.tmName.localeCompare(b.tmName));

  const areas = [...areaBuilders.entries()]
    .map(([areaKey, b]): ReportAreaIntel => {
      const totalExposureNights = new Set([...b.directNights, ...b.coverageNights]).size;
      return {
        areaKey,
        areaLabel: areaLabel(areaKey),
        areaType: b.areaType,
        directNights: b.directNights.size,
        coverageNights: b.coverageNights.size,
        totalExposureNights,
        carrierCount: b.carriers.size,
        coverageRatePct: nights.length ? Math.round((totalExposureNights / nights.length) * 100) : 0,
        repeatRisks: b.repeatRisks,
        topTms: topEntries(b.carriers, (id) => tmName(profiles.get(id), id)),
        lastCoveredNight: b.lastCoveredNight,
      };
    })
    .sort((a, b) => {
      const zoneDelta = Number(b.areaType === "zone") - Number(a.areaType === "zone");
      return zoneDelta || b.totalExposureNights - a.totalExposureNights || a.areaLabel.localeCompare(b.areaLabel);
    });

  const totals = {
    nights: nights.length,
    directZoneAssignments: nights.reduce((sum, n) => sum + n.directZones, 0),
    coveredZoneNights: nights.reduce((sum, n) => sum + n.coveredZones, 0),
    assignmentCoveragePairs: nights.reduce((sum, n) => sum + n.assignmentCoveragePairs, 0),
    coverageBannerRows: nights.reduce((sum, n) => sum + n.coverageBannerRows, 0),
    deployedTms: teamMembers.length,
    callOffs: nights.reduce((sum, n) => sum + n.callOffs, 0),
    boardChanges: nights.reduce((sum, n) => sum + n.boardChanges, 0),
    repeatRisks: nights.reduce((sum, n) => sum + n.repeatRisks, 0),
    invalidLocks: nights.reduce((sum, n) => sum + n.invalidLocks, 0),
    historyConflicts: nights.reduce((sum, n) => sum + n.historyConflicts, 0),
  };

  const findings: ReportFinding[] = [];
  if (totals.repeatRisks) {
    findings.push({
      id: "repeat-risk-window",
      severity: "info",
      title: `${totals.repeatRisks} same-area repeat flags found inside the loaded window`,
      detail: "This compares physical area exposure against the prior three worked nights available in this report run. Admin and overlap continuity are excluded.",
      evidence: teamMembers.filter((tm) => tm.repeatRisks > 0).slice(0, 5).map((tm) => `${tm.tmName}: ${tm.repeatRisks} repeat flags`),
      action: "Use as a rotation check queue, not as proof of a solver violation without eligibility and rescue provenance.",
      confidence: "medium",
    });
  }
  if (totals.invalidLocks || totals.historyConflicts) {
    findings.push({
      id: "integrity-review",
      severity: "critical",
      title: "Placement integrity views returned flags",
      detail: "Invalid locks and history conflicts can distort reporting and rotation analysis.",
      evidence: [`Invalid locks: ${totals.invalidLocks}`, `History conflicts: ${totals.historyConflicts}`],
      action: "Have a sudo operator audit these before treating the report as final.",
      confidence: "high",
    });
  }
  const heavyComposite = teamMembers.filter((tm) => tm.compositeDutyNights >= 2).slice(0, 5);
  if (heavyComposite.length) {
    findings.push({
      id: "composite-duty-burden",
      severity: "info",
      title: `${heavyComposite.length} TMs have repeated doubled-restroom nights`,
      detail: "Doubled restroom duty is tracked separately because it covers more physical restroom areas than a single-restroom assignment.",
      evidence: heavyComposite.map((tm) => `${tm.tmName}: ${tm.compositeDutyNights} doubled-restroom nights`),
      action: "Check eligibility and staffing levels before rebalancing; short-staffed restroom nights may justify the pattern.",
      confidence: "medium",
    });
  }

  const confidence = [
    {
      id: "assignment-pagination",
      level: assignmentRes.truncated || nightRes.truncated ? "low" as const : "high" as const,
      label: assignmentRes.truncated || nightRes.truncated ? "Pagination limit reached" : "Pagination complete",
      detail: assignmentRes.truncated || nightRes.truncated
        ? "At least one source exceeded the 20,000-row safety limit."
        : "The server paged report sources in 1,000-row batches until exhausted.",
    },
    {
      id: "opportunity-denominator",
      level: "medium" as const,
      label: "Opportunity denominator limited",
      detail: "This v1 compares assigned worked nights. Scheduled/eligible opportunities are identified as a required next data layer before fairness ranking.",
    },
    {
      id: "issue-views",
      level: invalidLockRes.error || conflictRes.error ? "low" as const : "high" as const,
      label: invalidLockRes.error || conflictRes.error ? "Integrity views unavailable" : "Integrity views loaded",
      detail: invalidLockRes.error || conflictRes.error
        ? [invalidLockRes.error, conflictRes.error].filter(Boolean).join(" | ")
        : "Invalid lock and placement history conflict views were queried.",
    },
    {
      id: "matrix-live-source",
      level: matrixRes.error || tmNightRes.error ? "low" as const : "high" as const,
      label: matrixRes.error || tmNightRes.error ? "Matrix source limited" : "Live matrix loaded",
      detail: matrixRes.error || tmNightRes.error
        ? [matrixRes.error, tmNightRes.error].filter(Boolean).join(" | ")
        : "v_tm_zone_matrix_live and v_tm_night were queried for the Matrix Report.",
    },
  ];

  return {
    runId: `report-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    generatedAt,
    operationalDate,
    rolloverLabel: "America/Detroit, 8:30 AM rollover",
    dateRange: { from, to },
    window: reportWindow,
    statusFilter,
    method: {
      source: "nights, zone_assignments, call_offs, today_assignment_changes, tm_profiles, integrity views",
      denominator: "Distinct loaded nights and distinct assigned TM/night rows. Fairness opportunity denominators are disclosed as limited.",
      caveats: [
        "People totals are assignment history context, not a performance ranking.",
        "Doubled restroom duty is one assignment carrying multiple physical areas, not double-booking.",
        "Call-offs are recorded events and are not treated as attendance or performance rates.",
      ],
    },
    sourceCounts: [
      { label: "Nights", rows: nightRes.data.length, note: `${allNights.length} after status filter` },
      { label: "Assignments", rows: assignmentRes.data.length },
      { label: "Call-offs", rows: callOffRes.data.length },
      { label: "Board changes", rows: changeRes.data.length },
      { label: "Profiles", rows: profileRes.data.length },
      { label: "Live matrix rows", rows: matrixRes.data.length },
      { label: "TM night trail", rows: tmNightRes.data.length, note: `${historyFrom} to ${to}` },
    ],
    confidence,
    definitions: REPORT_DEFINITIONS,
    packages: buildPackages({ nights, teamMembers, areas, findings, totals, dateRange: { from, to }, matrixReport }),
    matrixReport,
    nights,
    teamMembers,
    areas,
    findings,
    totals,
  };
}
