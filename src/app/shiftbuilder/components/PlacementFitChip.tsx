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

  const chipClass = isXai 
    ? "sb-fit-chip no-print inline-flex max-w-[118px] items-center justify-center rounded-full px-1 py-px text-[8px] font-semibold tracking-wide whitespace-nowrap leading-none" 
    : compact
      ? "inline-flex items-center px-1 py-px rounded-full text-[8px] font-semibold tracking-wide whitespace-nowrap leading-none"
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
        // Tiny premium pop for the fit/xAI chip on appear/update — builder visual sugar only.
      >
        {isXai && <span className="opacity-60 mr-px" style={{ fontSize: "6.5px", letterSpacing: "0" }}>✧</span>}
        {displayText}
      </motion.span>
    </AnimatePresence>
  );
}