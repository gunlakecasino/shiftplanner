"use client";

import * as React from "react";
import { Star, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimefoldProposal } from "@/lib/shiftbuilder/timefold/timefoldTypes";

export interface TimefoldProposalCardProps {
  proposal: TimefoldProposal;
  selected: boolean;
  onSelect: () => void;
}

/**
 * One selectable proposal — velvet glass card with a gold ★ crest on the
 * rank-1 winner and the projected health score as a small ring gauge.
 */
export function TimefoldProposalCard({
  proposal,
  selected,
  onSelect,
}: TimefoldProposalCardProps) {
  const isBest = proposal.rank === 1;
  const score = Math.max(0, Math.min(100, proposal.score));

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full flex-col gap-2 rounded-2xl p-4 text-left transition-[transform,box-shadow,background] duration-150 active:scale-[0.99]",
      )}
      style={{
        // Placement-pad card: crisp white, gray-100 border; selected → optimize blue wash + ring (Velvet redesign).
        background: selected ? "var(--sb-optimize-tint)" : "#ffffff",
        border: `1px solid ${selected ? "var(--sb-optimize-border)" : "#f0f0f0"}`,
        boxShadow: selected
          ? "0 4px 16px -6px color-mix(in srgb, var(--sb-optimize-ink) 40%, transparent), 0 0 0 1px var(--sb-optimize-border)"
          : "0 1px 3px rgba(0,0,0,0.05), 0 4px 16px -6px rgba(0,0,0,0.08)",
      }}
    >
      <div className="flex items-center gap-2.5">
        {isBest && (
          <span
            aria-label="Recommended proposal"
            className="flex size-5 shrink-0 items-center justify-center rounded-full"
            style={{
              background: "var(--sb-optimize-tint)",
              border: "1px solid var(--sb-optimize-border)",
            }}
          >
            <Star size={10} className="fill-current" style={{ color: "var(--sb-optimize-ink)" }} />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-bold tracking-[-0.01em] text-foreground">
          {proposal.title}
        </span>
        {/* Projected rotation-health ring — conic gauge, tabular readout. (Velvet redesign) */}
        <span
          className="relative flex size-9 shrink-0 items-center justify-center rounded-full"
          title={`Projected rotation health ${score}%`}
          style={{
            background: `conic-gradient(${selected || isBest ? "var(--sb-optimize-ink)" : "var(--muted-foreground)"} ${score * 3.6}deg, #f3f4f6 0deg)`,
          }}
          aria-label={`Projected rotation health ${score} percent`}
        >
          <span
            className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold tabular-nums text-foreground"
            style={{
              background: "#fff",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9)",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {score}
          </span>
        </span>
      </div>
      <p className="text-[12px] leading-snug text-muted-foreground">{proposal.summary}</p>
      {selected && (
        <div
          className="flex items-center gap-1 text-[11px] font-semibold"
          style={{ color: "var(--sb-optimize-ink)" }}
        >
          Viewing this proposal <ArrowRight size={11} />
        </div>
      )}
    </button>
  );
}
