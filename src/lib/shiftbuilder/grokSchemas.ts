/**
 * Zod schemas for the Grok Intelligence layer.
 *
 * These are the single source of truth for structured output contracts
 * when using the Vercel AI SDK (@ai-sdk/xai + generateText + Output.object).
 *
 * They are intentionally kept in sync with the runtime types in
 * grokIntelligence.ts and grokEngine.ts so the server-side guards continue
 * to work unchanged.
 */

import { z } from "zod";

// ========================================================
// Structured Suggestions (Command Palette "Ask Grok")
// ========================================================

export const GrokActionSchema = z.object({
  type: z.enum(["assign", "swap", "remove", "note"]),
  slotKey: z.string().optional(),
  tmId: z.string().optional(),
  fromSlot: z.string().optional(),
  toSlot: z.string().optional(),
  reason: z.string().min(1),
});

export const GrokStructuredResponseSchema = z.object({
  explanation: z.string(),
  actions: z.array(GrokActionSchema),
});

export type GrokStructuredResponse = z.infer<typeof GrokStructuredResponseSchema>;
export type GrokAction = z.infer<typeof GrokActionSchema>;

// ========================================================
// Grok-Hybrid Engine Picks
// ========================================================

export const GrokEnginePickSchema = z.object({
  slotKey: z.string().min(1),
  tmId: z.string().min(1),
  reason: z.string().min(1),
});

export const GrokEngineResponseSchema = z.object({
  explanation: z.string(),
  picks: z.array(GrokEnginePickSchema),
});

export type GrokEngineResponse = z.infer<typeof GrokEngineResponseSchema>;
export type GrokEnginePick = z.infer<typeof GrokEnginePickSchema>;

// ========================================================
// Helper: Safe parse helpers (used during migration)
// ========================================================

export function safeParseStructuredResponse(raw: unknown) {
  return GrokStructuredResponseSchema.safeParse(raw);
}

export function safeParseEngineResponse(raw: unknown) {
  return GrokEngineResponseSchema.safeParse(raw);
}