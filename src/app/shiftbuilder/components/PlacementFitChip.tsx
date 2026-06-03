"use client";

import React from "react";
import {
  fitVerdictStyles,
  type PlacementFitVerdict,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";

const CHIP_LABEL: Record<PlacementFitVerdict, string> = {
  strong_fit: "Strong",
  acceptable: "OK",
  questionable: "Check",
  poor_fit: "No",
  needs_swap: "Swap",
};

function chipMicroHint(fit: PrerenderedPlacementFit): string | null {
  const line = fit.fitFactLine;
  if (!line) return null;
  const parts = line.split(" · ");
  for (const p of parts) {
    if (/^\d+×/.test(p)) return p.replace(/ in last 30$/, "");
    if (p.startsWith("gaps:")) return "gap";
    if (p.includes("swap")) return "↔";
    if (p.startsWith("8w=")) return p;
  }
  return null;
}

export type PlacementFitChipProps = {
  fit: PrerenderedPlacementFit | null | undefined;
  /** Shown while histories load for assigned slots. */
  loading?: boolean;
  /** Unassigned slot awaiting pick. */
  empty?: boolean;
};

/** Screen-only rotation fit glance — excluded from print via `no-print`. */
export function PlacementFitChip({ fit, loading, empty }: PlacementFitChipProps) {
  if (loading) {
    return (
      <span
        className="no-print inline-flex max-w-[52px] items-center justify-center rounded px-1 py-px text-[7px] font-bold uppercase tracking-wide text-neutral-400 bg-neutral-100/90"
        title="Loading rotation fit"
        aria-hidden
      >
        …
      </span>
    );
  }

  if (!fit) {
    if (!empty) return null;
    return (
      <span
        className="no-print inline-flex max-w-[52px] items-center justify-center rounded px-1 py-px text-[7px] font-bold uppercase tracking-wide text-neutral-500 bg-neutral-100/90 border border-dashed border-neutral-300/80"
        title="Unassigned — open pad for best pick"
      >
        Pick
      </span>
    );
  }

  const styles = fitVerdictStyles(fit.fitVerdict);
  const label = CHIP_LABEL[fit.fitVerdict] ?? "Fit";
  const hint = chipMicroHint(fit);
  const title = `${fit.fitSummary}${fit.fitFactLine ? `\n${fit.fitFactLine}` : ""}`;

  return (
    <span
      className="no-print inline-flex max-w-[72px] items-center gap-0.5 rounded px-1 py-px text-[7px] font-bold uppercase tracking-wide leading-none shrink-0"
      style={{
        background: styles.bg,
        color: styles.text,
        border: `1px solid ${styles.border}`,
      }}
      title={title}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="truncate">{label}</span>
      {hint ? (
        <span className="font-semibold tabular-nums opacity-80 truncate" style={{ fontSize: 6.5 }}>
          {hint}
        </span>
      ) : null}
    </span>
  );
}