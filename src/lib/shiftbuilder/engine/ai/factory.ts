/**
 * engine/ai/factory.ts — provider selection (P4-1).
 *
 * The one place that decides which vendor powers the judgment layer. Selection
 * order: explicit arg → engine_config.ai_provider → env override → default xAI.
 * Nothing else in the system names a vendor.
 */

import type { AiProvider } from "./provider";
import { XaiProvider } from "./providers/xai";
import { AnthropicDirectProvider } from "./providers/anthropicDirect";

export type AiProviderId = "xai" | "anthropic";

export interface CreateAiProviderOptions {
  provider?: AiProviderId;
  modelId?: string;
  apiKey?: string;
}

export function createAiProvider(opts: CreateAiProviderOptions = {}): AiProvider {
  const id: AiProviderId =
    opts.provider ??
    (process.env.SHIFTBUILDER_AI_PROVIDER as AiProviderId | undefined) ??
    "xai";
  if (id === "anthropic") {
    // Direct Messages API adapter — the SDK sends a temperature Fable rejects.
    return new AnthropicDirectProvider({ modelId: opts.modelId, apiKey: opts.apiKey });
  }
  return new XaiProvider({ modelId: opts.modelId, apiKey: opts.apiKey });
}
