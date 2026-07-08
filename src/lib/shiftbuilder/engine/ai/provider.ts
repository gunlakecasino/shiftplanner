/**
 * engine/ai/provider.ts — the ONE vendor seam (P4-1, principle N5).
 *
 * The AI is a judgment layer, not an authority (N4), and it must be
 * provider-agnostic: swapping the model that powers it (xAI's Grok → Anthropic's
 * Claude/Fable → anything) is a config value plus one adapter file, never a
 * change to the brief, the tools, the stage, or the guard. This interface is the
 * only place a vendor SDK may be imported (enforced by convention + a lint rule
 * once wired). Everything above it speaks `AiProvider`.
 */

import type { ZodType } from "zod";

export type AiReasoningEffort = "none" | "low" | "medium" | "high";

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ToolCallLog {
  name: string;
  args: unknown;
  result: unknown;
}

/** One executable tool the model may call while reasoning. */
export interface AiTool<A = any, R = any> {
  description: string;
  parameters: ZodType<A>;
  execute: (args: A) => Promise<R> | R;
}

export type AiToolset = Record<string, AiTool>;

export interface CompleteStructuredArgs<T> {
  system: string;
  prompt: string;
  /** Zod schema the structured output must satisfy. */
  schema: ZodType<T>;
  /** Optional tools the model may call to gather context before answering. */
  tools?: AiToolset;
  reasoningEffort: AiReasoningEffort;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface CompleteStructuredResult<T> {
  output: T;
  usage: TokenUsage;
  toolCalls: ToolCallLog[];
}

export interface AiProvider {
  readonly id: "xai" | "anthropic" | "mock";
  /** Return a schema-valid structured object, optionally after tool use. */
  completeStructured<T>(
    args: CompleteStructuredArgs<T>,
  ): Promise<CompleteStructuredResult<T>>;
}

export const EMPTY_USAGE: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
