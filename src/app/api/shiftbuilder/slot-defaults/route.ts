import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import type { SlotDefault, SlotDefaultTask } from "@/lib/shiftbuilder/data";

/** Session-gated read — prod anon client cannot SELECT slot_defaults tables (RLS). */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const admin = createAdminClientSafe();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 500 });
  }

  // Break-group defaults only. slot_default_tasks was retired by the defaults
  // cutover — nightly task chips now come from slot-default Ops Tasks
  // (ops_work_items), materialized by applySlotDefaultsToNight. tasks is kept in
  // the response shape (always empty) so any lingering caller stays safe.
  const defaultsRes = await admin
    .from("slot_defaults")
    .select("slot_key, slot_type, rr_side, default_break_group")
    .order("slot_key", { ascending: true });

  if (defaultsRes.error) {
    console.error("[slot-defaults] defaults read error:", defaultsRes.error);
    return NextResponse.json({ error: defaultsRes.error.message }, { status: 500 });
  }

  const defaults: SlotDefault[] = (defaultsRes.data ?? []).map((r) => ({
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side ?? "",
    defaultBreakGroup: r.default_break_group ?? 0,
  }));

  const tasks: SlotDefaultTask[] = [];

  return NextResponse.json({ defaults, tasks });
}