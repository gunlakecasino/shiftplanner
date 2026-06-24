// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { parseLocalDateISO } from "./dateUtils";
import {
  ALL_DEPLOYMENT_LOG_ACTIONS,
  type DeploymentLogAction,
  type DeploymentLogEntry,
} from "./deploymentLogTypes";

export type OpsLogsQueryFilters = {
  nightDate?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  operator?: string | null;
  action?: string | null;
  slotKey?: string | null;
  limit?: number;
};

export type OpsLogsQueryResult = {
  entries: DeploymentLogEntry[];
  operators: string[];
  actions: DeploymentLogAction[];
  opsUserIds: string[];
  nightDates: string[];
  total: number;
  filters: {
    nightDate: string | null;
    startDate: string | null;
    endDate: string | null;
    operator: string | null;
    action: string | null;
    slotKey: string | null;
    limit: number;
  };
};

function mapRow(row: Record<string, unknown>): DeploymentLogEntry {
  return {
    id: String(row.id),
    nightId: String(row.night_id),
    nightDate: String(row.night_date),
    operatorName: String(row.operator_name),
    action: row.action as DeploymentLogEntry["action"],
    slotKey: String(row.slot_key),
    slotType: (row.slot_type as string | null) ?? null,
    rrSide: (row.rr_side as string | null) ?? null,
    previousTmId: (row.previous_tm_id as string | null) ?? null,
    previousTmName: (row.previous_tm_name as string | null) ?? null,
    newTmId: (row.new_tm_id as string | null) ?? null,
    newTmName: (row.new_tm_name as string | null) ?? null,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at),
  };
}

function isValidDateParam(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  return !isNaN(parseLocalDateISO(value).getTime());
}

export async function queryOpsAuditLogs(
  filters: OpsLogsQueryFilters,
): Promise<OpsLogsQueryResult | { error: string; status: number }> {
  const limit = Math.min(1000, Math.max(1, filters.limit ?? 300));
  const nightDate = filters.nightDate?.trim() || null;
  const startDate = filters.startDate?.trim() || null;
  const endDate = filters.endDate?.trim() || null;
  const operator = filters.operator?.trim() || null;
  const actionFilter = filters.action?.trim() || null;
  const slotKeyFilter = filters.slotKey?.trim() || null;

  if (!nightDate && !startDate && !endDate) {
    return { error: "Provide ?nightDate=YYYY-MM-DD or ?startDate= & ?endDate=", status: 400 };
  }

  if (nightDate && !isValidDateParam(nightDate)) {
    return { error: "Invalid nightDate format", status: 400 };
  }
  if (startDate && !isValidDateParam(startDate)) {
    return { error: "Invalid startDate format", status: 400 };
  }
  if (endDate && !isValidDateParam(endDate)) {
    return { error: "Invalid endDate format", status: 400 };
  }

  const client = createAdminClientSafe();
  if (!client) {
    return {
      entries: [],
      operators: [],
      actions: ALL_DEPLOYMENT_LOG_ACTIONS,
      opsUserIds: [],
      nightDates: nightDate ? [nightDate] : [],
      total: 0,
      filters: {
        nightDate,
        startDate,
        endDate,
        operator,
        action: actionFilter,
        slotKey: slotKeyFilter,
        limit,
      },
    };
  }

  let entriesQuery = client
    .from("today_assignment_changes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (nightDate) {
    entriesQuery = entriesQuery.eq("night_date", nightDate);
  } else {
    if (startDate) entriesQuery = entriesQuery.gte("night_date", startDate);
    if (endDate) entriesQuery = entriesQuery.lte("night_date", endDate);
  }

  if (operator) entriesQuery = entriesQuery.eq("operator_name", operator);
  if (actionFilter) entriesQuery = entriesQuery.eq("action", actionFilter);
  if (slotKeyFilter) entriesQuery = entriesQuery.eq("slot_key", slotKeyFilter);

  let facetQuery = client.from("today_assignment_changes").select("operator_name, action, night_date, payload");

  if (nightDate) {
    facetQuery = facetQuery.eq("night_date", nightDate);
  } else {
    if (startDate) facetQuery = facetQuery.gte("night_date", startDate);
    if (endDate) facetQuery = facetQuery.lte("night_date", endDate);
  }

  const [entriesRes, facetRes] = await Promise.all([entriesQuery, facetQuery]);

  if (entriesRes.error) {
    return { error: entriesRes.error.message, status: 500 };
  }

  const operatorSet = new Set<string>();
  const actionSet = new Set<string>();
  const nightDateSet = new Set<string>();
  const opsUserIdSet = new Set<string>();

  (facetRes.data ?? []).forEach((row) => {
    const name = (row as { operator_name?: string }).operator_name?.trim();
    if (name) operatorSet.add(name);
    const act = (row as { action?: string }).action?.trim();
    if (act) actionSet.add(act);
    const nd = (row as { night_date?: string }).night_date?.trim();
    if (nd) nightDateSet.add(nd);
    const payload = (row as { payload?: Record<string, unknown> }).payload;
    const uid = payload?.opsUserId;
    if (typeof uid === "string" && uid.trim()) opsUserIdSet.add(uid.trim());
  });

  const entries = (entriesRes.data ?? []).map((row) =>
    mapRow(row as Record<string, unknown>),
  );

  entries.forEach((e) => {
    const uid = e.payload?.opsUserId;
    if (typeof uid === "string" && uid.trim()) opsUserIdSet.add(uid.trim());
  });

  return {
    entries,
    operators: [...operatorSet].sort((a, b) => a.localeCompare(b)),
    actions: [...actionSet].sort() as DeploymentLogAction[],
    opsUserIds: [...opsUserIdSet].sort(),
    nightDates: [...nightDateSet].sort(),
    total: entries.length,
    filters: {
      nightDate,
      startDate,
      endDate,
      operator,
      action: actionFilter,
      slotKey: slotKeyFilter,
      limit,
    },
  };
}