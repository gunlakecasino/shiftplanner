/**
 * opsKnowledge/data.ts — load/save the Supervisor Brain (Supabase JSONB).
 *
 * Single global row ('default') for the solo ops tool. Fails soft: a missing
 * table or row returns empty knowledge so the engine simply behaves as before.
 */

import { supabase } from "../../supabase";
import { emptyOpsKnowledge, type OpsKnowledge } from "./types";

const TABLE = "ops_supervisor_knowledge";
const ROW_ID = "default";

export async function loadOpsKnowledge(): Promise<OpsKnowledge> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("id", ROW_ID)
      .maybeSingle();
    if (error || !data?.data) return emptyOpsKnowledge();
    return { ...emptyOpsKnowledge(), ...(data.data as OpsKnowledge) };
  } catch {
    return emptyOpsKnowledge();
  }
}

export async function saveOpsKnowledge(
  knowledge: OpsKnowledge,
): Promise<{ ok: boolean; error?: string }> {
  const payload: OpsKnowledge = { ...knowledge, updatedAt: new Date().toISOString() };
  try {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ id: ROW_ID, data: payload, updated_at: payload.updatedAt });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "save failed" };
  }
}
