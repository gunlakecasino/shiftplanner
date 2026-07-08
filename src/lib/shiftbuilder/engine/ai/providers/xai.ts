/**
 * engine/ai/providers/xai.ts — the xAI (Grok) adapter.
 *
 * The ONLY module besides its Anthropic sibling that may import a vendor SDK
 * (N5). Ports the model creation from the legacy grokClient.ts and maps our
 * `AiReasoningEffort` onto xAI's `providerOptions.xai.reasoningEffort`.
 */

import { createXai } from "@ai-sdk/xai";
import type {
  AiProvider,
  CompleteStructuredArgs,
  CompleteStructuredResult,
} from "../provider";
import { sdkCompleteStructured } from "./sdkAdapter";

export interface XaiProviderConfig {
  apiKey?: string;
  modelId?: string;
}

export class XaiProvider implements AiProvider {
  readonly id = "xai" as const;
  private model: any;

  constructor(config: XaiProviderConfig = {}) {
    const xai = createXai({ apiKey: config.apiKey ?? process.env.XAI_API_KEY });
    this.model = xai(config.modelId ?? "grok-4.3");
  }

  completeStructured<T>(
    args: CompleteStructuredArgs<T>,
  ): Promise<CompleteStructuredResult<T>> {
    const providerOptions =
      args.reasoningEffort !== "none"
        ? { xai: { reasoningEffort: args.reasoningEffort } }
        : undefined;
    return sdkCompleteStructured(this.model, args, providerOptions);
  }
}
