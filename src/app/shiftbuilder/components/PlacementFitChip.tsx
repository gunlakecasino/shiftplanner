"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { XaiFit } from "@/lib/shiftbuilder/placementPadInsightSchema";
import { premiumSpring } from "@/lib/premiumSpring";

export type PlacementFitChipProps = {
  /** Same prerender the placement pad instant block uses. */
  fit?: PrerenderedPlacementFit | null;
  /** Optional xAI override from PlacementPad (magic headline + verdict) for powerful deliberate insight surface in corner (per xAI full incorporation). Shows "xAI" badge + uses xAI verdict/summary when present. */
  xaiFit?: XaiFit;
  /** Use more compact sizing (for card headers) */
  compact?: boolean;
};

/** Screen-only rotation fit glance — excluded from print via `no-print`. */
export function PlacementFitChip({ fit, xaiFit, compact = false }: PlacementFitChipProps) {
  if (!fit && !xaiFit) return null;

  // Prefer xAI override for powerful deliberate insight in corner (magic one line surface)
  const effectiveVerdict = (xaiFit?.fitVerdict as any) || fit?.fitVerdict || "open_gap";
  const effectiveSummary = xaiFit?.fitSummary || fit?.fitSummary || "";
  const effectiveFact = fit?.fitFactLine || "";
  const isXai = !!xaiFit;

  const styles = fitVerdictStyles(effectiveVerdict);
  const label = fitVerdictLabel(effectiveVerdict);
  const title = isXai
    ? (xaiFit?.headline ? `${xaiFit.headline}\n${effectiveSummary}\n(xAI reasoned from board/week context + your Gold examples where relevant)` : effectiveSummary)
    : (effectiveFact ? `${effectiveSummary}\n${effectiveFact}` : effectiveSummary);

  const displayText = isXai 
    ? (xaiFit?.headline ? xaiFit.headline.slice(0, 20) + (xaiFit.headline.length > 20 ? '…' : '') : 'xAI')
    : label;

  // New pill styles (Best / Okay / Check / Invalid) for card headers (compact).
  // Matches the provided pill_bestPlacement / pill_okayPlacement / pill_CheckPlacement / pill_InvalidPlacement specs.
  // 30% smaller than original, then +10% from that.
  if (compact && !isXai) {
    if (effectiveVerdict === "open_gap") return null;
    // Fixed-size vibrant pills (46.2×15.4, ~20px radius, scaled shadow, white Inter 800 @9.24px/11.55px)
    const pillBg = styles.bg || '#6B7280';

    return (
      <AnimatePresence>
        <motion.span
          key={effectiveVerdict}
          className="no-print inline-flex flex-shrink-0 items-center justify-center overflow-hidden"
          style={{
            width: "46.2px",
            height: "15.4px",
            background: pillBg,
            boxShadow: "0px 3.08px 3.08px rgba(0, 0, 0, 0.25)",
            borderRadius: "20px",
            fontFamily: "'Inter', 'Inter Tight', system-ui, -apple-system, sans-serif",
            fontWeight: 800,
            fontSize: "9.24px",
            lineHeight: "11.55px",
            color: "#FFFFFF",
            letterSpacing: "-0.1px",
          }}
          title={title}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.85, y: 0.5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={premiumSpring}
        >
          {displayText}
        </motion.span>
      </AnimatePresence>
    );
  }

  // Non-compact (Placement Pad, Overlap slots, xAI insight surfaces, etc.)
  // Use a pill-style treatment that echoes the card compact pills (solid color + shadow + white text).
  // Size is 30% smaller than spec + 10% (≈77% of original).
  const isFitVerdict = ["strong_fit", "acceptable", "questionable", "poor_fit", "needs_swap"].includes(effectiveVerdict);

  if (!isXai && isFitVerdict) {
    const pillBg = styles.bg || '#6B7280';
    return (
      <AnimatePresence>
        <motion.span
          key={effectiveVerdict}
          className="no-print inline-flex items-center justify-center rounded-[15.4px] px-1.5 text-[7.7px] font-extrabold leading-none flex-shrink-0"
          style={{
            height: "13.86px",
            background: pillBg,
            boxShadow: "0px 2.31px 2.31px rgba(0, 0, 0, 0.2)",
            fontFamily: "'Inter', system-ui, sans-serif",
            color: "#FFFFFF",
          }}
          title={title}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={premiumSpring}
        >
          {displayText}
        </motion.span>
      </AnimatePresence>
    );
  }

  const chipClass = isXai 
    ? "sb-fit-chip no-print inline-flex max-w-[118px] items-center justify-center rounded-full px-1 py-px text-[8px] font-semibold tracking-wide whitespace-nowrap leading-none" 
    : "inline-flex items-center px-1.5 py-[2px] rounded-full text-[9.5px] font-semibold tracking-wide whitespace-nowrap leading-none";

  return (
    <AnimatePresence>
      <motion.span
        key={isXai ? "xai" : effectiveVerdict}
        className={chipClass}
        style={{
          background: styles.bg,
          color: styles.text,
          border: `1px solid ${styles.border}`,
          fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        }}
        title={title + (isXai ? "  ·  xAI insight loaded in builder; hidden in print-preview/PDF" : "")}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.8, y: 1 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85 }}
        transition={premiumSpring}
      >
        {isXai && <span className="opacity-60 mr-px" style={{ fontSize: "6.5px", letterSpacing: "0" }}>✧</span>}
        {displayText}
      </motion.span>
    </AnimatePresence>
  );
}