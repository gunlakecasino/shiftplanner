"use client";

import React from "react";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { XaiFit } from "@/lib/shiftbuilder/placementPadInsightSchema";

export type PlacementFitChipProps = {
  /** Same prerender the placement pad instant block uses. */
  fit?: PrerenderedPlacementFit | null;
  /** Optional xAI override from PlacementPad (magic headline + verdict) for powerful deliberate insight surface in corner (per xAI full incorporation). Shows "xAI" badge + uses xAI verdict/summary when present. */
  xaiFit?: XaiFit;
};

/** Screen-only rotation fit glance — excluded from print via `no-print`. */
export function PlacementFitChip({ fit, xaiFit }: PlacementFitChipProps) {
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
    ? "sb-fit-chip no-print inline-flex max-w-[118px] items-center justify-center rounded-[2px] px-1 py-0.5 text-[6.5px] font-medium tracking-[0.2px] leading-none shrink-0 truncate border" 
    : "sb-fit-chip no-print inline-flex max-w-[64px] items-center justify-center rounded px-1 py-px text-[6.5px] font-bold uppercase tracking-[0.4px] leading-none shrink-0 truncate";

  return (
    <span
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
    >
      {isXai && <span className="opacity-60 mr-px" style={{ fontSize: "6.5px", letterSpacing: "0" }}>✧</span>}
      {displayText}
    </span>
  );
}