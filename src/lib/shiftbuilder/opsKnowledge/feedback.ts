/**
 * opsKnowledge/feedback.ts — the training loop's memory.
 *
 * Every time the operator endorses or rejects an AI override, we store a labeled
 * example of their judgment: {situation, AI proposal + rationale, verdict, reason}.
 * Recent examples are injected into the brief as few-shot context, so the AI
 * converges on how the supervisor actually thinks. See docs/AI_SUPERVISOR_BRAIN.md.
 */

import { supabase } from "../../supabase";

export type FeedbackVerdict = "endorsed" | "rejected";

export interface AiFeedbackExample {
  id?: string;
  nightIso: string;
  slotKey: string;
  tmId: string;
  tmName: string;
  aiRationale: string;
  verdict: FeedbackVerdict;
  /** Operator's reason (especially for rejections) — the richest training signal. */
  reason?: string;
  /** Compact situation snapshot (rotation facts at the time). */
  facts?: string;
  createdAt?: string;
}

const TABLE = "ops_ai_feedback";

export async function saveFeedback(
  example: AiFeedbackExample,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from(TABLE).insert({
      night_iso: example.nightIso,
      slot_key: example.slotKey,
      tm_id: example.tmId,
      tm_name: example.tmName,
      ai_rationale: example.aiRationale,
      verdict: example.verdict,
      reason: example.reason ?? null,
      facts: example.facts ?? null,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "save failed" };
  }
}

/** Most recent examples (newest first), for the few-shot brief block + learning view. */
export async function loadRecentFeedback(limit = 40): Promise<AiFeedbackExample[]> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id, night_iso, slot_key, tm_id, tm_name, ai_rationale, verdict, reason, facts, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      nightIso: r.night_iso,
      slotKey: r.slot_key,
      tmId: r.tm_id,
      tmName: r.tm_name,
      aiRationale: r.ai_rationale,
      verdict: r.verdict,
      reason: r.reason ?? undefined,
      facts: r.facts ?? undefined,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Format recent feedback as a few-shot brief block. Endorsements teach "keep
 * doing this"; rejections (with reasons) teach "don't do this, because…".
 */
export function feedbackBriefBlock(examples: AiFeedbackExample[]): string[] {
  if (examples.length === 0) return [];
  const endorsed = examples.filter((e) => e.verdict === "endorsed").slice(0, 8);
  const rejected = examples.filter((e) => e.verdict === "rejected").slice(0, 8);
  const lines: string[] = [];
  if (endorsed.length) {
    lines.push("The supervisor ENDORSED these past calls (do more like this):");
    for (const e of endorsed) lines.push(`  ✓ ${e.slotKey} ← ${e.tmName}: ${e.aiRationale}`);
  }
  if (rejected.length) {
    lines.push("The supervisor REJECTED these (avoid this pattern):");
    for (const e of rejected) {
      lines.push(`  ✗ ${e.slotKey} ← ${e.tmName}: ${e.aiRationale}${e.reason ? ` — REASON: ${e.reason}` : ""}`);
    }
  }
  return lines;
}
