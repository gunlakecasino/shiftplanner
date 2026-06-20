import { z } from "zod";

export const PlacementFitVerdictSchema = z.enum([
  "strong_fit",
  "acceptable",
  "questionable",
  "poor_fit",
  "needs_swap",
  /** Open / unassigned slot — not an engine placement recommendation. */
  "open_gap",
]);

export type PlacementFitVerdict = z.infer<typeof PlacementFitVerdictSchema>;

/** Structured placement-pad analyst output (xAI generateObject). */
export const PlacementPadInsightSchema = z.object({
  /** One-sentence operator verdict shown at top of pad (e.g. "Strong fit — rotation supports Z3 tonight."). */
  fitSummary: z.string().min(1).max(220),
  fitVerdict: PlacementFitVerdictSchema,
  /** Set when xAI changes fitVerdict or fitSummary vs the instant prerender. */
  verdictOverrideReason: z.string().max(280).optional(),
  headline: z.string().min(1).max(200),
  whyTonight: z.string().min(1).max(1200),
  rotationNote: z.string().max(500).optional(),
  swapRecommendations: z
    .array(
      z.object({
        summary: z
          .string()
          .min(1)
          .max(280)
          .describe(
            "Bilateral swap only: both slots must have a TM tonight. Never swap into empty/open/unassigned slots — use rankedAssignees or fitSummary for assigns.",
          ),
        priority: z.enum(["high", "medium", "low"]),
      }),
    )
    .max(3)
    .default([]),
  watchouts: z.array(z.string().max(200)).max(4).default([]),
  neighborDynamics: z.string().max(400).optional(),
  rankedAssignees: z
    .array(
      z.object({
        tmName: z.string().min(1),
        rank: z.number().int().min(1).max(12),
        fitSummary: z.string().min(1).max(320),
        caveats: z.string().max(200).optional(),
      }),
    )
    .max(6)
    .optional(),
});

export type PlacementPadInsight = z.infer<typeof PlacementPadInsightSchema>;

/** Minimal schema for a *light / fast* headline determination call (grok-build-0.1).
 * Produces the magic one-liner + a tight, actionable 4-6 bullet synthesis that combines what used to be
 * "instant prerender", "quick determination", and the rotation/swap highlights into one xAI-powered list.
 * This is the default view when you open a card's pad in builder mode.
 * Full rich narrative + advanced swap analysis still comes from explicit "Full 4.3 analysis" (grok-4.3 high).
 */
export const MagicOneLinerSchema = z.object({
  /** The single crisp magic one-liner (e.g. "Melissa belongs on Z3 tonight after RR cleared."). */
  headline: z.string().min(1).max(180),
  /** Optional: the verdict so the corner chip can use its color language immediately. */
  fitVerdict: PlacementFitVerdictSchema.optional(),
  /** Optional short fitSummary for the lift / tooltip. */
  fitSummary: z.string().min(1).max(160).optional(),
  /** 4–6 short, high-signal, operator-actionable bullets.
   * Synthesize across prerender + rotation + spread + neighbors + exposure.
   * Each bullet ≤ 110 chars. No generic advice; name specific people/slots when relevant.
   * Examples of good bullets: "0× on Z3 in last 30 — fresh", "Sheri O on Z5 has been there 4× recently (swap candidate)", "No open spread gaps; strong continuity".
   */
  bullets: z.array(z.string().min(3).max(110)).min(3).max(6).optional(),
});

export type MagicOneLiner = z.infer<typeof MagicOneLinerSchema>;

/** Lifted xAI fit/insight for corner chip + digital builder surfaces (magic one-line headline etc.).
 * Used for onXaiFit callbacks, xaiFitsByHost state, card props. Null clears.
 * (Centralized here with the rest of the insight schema/types for reuse.)
 */
export type XaiFit = {
  headline?: string;
  fitVerdict?: PlacementFitVerdict | string;
  fitSummary?: string;
} | null;

export function fitVerdictLabel(verdict: PlacementFitVerdict): string {
  switch (verdict) {
    case "strong_fit":
      return "Best";
    case "acceptable":
      return "Okay";
    case "questionable":
      return "Check";
    case "poor_fit":
    case "needs_swap":
      return "Invalid";
    case "open_gap":
      return "—";
    default:
      return "Fit";
  }
}

export function fitVerdictStyles(verdict: PlacementFitVerdict): {
  border: string;
  bg: string;
  text: string;
  badge: string;
} {
  switch (verdict) {
    case "strong_fit":
      return {
        border: "transparent",
        bg: "#34C759",
        text: "#FFFFFF",
        badge: "bg-[#34C759] text-white",
      };
    case "acceptable":
      return {
        border: "transparent",
        bg: "#00C0E8",
        text: "#FFFFFF",
        badge: "bg-[#00C0E8] text-white",
      };
    case "questionable":
      return {
        border: "transparent",
        bg: "#FF8D28",
        text: "#FFFFFF",
        badge: "bg-[#FF8D28] text-white",
      };
    case "poor_fit":
    case "needs_swap":
      return {
        border: "transparent",
        bg: "#FF383C",
        text: "#FFFFFF",
        badge: "bg-[#FF383C] text-white",
      };
    case "open_gap":
      return {
        border: "rgba(0,0,0,0.1)",
        bg: "rgba(0,0,0,0.03)",
        text: "rgb(107,114,128)",
        badge: "bg-neutral-100 text-neutral-600",
      };
    default:
      return {
        border: "rgba(0,0,0,0.08)",
        bg: "rgba(0,0,0,0.02)",
        text: "rgb(64,64,64)",
        badge: "bg-neutral-100 text-neutral-700",
      };
  }
}

export function formatPlacementPadInsightText(insight: PlacementPadInsight): string {
  const lines: string[] = [
    `${fitVerdictLabel(insight.fitVerdict)}: ${insight.fitSummary}`,
    "",
    insight.headline,
    "",
    insight.whyTonight,
  ];

  if (insight.rotationNote?.trim()) {
    lines.push("", `Rotation: ${insight.rotationNote.trim()}`);
  }
  if (insight.neighborDynamics?.trim()) {
    lines.push("", `Neighbors: ${insight.neighborDynamics.trim()}`);
  }
  if (insight.swapRecommendations.length > 0) {
    lines.push("", "Swap lanes:");
    for (const s of insight.swapRecommendations) {
      const tag = s.priority === "high" ? "★" : s.priority === "medium" ? "·" : "○";
      lines.push(`${tag} ${s.summary}`);
    }
  }
  if (insight.watchouts.length > 0) {
    lines.push("", "Watchouts:");
    for (const w of insight.watchouts) {
      lines.push(`• ${w}`);
    }
  }
  if (insight.rankedAssignees?.length) {
    lines.push("", "Ranked assignees:");
    const sorted = [...insight.rankedAssignees].sort((a, b) => a.rank - b.rank);
    for (const r of sorted) {
      const cave = r.caveats ? ` (${r.caveats})` : "";
      lines.push(`${r.rank}. ${r.tmName} — ${r.fitSummary}${cave}`);
    }
  }

  return lines.join("\n");
}