/**
 * engine/ai/providers/mock.ts — deterministic in-process provider for tests.
 *
 * Lets the AI stage + guard be tested without a network call or API key, and —
 * critically — lets us feed *adversarial* output (illegal overrides, coverage
 * drops, gender violations) to prove the guard can never be talked into breaking
 * a hard rule (invariant I9).
 */

import type {
  AiProvider,
  CompleteStructuredArgs,
  CompleteStructuredResult,
  ToolCallLog,
} from "../provider";
import { EMPTY_USAGE } from "../provider";

export type MockResponder<T = any> = (
  args: CompleteStructuredArgs<T>,
) => T | Promise<T>;

export class MockAiProvider implements AiProvider {
  readonly id = "mock" as const;
  private toolCalls: ToolCallLog[] = [];

  constructor(private responder: MockResponder) {}

  async completeStructured<T>(
    args: CompleteStructuredArgs<T>,
  ): Promise<CompleteStructuredResult<T>> {
    this.toolCalls = [];
    // Optionally exercise the toolset so tool wiring is covered by tests.
    const output = await this.responder(args as CompleteStructuredArgs<any>);
    // Validate against the schema, exactly as a real provider's output would be.
    const parsed = args.schema.parse(output);
    return { output: parsed, usage: EMPTY_USAGE, toolCalls: this.toolCalls };
  }

  /** Test helper — invoke a named tool and record the call. */
  async callTool(args: CompleteStructuredArgs<any>, name: string, toolArgs: unknown) {
    const tool = args.tools?.[name];
    if (!tool) throw new Error(`Mock: no tool named ${name}`);
    const result = await tool.execute(toolArgs as any);
    this.toolCalls.push({ name, args: toolArgs, result });
    return result;
  }
}
