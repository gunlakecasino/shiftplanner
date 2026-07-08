/**
 * engine/ai/providers/anthropicDirect.ts — direct Anthropic Messages API adapter.
 *
 * Why not the Vercel AI SDK here: `@ai-sdk/anthropic` unconditionally sends a
 * `temperature` parameter, and Claude Fable 5 rejects any temperature at all
 * (`temperature is deprecated for this model`). Grok tolerated it, which is why
 * the xAI adapter works through the SDK. Rather than fight the SDK's request
 * construction, this adapter calls the Messages API over `fetch` — the exact
 * shape verified working against the live API — with full control over the body:
 * a single forced tool that pins the output schema, and no temperature.
 *
 * Still satisfies the same `AiProvider` interface, so it's a drop-in behind the
 * factory and the provider-agnostic seam (N5) holds.
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  AiProvider,
  CompleteStructuredArgs,
  CompleteStructuredResult,
  TokenUsage,
} from "../provider";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const EMIT_TOOL = "emit_result";

export interface AnthropicDirectConfig {
  apiKey?: string;
  modelId?: string;
}

export class AnthropicDirectProvider implements AiProvider {
  readonly id = "anthropic" as const;
  private apiKey: string;
  private modelId: string;

  constructor(config: AnthropicDirectConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
    // Model is env-configurable so we can run cheaper models (Opus 4.8) during
    // testing/training and switch to Fable 5 for production without a code change.
    // Both use the same adaptive-thinking API, so no per-model branching is needed.
    this.modelId = config.modelId ?? process.env.SHIFTBUILDER_AI_MODEL ?? "claude-fable-5";
  }

  async completeStructured<T>(
    args: CompleteStructuredArgs<T>,
  ): Promise<CompleteStructuredResult<T>> {
    if (!this.apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

    // Convert the Zod output schema to a JSON schema for the tool's input_schema.
    const jsonSchema = zodToJsonSchema(args.schema as any, {
      target: "openApi3",
      $refStrategy: "none",
    }) as Record<string, unknown>;

    // Extended thinking (Fable 5's adaptive model): real internal reasoning
    // before the model emits its overrides. Anthropic forbids a *forced* tool
    // choice while thinking is on, so with thinking we use tool_choice:auto plus
    // a strong instruction to call the tool. Only "none" takes the fast forced
    // path with no thinking.
    const thinking = args.reasoningEffort !== "none";
    const body: Record<string, unknown> = {
      model: this.modelId,
      max_tokens: args.maxTokens ?? 3000,
      system:
        args.system +
        (thinking ? `\n\nReason through the board first, then call ${EMIT_TOOL} exactly once with your overrides.` : ""),
      tools: [
        {
          name: EMIT_TOOL,
          description: "Emit the structured result. Call this tool exactly once.",
          input_schema: jsonSchema,
        },
      ],
      tool_choice: thinking ? { type: "auto" } : { type: "tool", name: EMIT_TOOL },
      messages: [{ role: "user", content: args.prompt }],
    };
    if (thinking) {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort: args.reasoningEffort };
    }

    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: args.abortSignal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ type: string; name?: string; input?: unknown; thinking?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const toolBlock = (data.content ?? []).find(
      (b) => b.type === "tool_use" && b.name === EMIT_TOOL,
    );
    // With tool_choice:auto the model may (rarely) answer without the tool — treat
    // that as "no change proposed" (a safe no-op) rather than an error.
    const rawInput = toolBlock?.input ?? { overrides: [] };
    const output = args.schema.parse(rawInput);

    const thinkingBlock = (data.content ?? []).find((b) => b.type === "thinking");
    const usage: TokenUsage = {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    };

    return {
      output,
      usage,
      toolCalls: thinkingBlock?.thinking
        ? [{ name: "__thinking__", args: {}, result: thinkingBlock.thinking }]
        : [],
    };
  }
}
