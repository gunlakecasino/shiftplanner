/**
 * engine/ai/providers/anthropic.ts — the Anthropic (Claude / Fable) adapter.
 *
 * Sibling to the xAI adapter, satisfying the same `AiProvider` interface. This
 * is the seam that lets Fable "take over" the judgment layer via a single config
 * value (`engine_config.ai_provider = 'anthropic'`) with no change to the brief,
 * tools, stage, or guard. Reasoning effort maps onto Anthropic extended
 * thinking; low/none disable it.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import type {
  AiProvider,
  CompleteStructuredArgs,
  CompleteStructuredResult,
} from "../provider";
import { sdkCompleteStructured } from "./sdkAdapter";

export interface AnthropicProviderConfig {
  apiKey?: string;
  modelId?: string;
}

export class AnthropicProvider implements AiProvider {
  readonly id = "anthropic" as const;
  private model: any;

  constructor(config: AnthropicProviderConfig = {}) {
    const anthropic = createAnthropic({
      apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
    // Default to Fable 5 — the most capable generally available Claude model.
    this.model = anthropic(config.modelId ?? "claude-fable-5");
  }

  completeStructured<T>(
    args: CompleteStructuredArgs<T>,
  ): Promise<CompleteStructuredResult<T>> {
    // NOTE: extended thinking is intentionally NOT enabled here. The AI SDK's
    // structured-output path forces a specific tool choice to pin the schema,
    // and Anthropic rejects a forced tool_choice while extended thinking is on.
    // Fable 5 produces strong slot-level overrides without it; re-enable via a
    // thinking-compatible structured strategy if deeper reasoning is needed.
    void args.reasoningEffort;
    return sdkCompleteStructured(this.model, args, undefined);
  }
}
