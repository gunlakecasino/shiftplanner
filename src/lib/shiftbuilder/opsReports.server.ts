import "server-only";

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { ZONE_DEFS } from "./constants";
import { currentShiftDate, formatLocalDateISO, startOfShiftWeek } from "./dateUtils";
import { dbToUi } from "./slot-keys";
import type {
  OpsReportsSnapshot,
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
    id: "weekly-placement-review",
    title: "Weekly Placement Review",
    category: "weekly",
    description: "Night-by-night coverage, rotation pressure, exceptions, and source confidence.",
    sections: ["Executive summary", "Night coverage", "Rotation pressure", "Exceptions"],
    recommended: true,
    estimatedPages: 4,
  },
  {
    id: "night-coverage-exceptions",
    title: "Night Coverage & Exceptions",
    category: "night",
    description: "Coverage gaps, fallback coverage, call-offs, board changes, invalid locks, and banner drift.",
    sections: ["Coverage table", "Exception log", "Method notes"],
    recommended: true,
    estimatedPages: 3,
  },
  {
    id: "tm-placement-history",
    title: "TM Placement History",
    category: "team",
    description: "Per-TM area history with composite-duty burden, repeats, call-offs, and caveats.",
    sections: ["TM summary", "Top areas", "Rotation cautions"],
    recommended: true,
    estimatedPages: 5,
  },
  {
    id: "area-coverage-history",
    title: "Area Coverage History",
    category: "area",
    description: "Direct and fallback area coverage, frequent carriers, and exposure concentration.",
    sections: ["Area coverage", "Top carriers", "Confidence flags"],
    recommended: false,
    estimatedPages: 4,
  },
];

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

type TaskRow = {
  night_id: string;
  is_coverage?: boolean | null;
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

type PagedQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message?: string } | null;
  }>;
};

function resolveWindow(reportWindow: ReportWindow): { from: string; to: string } {
  const today = currentShiftDate();

  if (typeof reportWindow === "number") {
    const from = new Date(today);
    from.setDate(today.getDate() - reportWindow + 1);
    return { from: formatLocalDateISO(from), to: formatLocalDateISO(today) };
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

function buildPackages(args: {
  nights: OpsReportsSnapshot["nights"];
  teamMembers: ReportTeamMemberIntel[];
  areas: ReportAreaIntel[];
  findings: ReportFinding[];
  totals: OpsReportsSnapshot["totals"];
  dateRange: { from: string; to: string };
}): Record<ReportDefinitionId, ReportPackageSnapshot> {
  const { nights, teamMembers, areas, findings, totals, dateRange } = args;
  const commonKpis = [
    { label: "Nights", value: String(totals.nights), detail: `${dateRange.from} to ${dateRange.to}` },
    { label: "Covered zone-nights", value: String(totals.coveredZoneNights), detail: "Direct zone rows plus assignment-carried coverage" },
    { label: "Repeat risks", value: String(totals.repeatRisks), detail: "Same physical area inside prior three worked nights" },
    { label: "Call-offs", value: String(totals.callOffs), detail: "Recorded call-off rows only" },
  ];

  return {
    "weekly-placement-review": {
      id: "weekly-placement-review",
      title: "Weekly Placement Review",
      sections: REPORT_DEFINITIONS[0].sections,
      summary: `${totals.nights} nights reviewed with ${totals.coveredZoneNights} covered zone-nights and ${findings.length} deterministic findings.`,
      pageEstimate: REPORT_DEFINITIONS[0].estimatedPages,
      kpis: commonKpis,
      rows: nights.slice(0, 14).map((n) => ({
        Night: n.nightDate,
        Status: n.status ?? "unknown",
        "Zones covered": n.coveredZones,
        "Call-offs": n.callOffs,
        "Board changes": n.boardChanges,
        "Repeat risks": n.repeatRisks,
      })),
    },
    "night-coverage-exceptions": {
      id: "night-coverage-exceptions",
      title: "Night Coverage & Exceptions",
      sections: REPORT_DEFINITIONS[1].sections,
      summary: `${nights.filter((n) => n.coveredZones < 10 || n.assignmentCoveragePairs !== n.coverageBannerRows || n.invalidLocks || n.historyConflicts).length} nights have coverage or integrity exceptions.`,
      pageEstimate: REPORT_DEFINITIONS[1].estimatedPages,
      kpis: commonKpis,
      rows: nights
        .filter((n) => n.coveredZones < 10 || n.assignmentCoveragePairs !== n.coverageBannerRows || n.invalidLocks || n.historyConflicts)
        .slice(0, 24)
        .map((n) => ({
          Night: n.nightDate,
          "Zones covered": n.coveredZones,
          "Coverage pairs": n.assignmentCoveragePairs,
          "Banner rows": n.coverageBannerRows,
          "Invalid locks": n.invalidLocks,
          "History conflicts": n.historyConflicts,
        })),
    },
    "tm-placement-history": {
      id: "tm-placement-history",
      title: "TM Placement History",
      sections: REPORT_DEFINITIONS[2].sections,
      summary: `${totals.deployedTms} deployed TMs. Counts are assigned-night history, not a performance ranking.`,
      pageEstimate: REPORT_DEFINITIONS[2].estimatedPages,
      kpis: commonKpis,
      rows: teamMembers.slice(0, 40).map((tm) => ({
        TM: tm.tmName,
        "Assigned nights": tm.assignedNights,
        Zones: tm.zoneNights,
        Restrooms: tm.restroomNights,
        "Composite nights": tm.compositeDutyNights,
        "Repeat risks": tm.repeatRisks,
      })),
    },
    "area-coverage-history": {
      id: "area-coverage-history",
      title: "Area Coverage History",
      sections: REPORT_DEFINITIONS[3].sections,
      summary: `${areas.length} physical areas observed across the loaded deployment rows.`,
      pageEstimate: REPORT_DEFINITIONS[3].estimatedPages,
      kpis: commonKpis,
      rows: areas.slice(0, 40).map((area) => ({
        Area: area.areaLabel,
        Type: area.areaType,
        "Direct nights": area.directNights,
        "Coverage nights": area.coverageNights,
        "Coverage rate": `${area.coverageRatePct}%`,
        Carriers: area.carrierCount,
      })),
    },
  };
}

export async function getOpsReportsSnapshot(
  reportWindow: ReportWindow,
  statusFilter: ReportsStatusFilter = "history",
): Promise<OpsReportsSnapshot> {
  const client = createAdminClientSafe();
  const generatedAt = new Date().toISOString();
  const operationalDate = formatLocalDateISO(currentShiftDate());
  const { from, to } = resolveWindow(reportWindow);
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
      packages: buildPackages({ nights: [], teamMembers: [], areas: [], findings: [], totals: emptyTotals, dateRange: { from, to } }),
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

  const [
    assignmentRes,
    taskRes,
    callOffRes,
    changeRes,
    profileRes,
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
    nightIds.length
      ? fetchAll<TaskRow>(() =>
          client
            .from("night_slot_tasks")
            .select("night_id, is_coverage")
            .in("night_id", nightIds)
            .eq("is_coverage", true),
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
  const coverageBannerByNight = new Map<string, number>();
  for (const row of taskRes.data) incrementMap(coverageBannerByNight, row.night_id);

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
      coverageBannerRows: coverageBannerByNight.get(n.id) ?? 0,
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
  const underfilled = nights.filter((n) => n.coveredZones < 10 && !n.isFuture);
  if (underfilled.length) {
    findings.push({
      id: "covered-zone-shortfall",
      severity: "warning",
      title: `${underfilled.length} historical nights show fewer than 10 covered zones`,
      detail: "Covered zones count direct Z1-Z10 rows plus assignment-carried fallback coverage. This is coverage visibility, not staffing misconduct.",
      evidence: underfilled.slice(0, 5).map((n) => `${n.nightDate}: ${n.coveredZones}/10 covered zones`),
      action: "Review the affected nights in Builder before using this as a final operating summary.",
      confidence: "medium",
    });
  }
  const bannerDrift = nights.filter((n) => n.assignmentCoveragePairs !== n.coverageBannerRows);
  if (bannerDrift.length) {
    findings.push({
      id: "coverage-banner-drift",
      severity: "warning",
      title: `${bannerDrift.length} nights have assignment coverage that does not match banner rows`,
      detail: "Operational coverage and printable banner projection are separate paths. Counts must match before printed reports imply banner correctness.",
      evidence: bannerDrift.slice(0, 5).map((n) => `${n.nightDate}: ${n.assignmentCoveragePairs} assignment pairs, ${n.coverageBannerRows} banner rows`),
      action: "Validate those nights through the print preview projection before operational distribution.",
      confidence: "high",
    });
  }
  if (totals.repeatRisks) {
    findings.push({
      id: "repeat-risk-window",
      severity: "info",
      title: `${totals.repeatRisks} same-area repeat risks found inside the loaded window`,
      detail: "This compares physical area exposure against the prior three worked nights available in this report run. Admin and overlap continuity are excluded from the risk count.",
      evidence: teamMembers.filter((tm) => tm.repeatRisks > 0).slice(0, 5).map((tm) => `${tm.tmName}: ${tm.repeatRisks} risks`),
      action: "Use as a review queue, not as proof of a solver violation without eligibility and rescue provenance.",
      confidence: "medium",
    });
  }
  if (totals.invalidLocks || totals.historyConflicts) {
    findings.push({
      id: "integrity-review",
      severity: "critical",
      title: "Placement integrity views report review items",
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
      title: `${heavyComposite.length} TMs carry repeated composite-duty burden`,
      detail: "Composite restroom duty is tracked separately because it is a heavier assignment than a single area.",
      evidence: heavyComposite.map((tm) => `${tm.tmName}: ${tm.compositeDutyNights} composite-duty nights`),
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
      source: "nights, zone_assignments, night_slot_tasks, call_offs, today_assignment_changes, tm_profiles, integrity views",
      denominator: "Distinct loaded nights and distinct assigned TM/night rows. Fairness opportunity denominators are disclosed as limited.",
      caveats: [
        "Counts distinguish direct zones, assignment-carried coverage, and printable banner rows.",
        "Composite duty is one assignment carrying multiple physical areas, not double-booking.",
        "Call-offs are recorded events and are not treated as attendance or performance rates.",
      ],
    },
    sourceCounts: [
      { label: "Nights", rows: nightRes.data.length, note: `${allNights.length} after status filter` },
      { label: "Assignments", rows: assignmentRes.data.length },
      { label: "Coverage banner rows", rows: taskRes.data.length },
      { label: "Call-offs", rows: callOffRes.data.length },
      { label: "Board changes", rows: changeRes.data.length },
      { label: "Profiles", rows: profileRes.data.length },
    ],
    confidence,
    definitions: REPORT_DEFINITIONS,
    packages: buildPackages({ nights, teamMembers, areas, findings, totals, dateRange: { from, to } }),
    nights,
    teamMembers,
    areas,
    findings,
    totals,
  };
}
