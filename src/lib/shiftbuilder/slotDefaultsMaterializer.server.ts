import "server-only";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { replaceNightSlotTasksForSlotServer } from "./opsMutations.server";

/**
 * Successor to pushTaskDefaultsToNight (the cutover materializer).
 *
 * Writes a night's default card chips from the slot-default Ops Tasks
 * (ops_work_items where is_slot_default=true) instead of slot_default_tasks.
 * Simplified per the cutover decision: every slot — zones, RRs, AUX, AND
 * overlaps — is treated uniformly as fixed per-slot defaults (no AM/PM pool
 * random-to-staffed distribution). Reuses the proven per-slot replace writer
 * (delete + reinsert, preserving coverage bars), so chip shape and the Golden
 * print output are unchanged.
 *
 * NOT wired into night creation yet — that swap is the gated flip.
 */
export async function materializeSlotDefaultsForNight(
  nightId: string,
  opts: { department?: string } = {},
): Promise<{ applied: number; slots: number }> {
  if (!nightId) return { applied: 0, slots: 0 };
  const department = opts.department ?? "graves";

  const admin = createAdminClientSafe();
  if (!admin) return { applied: 0, slots: 0 };

  const { data, error } = await admin
    .from("ops_work_items")
    .select("slot_key, slot_type, rr_side, title, task_color, is_coverage")
    .eq("is_slot_default", true)
    .eq("active", true)
    .eq("department", department)
    .is("archived_at", null)
    .not("slot_key", "is", null);

  if (error) {
    console.error("[materializeSlotDefaultsForNight] read error:", error);
    return { applied: 0, slots: 0 };
  }

  type Group = {
    slotKey: string;
    slotType: string;
    rrSide: string | null;
    tasks: Array<{ taskLabel: string; taskColor: string | null; isCoverage: boolean }>;
  };
  const bySlot = new Map<string, Group>();

  for (const r of data ?? []) {
    const slotKey = r.slot_key as string;
    const rrSide = (r.rr_side as string | null) || null;
    const key = `${slotKey}|${rrSide ?? ""}`;
    let group = bySlot.get(key);
    if (!group) {
      group = { slotKey, slotType: (r.slot_type as string) || "zone", rrSide, tasks: [] };
      bySlot.set(key, group);
    }
    group.tasks.push({
      taskLabel: r.title as string,
      taskColor: (r.task_color as string | null) ?? null,
      isCoverage: (r.is_coverage as boolean | null) ?? false,
    });
  }

  let applied = 0;
  for (const group of bySlot.values()) {
    const count = await replaceNightSlotTasksForSlotServer({
      nightId,
      slotKey: group.slotKey,
      rrSide: group.rrSide,
      slotType: group.slotType,
      tasks: group.tasks.map((t, idx) => ({
        taskLabel: t.taskLabel,
        sortOrder: idx,
        taskColor: t.taskColor,
        isCoverage: t.isCoverage,
      })),
      preserveCoverage: true,
    });
    applied += count;
  }

  return { applied, slots: bySlot.size };
}
