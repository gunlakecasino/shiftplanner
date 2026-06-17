import { NextRequest, NextResponse } from "next/server";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";
import type { DeploymentChangeInput } from "@/lib/shiftbuilder/todayChangeLog";

const META_ACTIONS = new Set(["publish", "unpublish", "night_lock", "night_unlock"]);
const META_SLOT_KEY = "__meta__";

function canonicalOperatorName(user: {
  full_name?: string | null;
  username?: string | null;
}): string {
  return user.full_name?.trim() || user.username?.trim() || "";
}

async function validateOpsOperator(
  client: NonNullable<ReturnType<typeof createAdminClientSafe>>,
  opsUserId: string | undefined,
  operatorName: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!opsUserId?.trim()) {
    return { ok: false, status: 400, error: "opsUserId is required" };
  }

  const { data: user, error } = await client
    .from("users")
    .select("id, full_name, username, is_active")
    .eq("id", opsUserId.trim())
    .maybeSingle();

  if (error) {
    console.warn("[today/log-change] user lookup failed", error);
    return { ok: false, status: 500, error: "Could not verify operator" };
  }

  if (!user?.is_active) {
    return { ok: false, status: 403, error: "Operator is not active" };
  }

  const expected = canonicalOperatorName(user);
  if (expected && operatorName.trim() !== expected) {
    return { ok: false, status: 403, error: "operatorName does not match authenticated user" };
  }

  return { ok: true };
}

export async function POST(request: NextRequest) {
  let body: DeploymentChangeInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    nightId,
    nightDate,
    operatorName,
    opsUserId,
    action,
    slotKey,
    previousTmId,
    previousTmName,
    newTmId,
    newTmName,
    payload = {},
  } = body;

  if (!nightId || !nightDate || !operatorName?.trim() || !action) {
    return NextResponse.json(
      { error: "nightId, nightDate, operatorName, and action are required" },
      { status: 400 },
    );
  }

  const effectiveSlotKey =
    slotKey?.trim() || (META_ACTIONS.has(action) ? META_SLOT_KEY : "");
  if (!effectiveSlotKey) {
    return NextResponse.json({ error: "slotKey is required for this action" }, { status: 400 });
  }

  const client = createAdminClientSafe();
  if (!client) {
    console.warn("[today/log-change] service role unavailable — skipping persist");
    return NextResponse.json({ ok: true, persisted: false });
  }

  const source = typeof payload?.source === "string" ? payload.source : "";
  const requiresOpsAuth =
    source === "today_deployment_board" || source === "today_marker_pad";

  if (requiresOpsAuth) {
    const authCheck = await validateOpsOperator(client, opsUserId, operatorName);
    if (!authCheck.ok) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }
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
    opsUserId: opsUserId?.trim() || null,
  };

  const { error } = await client.from("today_assignment_changes").insert({
    night_id: nightId,
    night_date: nightDate,
    operator_name: operatorName.trim(),
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
    console.error("[today/log-change] insert failed", error);
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, persisted: true });
}