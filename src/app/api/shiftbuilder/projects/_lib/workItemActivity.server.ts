import type { SupabaseClient } from "@supabase/supabase-js";
import type { WorkItemStatus } from "@/lib/tasks/types";

/** Insert one ops_status_history row. Never throws — logging failures shouldn't fail the mutation (T5, best-effort). */
export async function logStatusChange(
  admin: SupabaseClient,
  params: {
    workItemId: string;
    fromStatus: WorkItemStatus | null;
    toStatus: WorkItemStatus;
    actorName: string;
    note?: string | null;
  },
): Promise<void> {
  const { error } = await admin.from("ops_status_history").insert({
    work_item_id: params.workItemId,
    from_status: params.fromStatus,
    to_status: params.toStatus,
    changed_by_name: params.actorName,
    note: params.note ?? null,
  });
  if (error) {
    console.error("[projects] logStatusChange failed:", error);
  }
}
