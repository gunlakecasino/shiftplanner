import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { formatLocalDateISO, currentShiftDate } from "./dateUtils";
import type { OpsAuditInput } from "./opsAuditLog";

const SETTINGS_NIGHT_ID = "__settings__";
const META_SLOT_KEY = "__meta__";

/** Server-side audit insert — used by protected API routes. */
export async function logOpsAuditServer(input: OpsAuditInput): Promise<void> {
  const client = createAdminClientSafe();
  if (!client) return;

  const nightDate = input.nightDate?.trim() || formatLocalDateISO(currentShiftDate());
  const nightId = input.nightId?.trim() || SETTINGS_NIGHT_ID;

  await client.from("today_assignment_changes").insert({
    night_id: nightId,
    night_date: nightDate,
    operator_name: input.operatorName.trim(),
    action: input.action,
    slot_key: input.slotKey?.trim() || META_SLOT_KEY,
    previous_tm_id: input.previousTmId ?? null,
    previous_tm_name: input.previousTmName ?? null,
    new_tm_id: input.newTmId ?? null,
    new_tm_name: input.newTmName ?? null,
    payload: {
      ...input.payload,
      opsUserId: input.opsUserId ?? null,
      source: "server",
    },
  });
}