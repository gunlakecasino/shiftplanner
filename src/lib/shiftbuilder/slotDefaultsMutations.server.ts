import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type { BreakGroupValue } from "./breakGroupResolve";
import { parseCardVector, type CardVector } from "./cardVectors";
import type { SlotDefault, SlotDefaultTask } from "./data";
import { graveBreakGroupForCompositeKey, graveBreakGroupCompositeKey } from "./graveBreakGroupDefaults";

function adminClient() {
  const client = createAdminClientSafe();
  if (!client) throw new Error("Service role not configured");
  return client;
}

const SLOT_DEFAULT_TASKS_RETIRED =
  "slot_default_tasks was dropped by the defaults cutover — default task chips are now Ops Tasks (ops_work_items), managed in Settings → Card Defaults.";

/** @deprecated Retired by the cutover — slot_default_tasks no longer exists. */
export async function addSlotDefaultTaskServer(_params: {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: string;
  taskLabel: string;
  taskColor?: string | null;
  isCoverage?: boolean;
  sortOrder?: number;
}): Promise<SlotDefaultTask> {
  throw new Error(SLOT_DEFAULT_TASKS_RETIRED);
}

/** @deprecated Retired by the cutover — slot_default_tasks no longer exists. */
export async function removeSlotDefaultTaskServer(_id: string): Promise<void> {
  throw new Error(SLOT_DEFAULT_TASKS_RETIRED);
}

export async function upsertSlotDefaultServer(params: {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: string;
  defaultBreakGroup: BreakGroupValue;
}): Promise<void> {
  const { slotKey, slotType, rrSide: rawRrSide = "", defaultBreakGroup } = params;
  const rrSide = rawRrSide ?? "";

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

/** Standing card vector on the slot. Does not touch tm_profiles or zone_assignments. */
export async function setSlotCardVectorServer(params: {
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: string;
  cardVector: CardVector | null;
}): Promise<void> {
  const { slotKey, slotType, rrSide: rawRrSide = "", cardVector } = params;
  const rrSide = rawRrSide ?? "";
  const vector = parseCardVector(cardVector);

  const client = adminClient();
  const { data: existing, error: readError } = await client
    .from("slot_defaults")
    .select("default_break_group")
    .eq("slot_key", slotKey)
    .eq("rr_side", rrSide)
    .maybeSingle();

  if (readError) {
    console.error("[shiftbuilder/slotDefaults] setSlotCardVectorServer read error:", readError);
    throw new Error(`Failed to read slot default: ${readError.message ?? "unknown"}`);
  }

  const fallback =
    graveBreakGroupForCompositeKey(graveBreakGroupCompositeKey(slotKey, rrSide)) ?? 0;
  const defaultBreakGroup =
    (existing as { default_break_group?: number } | null)?.default_break_group ?? fallback;

  const { error } = await client.from("slot_defaults").upsert(
    {
      slot_key: slotKey,
      slot_type: slotType,
      rr_side: rrSide,
      default_break_group: defaultBreakGroup,
      card_vector: vector,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "slot_key,rr_side" },
  );

  if (error) {
    console.error("[shiftbuilder/slotDefaults] setSlotCardVectorServer error:", error);
    throw new Error(`Failed to save card vector: ${(error as { message?: string }).message ?? "unknown"}`);
  }
}