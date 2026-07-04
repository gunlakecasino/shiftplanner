/**
 * engine/ai/index.ts — public surface of the provider-agnostic AI layer (P4).
 */

export type {
  AiProvider,
  AiToolset,
  AiTool,
  AiReasoningEffort,
  CompleteStructuredArgs,
  CompleteStructuredResult,
  TokenUsage,
} from "./provider";
export { createAiProvider, type AiProviderId, type CreateAiProviderOptions } from "./factory";
export { MockAiProvider, type MockResponder } from "./providers/mock";
export { buildAiTools } from "./tools";
export { buildNightBrief, AI_SYSTEM_PROMPT } from "./briefs";
export { validateAiDraft, type AiGuardResult } from "./guard";
export { applyAiStage, type AiStageOptions, type AiStageResult } from "./stage";
export { AiNightOutputSchema, AiOverrideSchema, type AiNightOutput, type AiOverride } from "./schemas";
