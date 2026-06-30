import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type { BreakGroupValue } from "./breakGroupResolve";
import type { SlotDefault, SlotDefaultTask } from "./data";

function adminClient() {
  const client = createAdminClientSafe();
  if (!client) throw new Error("Service role not configured");
  return client;
}

function mapSlotDefaultTaskRow(r: Record<string, unknown>): SlotDefaultTask {
  return {
    id: String(r.id),
    slotKey: String(r.slot_key),
    slotType: r.slot_type as SlotDefaultTask["slotType"],
    rrSide: (r.rr_side as string) ?? "",
    taskLabel: String(r.task_label),
    taskColor: (r.task_color as string | null) ?? null,
    isCoverage: Boolean(r.is_coverage),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

export async function addSlotDefaultTaskServer(params: {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: string;
  taskLabel: string;
  taskColor?: string | null;
  isCoverage?: boolean;
  sortOrder?: number;
}): Promise<SlotDefaultTask> {
  const {
    slotKey,
    slotType,
    rrSide = "",
    taskLabel,
    taskColor = null,
    isCoverage = false,
    sortOrder = 0,
  } = params;

  const { data, error } = await adminClient()
    .from("slot_default_tasks")
    .upsert(
      {
        slot_key: slotKey,
        slot_type: slotType,
        rr_side: rrSide,
        task_label: taskLabel,
        task_color: taskColor,
        is_coverage: isCoverage,
        sort_order: sortOrder,
      },
      { onConflict: "slot_key,rr_side,task_label" },
    )
    .select("id, slot_key, slot_type, rr_side, task_label, task_color, is_coverage, sort_order")
    .single();

  if (error) {
    console.error("[shiftbuilder/slotDefaults] addSlotDefaultTaskServer error:", error);
    throw new Error(`Failed to add default task: ${(error as { message?: string }).message ?? "unknown"}`);
  }

  return mapSlotDefaultTaskRow(data as Record<string, unknown>);
}

export async function removeSlotDefaultTaskServer(id: string): Promise<void> {
  const { error } = await adminClient().from("slot_default_tasks").delete().eq("id", id);

  if (error) {
    console.error("[shiftbuilder/slotDefaults] removeSlotDefaultTaskServer error:", error);
    throw new Error(`Failed to remove default task: ${(error as { message?: string }).message ?? "unknown"}`);
  }
}

export async function upsertSlotDefaultServer(params: {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: string;
  defaultBreakGroup: BreakGroupValue;
}): Promise<void> {
  const { slotKey, slotType, rrSide = "", defaultBreakGroup } = params;

  const { error } = await adminClient()
    .from("slot_defaults")
    .upsert(
      {
        slot_key: slotKey,
        slot_type: slotType,
        rr_side: rrSide,
        default_break_group: defaultBreakGroup,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slot_key,rr_side" },
    );

  if (error) {
    console.error("[shiftbuilder/slotDefaults] upsertSlotDefaultServer error:", error);
    throw new Error(`Failed to save slot default: ${(error as { message?: string }).message ?? "unknown"}`);
  }
}

export async function bulkUpsertSlotDefaultsServer(rows: SlotDefault[]): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((r) => ({
    slot_key: r.slotKey,
    slot_type: r.slotType,
    rr_side: r.rrSide ?? "",
    default_break_group: r.defaultBreakGroup,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await adminClient()
    .from("slot_defaults")
    .upsert(payload, { onConflict: "slot_key,rr_side" });

  if (error) {
    console.error("[shiftbuilder/slotDefaults] bulkUpsertSlotDefaultsServer error:", error);
    throw new Error(`Failed to save slot defaults: ${(error as { message?: string }).message ?? "unknown"}`);
  }
}