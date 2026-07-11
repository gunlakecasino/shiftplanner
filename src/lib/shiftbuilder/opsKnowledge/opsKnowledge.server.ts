/**
 * Server-only ops knowledge / AI feedback access via service role.
 * Callers MUST already have enforced session + permission (mutations route).
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { emptyOpsKnowledge, type OpsKnowledge } from "./types";
import type { AiFeedbackExample, FeedbackVerdict } from "./feedback";

const FEEDBACK_TABLE = "ops_ai_feedback";
const KNOWLEDGE_TABLE = "ops_supervisor_knowledge";
const KNOWLEDGE_ROW_ID = "default";

function adminClient() {
  const client = createAdminClientSafe();
  if (!client) throw new Error("Service role not configured");
  return client;
}

export async function loadOpsKnowledgeServer(): Promise<OpsKnowledge> {
  const client = adminClient();
  const { data, error } = await client
    .from(KNOWLEDGE_TABLE)
    .select("data")
    .eq("id", KNOWLEDGE_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`loadOpsKnowledge: ${error.message}`);
  if (!data?.data) return emptyOpsKnowledge();
  return { ...emptyOpsKnowledge(), ...(data.data as OpsKnowledge) };
}

export async function saveOpsKnowledgeServer(
  knowledge: OpsKnowledge,
): Promise<{ ok: true }> {
  const client = adminClient();
  const payload: OpsKnowledge = {
    ...knowledge,
    updatedAt: new Date().toISOString(),
  };
  const { error } = await client
    .from(KNOWLEDGE_TABLE)
    .upsert({ id: KNOWLEDGE_ROW_ID, data: payload, updated_at: payload.updatedAt });
  if (error) throw new Error(`saveOpsKnowledge: ${error.message}`);
  return { ok: true };
}

export async function loadRecentAiFeedbackServer(
  limit = 40,
): Promise<AiFeedbackExample[]> {
  const client = adminClient();
  const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 40)), 200);
  const { data, error } = await client
    .from(FEEDBACK_TABLE)
    .select(
      "id, night_iso, slot_key, tm_id, tm_name, ai_rationale, verdict, reason, facts, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(`loadRecentAiFeedback: ${error.message}`);
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string | undefined,
    nightIso: String(r.night_iso ?? ""),
    slotKey: String(r.slot_key ?? ""),
    tmId: String(r.tm_id ?? ""),
    tmName: String(r.tm_name ?? ""),
    aiRationale: String(r.ai_rationale ?? ""),
    verdict: r.verdict as FeedbackVerdict,
    reason: (r.reason as string | null) ?? undefined,
    facts: (r.facts as string | null) ?? undefined,
    createdAt: r.created_at as string | undefined,
  }));
}

export async function saveAiFeedbackServer(
  example: AiFeedbackExample,
): Promise<{ ok: true }> {
  const verdict = example.verdict;
  if (verdict !== "endorsed" && verdict !== "rejected") {
    throw new Error("saveAiFeedback: verdict must be endorsed or rejected");
  }

  const client = adminClient();
  const { error } = await client.from(FEEDBACK_TABLE).insert({
    night_iso: example.nightIso ?? null,
    slot_key: example.slotKey ?? null,
    tm_id: example.tmId ?? null,
    tm_name: example.tmName ?? null,
    ai_rationale: example.aiRationale ?? null,
    verdict,
    reason: example.reason ?? null,
    facts: example.facts ?? null,
  });
  if (error) throw new Error(`saveAiFeedback: ${error.message}`);
  return { ok: true };
}
