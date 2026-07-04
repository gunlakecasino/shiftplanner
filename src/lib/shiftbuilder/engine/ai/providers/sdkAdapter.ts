/**
 * engine/ai/providers/sdkAdapter.ts — shared Vercel-AI-SDK plumbing.
 *
 * Both real adapters (xai, anthropic) share one flow: if tools are supplied,
 * run a bounded tool-use pass (generateText) so the model can gather facts from
 * the live engine (eligibility, scores, rotation previews), then produce the
 * final schema-valid object (generateObject) with those findings folded in.
 * Only the model instance and provider-specific options differ per vendor — the
 * seam that keeps the layer provider-agnostic (N5).
 */

import { generateObject, generateText, tool as aiTool } from "ai";
import type {
  AiToolset,
  CompleteStructuredArgs,
  CompleteStructuredResult,
  ToolCallLog,
  TokenUsage,
} from "../provider";
import { EMPTY_USAGE } from "../provider";

function toSdkTools(tools: AiToolset): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, t] of Object.entries(tools)) {
    out[name] = aiTool({
      description: t.description,
      parameters: t.parameters as any,
      execute: async (args: any) => t.execute(args),
    });
  }
  return out;
}

function mapUsage(u: any): TokenUsage {
  if (!u) return { ...EMPTY_USAGE };
  return {
    promptTokens: u.promptTokens ?? u.inputTokens ?? 0,
    completionTokens: u.completionTokens ?? u.outputTokens ?? 0,
    totalTokens: u.totalTokens ?? 0,
  };
}

export async function sdkCompleteStructured<T>(
  model: any,
  args: CompleteStructuredArgs<T>,
  providerOptions: Record<string, unknown> | undefined,
): Promise<CompleteStructuredResult<T>> {
  const toolCalls: ToolCallLog[] = [];
  let augmentedPrompt = args.prompt;
  let usageAcc: TokenUsage = { ...EMPTY_USAGE };

  if (args.tools && Object.keys(args.tools).length > 0) {
    const explore = await generateText({
      model,
      system: args.system,
      prompt: args.prompt,
      tools: toSdkTools(args.tools),
      maxSteps: 6,
      maxTokens: args.maxTokens,
      abortSignal: args.abortSignal,
      ...(providerOptions ? { providerOptions } : {}),
    } as any);

    for (const step of (explore as any).steps ?? []) {
      for (const call of step.toolCalls ?? []) {
        const res = (step.toolResults ?? []).find((r: any) => r.toolCallId === call.toolCallId);
        toolCalls.push({ name: call.toolName, args: call.args, result: res?.result });
      }
    }
    const exploreUsage = mapUsage((explore as any).usage);
    usageAcc = addUsage(usageAcc, exploreUsage);
    if ((explore as any).text) {
      augmentedPrompt = `${args.prompt}\n\n=== TOOL FINDINGS ===\n${(explore as any).text}`;
    }
  }

  const result = await generateObject({
    model,
    schema: args.schema as any,
    system: args.system,
    prompt: augmentedPrompt,
    maxTokens: args.maxTokens,
    abortSignal: args.abortSignal,
    ...(providerOptions ? { providerOptions } : {}),
  } as any);

  usageAcc = addUsage(usageAcc, mapUsage((result as any).usage));
  return { output: (result as any).object as T, usage: usageAcc, toolCalls };
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}
