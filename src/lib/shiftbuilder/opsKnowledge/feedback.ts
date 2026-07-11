/**
 * opsKnowledge/feedback.ts — the training loop's memory.
 *
 * Every time the operator endorses or rejects an AI override, we store a labeled
 * example of their judgment: {situation, AI proposal + rationale, verdict, reason}.
 * Recent examples are injected into the brief as few-shot context, so the AI
 * converges on how the supervisor actually thinks. See docs/AI_SUPERVISOR_BRAIN.md.
 *
 * Writes (and reads after service_role-only RLS) go through session-gated
 * postOpsMutation → /api/shiftbuilder/mutations (admin client). Browser must not
 * hit ops_ai_feedback with the anon Supabase key.
 */

import { postOpsMutation } from "../opsMutationClient";

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

/**
 * Persist one labeled feedback example.
 * Browser-only — uses session cookie via mutations API.
 */
export async function saveFeedback(
  example: AiFeedbackExample,
): Promise<{ ok: boolean; error?: string }> {
  if (typeof window === "undefined") {
    return {
      ok: false,
      error:
        "saveFeedback is browser-only; use saveAiFeedbackServer after requireOpsPermission",
    };
  }
  try {
    await postOpsMutation("save_ai_feedback", {
      nightIso: example.nightIso,
      // night gate uses date when present (ISO night key)
      date: example.nightIso || undefined,
      slotKey: example.slotKey,
      tmId: example.tmId,
      tmName: example.tmName,
      aiRationale: example.aiRationale,
      verdict: example.verdict,
      reason: example.reason ?? null,
      facts: example.facts ?? null,
    });
    return { ok: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "save failed";
    return { ok: false, error: msg };
  }
}

/** Most recent examples (newest first), for the few-shot brief block + learning view. */
export async function loadRecentFeedback(limit = 40): Promise<AiFeedbackExample[]> {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const res = await postOpsMutation<{ examples?: AiFeedbackExample[] }>(
      "load_ai_feedback",
      { limit },
    );
    return Array.isArray(res.examples) ? res.examples : [];
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
