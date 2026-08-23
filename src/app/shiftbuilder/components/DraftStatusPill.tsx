"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import {
  APPLY_TO_LIVE_BUSY_LABEL,
  APPLY_TO_LIVE_CONFIRM_LABEL,
  APPLY_TO_LIVE_OPEN_CONFIRM,
} from "@/lib/shiftbuilder/stakesCopy";

export interface DraftStatusPillProps {
  /** Number of unapplied draft slot changes. */
  count: number;
  /** Disables actions while the engine is running / a commit is in flight. */
  applying?: boolean;
  /** Confirm dialog is open — Apply must not look independently live. */
  confirming?: boolean;
  onApply: () => void;
  onDiscard: () => void;
  /** Optional: open review for the current draft changes (e.g. spotlight cards or re-open proposal sheet). */
  onReviewChanges?: () => void;
}

/**
 * Draft Ambiance — the always-visible half of the Draft Mode covenant.
 *
 * Draft safety is architecturally sacred (nothing mutates live), but the mode
 * state itself was only visible inside the engine drawer / nav menu. This pill
 * docks bottom-center whenever Draft Mode is on, so the operator can answer
 * "am I in Draft, and how much is unapplied?" without opening anything.
 * Pairs with the gold `sb-draft-frame-active` ring on the scale viewport.
 *
 * Apply/Discard route through the exact same handlers as the nav + engine
 * drawer (double-confirm, server guards, history) — this is a shortcut, never
 * a second mutation path.
 */
const DraftStatusPill: React.FC<DraftStatusPillProps> = ({
  count,
  applying = false,
  confirming = false,
  onApply,
  onDiscard,
  onReviewChanges,
}) => {
  if (typeof document === "undefined") return null;

  const hasChanges = count > 0;
  const applyLocked = applying || confirming;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="sb-draft-pill no-print fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-3.5 pr-1.5"
      style={{
        background: "var(--sb-glass)",
        backdropFilter: "var(--sb-glass-blur)",
        WebkitBackdropFilter: "var(--sb-glass-blur)",
        border: "1px solid var(--sb-gold-border)",
        boxShadow: "inset 0 1px 0 var(--sb-glass-highlight)",
        fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
      }}
    >
      <span
        aria-hidden
        className="sb-draft-pill-dot size-2 shrink-0 rounded-full"
        style={{ background: "var(--sb-gold-ink)" }}
      />
      <span className="whitespace-nowrap text-[12.5px] font-medium text-foreground tabular-nums">
        {hasChanges
          ? `Draft — ${count} change${count === 1 ? "" : "s"}, nothing live yet`
          : "Draft mode — no changes yet"}
      </span>
      {hasChanges && (
        <>
          <button
            type="button"
            onClick={onApply}
            disabled={applyLocked}
            aria-busy={applyLocked}
            aria-haspopup="dialog"
            aria-expanded={confirming || undefined}
            title={APPLY_TO_LIVE_OPEN_CONFIRM}
            aria-label={`Apply ${count} draft change${count === 1 ? "" : "s"} to the live board — confirm required`}
            className="sb-draft-pill-btn sb-draft-pill-btn--apply flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{
              background: "var(--sb-gold-surface)",
              color: "var(--sb-gold-ink)",
              border: "1px solid var(--sb-gold-border)",
            }}
          >
            <Check size={12} strokeWidth={2.5} /> {applying ? APPLY_TO_LIVE_BUSY_LABEL : APPLY_TO_LIVE_CONFIRM_LABEL}
          </button>
          {onReviewChanges && (
            <button
              type="button"
              onClick={onReviewChanges}
              disabled={applyLocked}
              className="sb-draft-pill-btn flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium border border-transparent"
              style={{ color: "var(--sb-optimize-ink)" }}
              title="Review the proposed optimizer changes on the board (D badges + left bars + 'was:' lines)"
            >
              Review
            </button>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onDiscard}
        disabled={applyLocked}
        aria-label="Discard draft and keep the live board as is"
        title="Discard draft — the live board stays as it is"
        className="sb-draft-pill-btn flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-muted-foreground"
      >
        <X size={12} strokeWidth={2.5} /> Discard
      </button>
    </div>,
    document.body,
  );
};

export default DraftStatusPill;
