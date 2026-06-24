// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import { opsLog } from "@/lib/opsLogger";
import { queryOpsAuditLogs } from "@/lib/shiftbuilder/opsLogsQuery.server";
import type { DeploymentLogsResponse } from "@/lib/shiftbuilder/deploymentLogTypes";

/**
 * GET /api/logs/changes?nightDate=YYYY-MM-DD&operator=Name&action=assign&slotKey=Z1&limit=200
 *
 * Legacy sudo-capable audit viewer (canAccessSudo).
 * sudo_admin comprehensive trail: GET /api/admin/ops-logs
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await requireOpsPermission(request, "canAccessSudo");
  if (!session.ok) {
    opsLog("logs/changes", "auth_denied", { status: session.status }, "warn");
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

  const sp = request.nextUrl.searchParams;
  const nightDate = sp.get("nightDate");
  if (!nightDate) {
    return NextResponse.json({ error: "Missing ?nightDate=YYYY-MM-DD" }, { status: 400 });
  }

  const result = await queryOpsAuditLogs({
    nightDate,
    operator: sp.get("operator"),
    action: sp.get("action"),
    slotKey: sp.get("slotKey"),
    limit: Number(sp.get("limit")) || 200,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  const payload: DeploymentLogsResponse = {
    nightDate,
    entries: result.entries,
    operators: result.operators,
  };

  opsLog("logs/changes", "audit_query", {
    actorId: session.actor.user.id,
    nightDate,
    total: result.total,
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
  });
}