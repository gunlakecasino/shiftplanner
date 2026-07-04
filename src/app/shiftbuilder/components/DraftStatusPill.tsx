"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";

export interface DraftStatusPillProps {
  /** Number of unapplied draft slot changes. */
  count: number;
  /** Disables actions while the engine is running / a commit is in flight. */
  applying?: boolean;
  onApply: () => void;
  onDiscard: () => void;
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
  onApply,
  onDiscard,
}) => {
  if (typeof document === "undefined") return null;

  const hasChanges = count > 0;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="sb-draft-pill no-print fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pl-3.5 pr-1.5 shadow-2xl"
      style={{
        background: "var(--sb-glass)",
        backdropFilter: "var(--sb-glass-blur)",
        WebkitBackdropFilter: "var(--sb-glass-blur)",
        border: "1px solid var(--sb-gold-border)",
        boxShadow:
          "inset 0 1px 0 var(--sb-glass-highlight), 0 12px 32px -12px rgba(0,0,0,0.45)",
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
        <button
          type="button"
          onClick={onApply}
          disabled={applying}
          aria-label={`Apply ${count} draft change${count === 1 ? "" : "s"} to the live board`}
          className="flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-semibold transition-opacity disabled:opacity-50"
          style={{
            background: "var(--sb-gold-surface)",
            color: "var(--sb-gold-ink)",
            border: "1px solid var(--sb-gold-border)",
          }}
        >
          <Check size={12} strokeWidth={2.5} /> Apply to Live
        </button>
      )}
      <button
        type="button"
        onClick={onDiscard}
        disabled={applying}
        aria-label="Discard draft and keep the live board as is"
        title="Discard draft — the live board stays as it is"
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        <X size={12} strokeWidth={2.5} /> Discard
      </button>
    </div>,
    document.body,
  );
};

export default DraftStatusPill;
