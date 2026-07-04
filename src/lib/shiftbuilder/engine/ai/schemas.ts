/**
 * engine/ai/schemas.ts — the structured contract the AI must return (P4-4).
 *
 * The AI proposes slot-level *overrides* to the optimizer draft, each with a
 * rationale — it never returns a whole board. The guard applies these onto the
 * optimizer draft and rejects any that break a hard rule or drop coverage (N4),
 * so a malformed or adversarial response can only ever be a no-op, never a
 * regression.
 */

import { z } from "zod";

export const AiOverrideSchema = z.object({
  slotKey: z.string().describe("Deployment slot to change, e.g. Z4 or MRR6"),
  tmId: z.string().describe("The team member id to place on that slot"),
  rationale: z.string().describe("Short reason this override improves the board"),
});

export const AiNightOutputSchema = z.object({
  overrides: z
    .array(AiOverrideSchema)
    .describe("Slot-level improvements over the optimizer draft (may be empty)"),
  notes: z.string().optional().describe("Optional board-level commentary"),
});

export type AiOverride = z.infer<typeof AiOverrideSchema>;
export type AiNightOutput = z.infer<typeof AiNightOutputSchema>;
