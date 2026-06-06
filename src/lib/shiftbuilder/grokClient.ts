/**
 * Grok Client — thin, project-specific wrapper around the official Vercel AI SDK
 * (@ai-sdk/xai) for the ShiftBuilder intelligence layer.
 *
 * Responsibilities:
 * - Central place to create configured xAI models
 * - Translate our internal `GrokReasoningEffort` (from EngineConfig) into the SDK's
 *   `providerOptions.xai.reasoningEffort`
 * - Provide a single spot for future defaults, telemetry hooks, or caching
 *
 * This replaces the previous manual `fetch` + `reasoning_effort` body construction
 * in `src/lib/xai.ts` for all new structured paths.
 */

import { createXai } from "@ai-sdk/xai";
import type { GrokReasoningEffort } from "./engineConfig";

/**
 * Create a configured xAI model instance for Grok 4.3 (or any model id).
 *
 * Reasoning effort is **not** set at model creation time.
 * It is passed at call time via `providerOptions: { xai: { reasoningEffort } }`
 * inside generateText / streamText / etc. This is the standard AI SDK pattern.
 */
export function createGrokModel(modelId: string = "grok-4.3") {
  const xai = createXai({
    apiKey: process.env.XAI_API_KEY,
    // baseURL defaults to https://api.x.ai/v1 — perfect for our existing key.
  });

  return xai(modelId);
}

/**
 * Convenience helpers (model creation is cheap).
 */
export function createGrokEngineModel() {
  return createGrokModel("grok-4.3");
}

export function createGrokSuggestionModel() {
  return createGrokModel("grok-4.3");
}

export function createGrokBuildModel() {
  // grok-build-0.1 for fast/cheap coding or basics tasks (per user: utilize grok build + grok 4.3; 4.3 crazy good, build relatively cheap)
  return createGrokModel("grok-build-0.1");
}

/**
 * Type helper for call sites that want strong typing on providerOptions.
 * Usage example in actions.ts:
 *
 *   providerOptions: {
 *     xai: { reasoningEffort: effort }
 *   }
 */
export type XaiProviderOptions = {
  xai?: {
    reasoningEffort?: GrokReasoningEffort;
    // Add other xAI-specific options here as needed (logprobs, etc.)
  };
};