"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { XaiFit } from "@/lib/shiftbuilder/placementPadInsightSchema";
import { premiumSpring } from "@/lib/premiumSpring";

/**
 * Tap-to-open verdict popover. The dot's title-tooltip is hover-only — useless on
 * iPad, the primary device — so the verdict label, summary, and fact line get a
 * touch-reachable surface. Portaled to body so card overflow-hidden can't clip it.
 */
function FitDotPopover({
  anchor,
  label,
  summary,
  factLine,
  accent,
  onClose,
}: {
  anchor: DOMRect;
  label: string;
  summary: string;
  factLine?: string;
  accent: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      const el = document.getElementById("sb-fit-dot-popover");
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismiss, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const width = 240;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, anchor.left - width / 2));
  const openUp = anchor.top > window.innerHeight * 0.6;

  return createPortal(
    <div
      id="sb-fit-dot-popover"
      role="dialog"
      aria-label={`Rotation fit: ${label}`}
      className="fixed z-[210] flex flex-col gap-1 rounded-xl p-2.5 shadow-2xl"
      style={{
        left,
        width,
        ...(openUp
          ? { bottom: window.innerHeight - anchor.top + 8 }
          : { top: anchor.bottom + 8 }),
        background: "var(--sb-glass)",
        backdropFilter: "var(--sb-glass-blur)",
        WebkitBackdropFilter: "var(--sb-glass-blur)",
        border: "1px solid var(--sb-glass-border)",
        boxShadow: "inset 0 1px 0 var(--sb-glass-highlight), 0 14px 34px -14px rgba(0,0,0,0.5)",
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: accent }}
        />
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-foreground">
          {label}
        </span>
      </div>
      <div className="text-[11.5px] leading-snug text-foreground/90">{summary}</div>
      {factLine ? (
        <div className="text-[10px] leading-snug text-muted-foreground">{factLine}</div>
      ) : null}
    </div>,
    document.body,
  );
}

export function isCriticalRepeatFit(
  fit?: PrerenderedPlacementFit | null,
): boolean {
  return fit?.fitVerdict === "critical_repeat";
}

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
  const [popoverAnchor, setPopoverAnchor] = React.useState<DOMRect | null>(null);
  const popoverOpen = popoverAnchor !== null;

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
    ? (xaiFit?.headline ? xaiFit.headline.slice(0, 20) + (xaiFit.headline.length > 20 ? "…" : "") : "xAI")
    : label;

  const isFitVerdict = [
    "strong_fit",
    "acceptable",
    "questionable",
    "critical_repeat",
    "poor_fit",
    "needs_swap",
  ].includes(effectiveVerdict);

  // Card rotation-health glance: colored dot; tap opens the verdict popover
  // (label + summary + fact line) so touch operators get what hover users get.
  if (!isXai && isFitVerdict) {
    const dotBg = styles.bg || "#6B7280";
    const dotSize = compact ? 10 : 11;

    return (
      <AnimatePresence>
        <motion.button
          key={effectiveVerdict}
          type="button"
          className="sb-fit-dot no-print inline-flex flex-shrink-0 cursor-pointer appearance-none items-center justify-center border-0 p-0"
          aria-label={`Rotation fit: ${label} — tap for details`}
          aria-expanded={popoverOpen}
          style={{
            width: dotSize,
            height: dotSize,
            background: dotBg,
            boxShadow: "0 1px 2px rgba(0, 0, 0, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.35)",
            borderRadius: "50%",
          }}
          title={title}
          onClick={(e) => {
            e.stopPropagation();
            // Read the rect synchronously — e.currentTarget is nulled once the
            // handler returns, and the state updater runs after that.
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setPopoverAnchor((prev) => (prev ? null : rect));
          }}
          onPointerDown={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.75 }}
          transition={premiumSpring}
        />
        {popoverOpen && popoverAnchor && (
          <FitDotPopover
            anchor={popoverAnchor}
            label={label}
            summary={effectiveSummary}
            factLine={effectiveFact || undefined}
            accent={dotBg}
            onClose={() => setPopoverAnchor(null)}
          />
        )}
      </AnimatePresence>
    );
  }

  if (compact && !isXai) {
    return null;
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