// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { opsLog } from "@/lib/opsLogger";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import {
  hasOpsPermission,
  permissionRequiredForAuditAction,
} from "@/lib/auth/auditActionPermission";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";
import type { DeploymentChangeInput } from "@/lib/shiftbuilder/deploymentChangeLog";

const META_ACTIONS = new Set([
  "publish",
  "unpublish",
  "night_lock",
  "night_unlock",
  "print",
  "settings_update",
  "team_update",
  "user_update",
  "roster_update",
  "schedule_apply",
  "defaults_push",
  "engine_config",
  "engine_run",
  "task_catalog",
  "tm_defaults",
  "session_start",
  "session_end",
  "settings_nav",
]);
const META_SLOT_KEY = "__meta__";

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const rateKey = `log-change:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many audit log requests — try again shortly" },
      {
        status: 429,
        headers: { "Retry-After": String(rateCheck.retryAfterSec) },
      },
    );
  }

  let body: DeploymentChangeInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    nightId,
    nightDate,
    action,
    slotKey,
    previousTmId,
    previousTmName,
    newTmId,
    newTmName,
    payload = {},
  } = body;

  if (!nightId || !nightDate || !action) {
    return NextResponse.json(
      { error: "nightId, nightDate, and action are required" },
      { status: 400 },
    );
  }

  const requiredPerm = permissionRequiredForAuditAction(action);
  if (!hasOpsPermission(session.actor.permissions, requiredPerm)) {
    return NextResponse.json(
      { error: `Not authorized to log action: ${action}` },
      { status: 403 },
    );
  }

  const operatorName = session.actor.operatorName;
  const opsUserId = session.actor.user.id;

  const effectiveSlotKey =
    slotKey?.trim() || (META_ACTIONS.has(action) ? META_SLOT_KEY : "");
  if (!effectiveSlotKey) {
    return NextResponse.json({ error: "slotKey is required for this action" }, { status: 400 });
  }

  const client = createAdminClientSafe();
  if (!client) {
    opsLog("shiftbuilder/audit", "audit_persist_skipped", { reason: "no_service_role" }, "warn");
    return NextResponse.json({ ok: true, persisted: false });
  }

  let slotType: string | null = body.slotType ?? null;
  let rrSide: string | null = body.rrSide ?? null;
  if (!slotType && effectiveSlotKey !== META_SLOT_KEY) {
    try {
      const mapped = uiToDb(effectiveSlotKey);
      slotType = mapped.slot_type;
      rrSide = mapped.rr_side;
    } catch {
      slotType = null;
    }
  }

  const enrichedPayload = {
    ...payload,
    opsUserId,
    sessionBound: true,
  };

  const { error } = await client.from("today_assignment_changes").insert({
    night_id: nightId,
    night_date: nightDate,
    operator_name: operatorName,
    action,
    slot_key: effectiveSlotKey,
    slot_type: slotType,
    rr_side: rrSide,
    previous_tm_id: previousTmId ?? null,
    previous_tm_name: previousTmName ?? null,
    new_tm_id: newTmId ?? null,
    new_tm_name: newTmName ?? null,
    payload: enrichedPayload,
  });

  if (error) {
    opsLog(
      "shiftbuilder/audit",
      "audit_persist_failed",
      { code: error.code, message: error.message, action, nightDate },
      "error",
    );
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }

  opsLog(
    "shiftbuilder/audit",
    "audit_persisted",
    { action, nightDate, slotKey: effectiveSlotKey, operatorName },
    "debug",
  );

  return NextResponse.json({ ok: true, persisted: true });
}