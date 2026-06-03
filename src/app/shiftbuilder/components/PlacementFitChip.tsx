"use client";

import React from "react";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";

export type PlacementFitChipProps = {
  /** Same prerender the placement pad instant block uses. */
  fit?: PrerenderedPlacementFit | null;
};

/** Screen-only rotation fit glance — excluded from print via `no-print`. */
export function PlacementFitChip({ fit }: PlacementFitChipProps) {
  if (!fit) return null;

  const styles = fitVerdictStyles(fit.fitVerdict);
  const label = fitVerdictLabel(fit.fitVerdict);
  const title = fit.fitFactLine
    ? `${fit.fitSummary}\n${fit.fitFactLine}`
    : fit.fitSummary;

  return (
    <span
      className="no-print inline-flex max-w-[64px] items-center justify-center rounded px-1 py-px text-[6.5px] font-bold uppercase tracking-wide leading-none shrink-0 truncate"
      style={{
        background: styles.bg,
        color: styles.text,
        border: `1px solid ${styles.border}`,
      }}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {label}
    </span>
  );
}