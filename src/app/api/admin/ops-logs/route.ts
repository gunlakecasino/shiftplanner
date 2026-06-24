// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireSudoAdmin } from "@/lib/auth/requireSudoAdmin.server";
import { opsLog } from "@/lib/opsLogger";
import { queryOpsAuditLogs } from "@/lib/shiftbuilder/opsLogsQuery.server";

/**
 * GET /api/admin/ops-logs
 *
 * sudo_admin only — comprehensive audit trail for ALL operators (floor + admin).
 *
 * Query params:
 *   nightDate=YYYY-MM-DD          (single night — preferred)
 *   startDate= & endDate=         (range; use when spanning multiple nights)
 *   operator=Name                 (exact match on operator_name)
 *   action=assign|unassign|...    (deployment log action)
 *   slotKey=Z4|__meta__|...       (slot or meta key)
 *   limit=300                     (max 1000)
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = await requireSudoAdmin(request);
  if (!admin.ok) {
    opsLog("ops-logs", "auth_denied", { status: admin.status, error: admin.error }, "warn");
    return NextResponse.json({ error: admin.error }, { status: admin.status });
  }

  const rateKey = `ops-logs:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 120);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  const sp = request.nextUrl.searchParams;
  const result = await queryOpsAuditLogs({
    nightDate: sp.get("nightDate"),
    startDate: sp.get("startDate"),
    endDate: sp.get("endDate"),
    operator: sp.get("operator"),
    action: sp.get("action"),
    slotKey: sp.get("slotKey"),
    limit: Number(sp.get("limit")) || 300,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  opsLog("ops-logs", "audit_query", {
    actorId: admin.actor.id,
    actorName: admin.actor.full_name || admin.actor.username,
    total: result.total,
    filters: result.filters,
  });

  return NextResponse.json(
    {
      ...result,
      queriedBy: {
        id: admin.actor.id,
        name: admin.actor.full_name || admin.actor.username,
        role: admin.actor.role,
      },
    },
    {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    },
  );
}