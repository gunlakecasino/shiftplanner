/**
 * /api/complete/[surface]
 *
 * Streaming text-completion endpoint for the ShiftBuilder auto-prediction layer.
 * Uses Vercel AI SDK `streamText` + xAI grok-4.3 (via @ai-sdk/xai).
 *
 * Surfaces:
 *   notes   — Shift Notes textarea (ghost overlay, 400ms debounce)
 *   command — Command Palette free-text input (inline ghost, 250ms debounce)
 *   recap   — Shift Recap textarea (ghost overlay, 500ms debounce)
 *
 * All surfaces use reasoning_effort = "none" to keep p50 latency <300ms.
 * Temperature is kept very low (0.1–0.2) so completions are deterministic
 * continuations, not creative rewrites.
 *
 * Request body shape:
 *   {
 *     prompt:   string,          // text already typed by the operator
 *     context?: ShiftContext      // optional structured shift context
 *   }
 *
 * ShiftContext shape:
 *   {
 *     day?:         string,       // e.g. "Friday"
 *     assignments?: Record<string, { tmId: string; tmName: string }>,
 *     scheduledUnplaced?: string[],  // TM display names not yet placed
 *     loggedEvents?: string[],    // recap log entries (recap surface only)
 *   }
 */

import { streamText } from "ai";
import { createXai } from "@ai-sdk/xai";

export const runtime = "nodejs";

// ─── Surface config ───────────────────────────────────────────────────────────

type Surface = "notes" | "command" | "recap";

interface SurfaceConfig {
  temperature: number;
  maxTokens: number;
  buildSystem: (ctx: ShiftContext) => string;
}

interface ShiftContext {
  day?: string;
  assignments?: Record<string, { tmId?: string; tmName?: string }>;
  scheduledUnplaced?: string[];
  loggedEvents?: string[];
}

const SURFACE_CONFIGS: Record<Surface, SurfaceConfig> = {
  notes: {
    temperature: 0.15,
    maxTokens: 60,
    buildSystem: (ctx) => {
      const dayLine = ctx.day ? `Tonight's shift: ${ctx.day} grave.` : "Grave shift operations tool.";
      const placedCount = ctx.assignments ? Object.keys(ctx.assignments).length : 0;
      const unplacedLine =
        ctx.scheduledUnplaced?.length
          ? `Unplaced TMs: ${ctx.scheduledUnplaced.join(", ")}.`
          : "";
      return [
        "You are a concise completion assistant for a casino grave shift supervisor writing shift notes.",
        dayLine,
        `${placedCount} zone assignments in effect.`,
        unplacedLine,
        "",
        "Rules:",
        "- Continue the supervisor's sentence naturally and briefly (10 words max).",
        "- Use plain operational language. No markdown, no bullet points.",
        "- Never start a new thought — only continue the existing one.",
        "- If the text already ends a sentence, output nothing.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },

  command: {
    temperature: 0.10,
    maxTokens: 40,
    buildSystem: (ctx) => {
      const tmList =
        ctx.scheduledUnplaced?.length
          ? `Unplaced TMs tonight: ${ctx.scheduledUnplaced.join(", ")}.`
          : "";
      const assignmentList = ctx.assignments
        ? Object.entries(ctx.assignments)
            .map(([slot, a]) => `${slot}:${a.tmName ?? a.tmId}`)
            .join(", ")
        : "";
      return [
        "You are an autocomplete engine for a casino shift deployment command palette.",
        "The operator is typing a natural-language command like 'assign Joy to Z9' or 'swap Melissa and Cookie'.",
        tmList,
        assignmentList ? `Current assignments: ${assignmentList}.` : "",
        "",
        "Rules:",
        "- Predict ONLY the next 1–5 words that complete the command.",
        "- Prefer real TM names from the unplaced list when a slot name is present.",
        "- Never output a full sentence — just the completion fragment.",
        "- No punctuation at end, no markdown.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },

  recap: {
    temperature: 0.20,
    maxTokens: 80,
    buildSystem: (ctx) => {
      const eventsBlock =
        ctx.loggedEvents?.length
          ? `Logged shift events:\n${ctx.loggedEvents.map((e) => `  • ${e}`).join("\n")}`
          : "";
      const dayLine = ctx.day ? `Shift: ${ctx.day} grave.` : "";
      return [
        "You are a completion assistant for a casino grave-shift supervisor writing their morning recap email.",
        dayLine,
        eventsBlock,
        "",
        "Rules:",
        "- Continue the recap sentence naturally, matching the supervisor's voice.",
        "- Keep completions under 15 words.",
        "- Use plain prose, no markdown, no lists.",
        "- Never fabricate zone names or TM names not present in context.",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ surface: string }> }
) {
  // Validate API key early — fail fast with a clear message.
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "XAI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const { surface: rawSurface } = await params;
  const surface = rawSurface as Surface;

  if (!["notes", "command", "recap"].includes(surface)) {
    return new Response(
      JSON.stringify({ error: `Unknown completion surface: ${rawSurface}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  let body: { prompt?: string; context?: ShiftContext };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { prompt = "", context = {} } = body;

  // Nothing to complete — return empty stream rather than wasting a call.
  if (!prompt.trim() || prompt.trim().length < 3) {
    return new Response("", { status: 200 });
  }

  const cfg = SURFACE_CONFIGS[surface];
  const systemPrompt = cfg.buildSystem(context);

  const xai = createXai({ apiKey });
  const model = xai("grok-4.3");

  try {
    const result = streamText({
      model,
      system: systemPrompt,
      prompt,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
      providerOptions: {
        // reasoning_effort = "none" → instant raw generation, no chain-of-thought.
        // This is intentional for sub-300ms ghost-text latency.
        xai: { reasoningEffort: "none" },
      },
    });

    return result.toDataStreamResponse();
  } catch (err: any) {
    console.error("[complete] streamText error:", err?.message ?? err);
    return new Response(
      JSON.stringify({ error: "Completion failed", detail: err?.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
