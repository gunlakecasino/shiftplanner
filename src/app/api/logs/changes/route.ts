import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { DeploymentLogEntry, DeploymentLogsResponse } from "@/lib/shiftbuilder/deploymentLogTypes";

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

/**
 * GET /api/logs/changes?nightDate=YYYY-MM-DD&operator=Name&action=assign&slotKey=Z1&limit=200
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await requireOpsPermission(request, "canAccessSudo");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const rateKey = `logs-changes:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 90);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  const nightDate = request.nextUrl.searchParams.get("nightDate");
  const operator = request.nextUrl.searchParams.get("operator")?.trim() || null;
  const actionFilter = request.nextUrl.searchParams.get("action")?.trim() || null;
  const slotKeyFilter = request.nextUrl.searchParams.get("slotKey")?.trim() || null;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(500, Math.max(1, Number(limitRaw) || 200));

  if (!nightDate) {
    return NextResponse.json({ error: "Missing ?nightDate=YYYY-MM-DD" }, { status: 400 });
  }

  const parsed = parseLocalDateISO(nightDate);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid nightDate format" }, { status: 400 });
  }

  const client = createAdminClientSafe();
  if (!client) {
    const empty: DeploymentLogsResponse = { entries: [], operators: [], nightDate };
    return NextResponse.json(empty);
  }

  let entriesQuery = client
    .from("today_assignment_changes")
    .select("*")
    .eq("night_date", nightDate)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (operator) {
    entriesQuery = entriesQuery.eq("operator_name", operator);
  }

  if (actionFilter) {
    entriesQuery = entriesQuery.eq("action", actionFilter);
  }

  if (slotKeyFilter) {
    entriesQuery = entriesQuery.eq("slot_key", slotKeyFilter);
  }

  const operatorsQuery = client
    .from("today_assignment_changes")
    .select("operator_name")
    .eq("night_date", nightDate);

  const [entriesRes, operatorsRes] = await Promise.all([entriesQuery, operatorsQuery]);

  if (entriesRes.error) {
    console.error("[logs/changes] entries query failed", entriesRes.error);
    return NextResponse.json({ error: entriesRes.error.message }, { status: 500 });
  }

  if (operatorsRes.error) {
    console.warn("[logs/changes] operators query failed", operatorsRes.error);
  }

  const operatorSet = new Set<string>();
  (operatorsRes.data ?? []).forEach((row: { operator_name?: string }) => {
    const name = row.operator_name?.trim();
    if (name) operatorSet.add(name);
  });

  const payload: DeploymentLogsResponse = {
    nightDate,
    entries: (entriesRes.data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    operators: [...operatorSet].sort((a, b) => a.localeCompare(b)),
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
  });
}