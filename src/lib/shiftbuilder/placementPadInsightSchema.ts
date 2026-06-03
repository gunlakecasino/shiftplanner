import { z } from "zod";

export const PlacementFitVerdictSchema = z.enum([
  "strong_fit",
  "acceptable",
  "questionable",
  "poor_fit",
  "needs_swap",
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
        summary: z.string().min(1).max(280),
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

export function fitVerdictLabel(verdict: PlacementFitVerdict): string {
  switch (verdict) {
    case "strong_fit":
      return "Strong fit";
    case "acceptable":
      return "Acceptable";
    case "questionable":
      return "Questionable";
    case "poor_fit":
      return "Poor fit";
    case "needs_swap":
      return "Consider swap";
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
        border: "rgba(22,163,74,0.35)",
        bg: "rgba(22,163,74,0.08)",
        text: "rgb(21,128,61)",
        badge: "bg-emerald-100 text-emerald-800",
      };
    case "acceptable":
      return {
        border: "rgba(37,99,235,0.3)",
        bg: "rgba(37,99,235,0.06)",
        text: "rgb(29,78,216)",
        badge: "bg-blue-100 text-blue-800",
      };
    case "questionable":
      return {
        border: "rgba(217,119,6,0.35)",
        bg: "rgba(251,191,36,0.1)",
        text: "rgb(180,83,9)",
        badge: "bg-amber-100 text-amber-900",
      };
    case "poor_fit":
    case "needs_swap":
      return {
        border: "rgba(220,38,38,0.35)",
        bg: "rgba(254,226,226,0.5)",
        text: "rgb(185,28,28)",
        badge: "bg-red-100 text-red-800",
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