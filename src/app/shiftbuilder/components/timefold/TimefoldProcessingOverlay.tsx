"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, X, Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TimefoldProgressTick } from "@/lib/shiftbuilder/timefold/timefoldTypes";

export interface TimefoldProcessingOverlayProps {
  visible: boolean;
  tick: TimefoldProgressTick | null;
  onCancel: () => void;
  onAskGrok?: () => void;
}

function portalToBody(node: React.ReactNode): React.ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

/**
 * Legacy full-screen processing overlay (superseded by RotationHealthFloater).
 * Progress now renders on the rotation-health engine drawer so the board stays visible.
 * Kept for reference / optional reuse — not mounted in ShiftBuilderClient.
 */
export function TimefoldProcessingOverlay({
  visible,
  tick,
  onCancel,
  onAskGrok,
}: TimefoldProcessingOverlayProps) {
  if (!visible) return null;

  const percent = tick?.percent ?? 0;
  const constraints = tick?.constraints ?? [];

  const shell = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Deep Optimize with Timefold — running"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        background: "rgba(10, 10, 12, 0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="relative flex w-full max-w-md flex-col gap-5 rounded-3xl p-6 shadow-2xl"
        style={{
          background: "var(--sb-glass)",
          backdropFilter: "var(--sb-glass-blur)",
          WebkitBackdropFilter: "var(--sb-glass-blur)",
          border: "1px solid var(--sb-glass-border)",
          boxShadow:
            "inset 0 1px 0 var(--sb-glass-highlight), 0 24px 60px -20px rgba(0,0,0,0.55)",
          // Portaled to <body>; match the builder-canvas typeface like the results sheet.
          fontFamily: "var(--font-builder, 'Helvetica Neue', Helvetica, Arial, sans-serif)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--sb-optimize-tint)", border: "1px solid var(--sb-optimize-border)" }}
          >
            <Loader2
              size={18}
              className="animate-spin motion-reduce:animate-none"
              style={{ color: "var(--sb-optimize-ink)" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-foreground">
              Deep Optimizing Weekly…
            </div>
            <div className="truncate text-[12px] text-muted-foreground" aria-live="polite">
              {tick?.headline ?? "Reading tonight's board…"}
            </div>
          </div>
          <div
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground"
            style={{ background: "var(--muted)" }}
          >
            {tick ? `${tick.etaSeconds}s left` : "…"}
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5">
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${percent}%`,
                background:
                  "linear-gradient(90deg, #007AFF, #339CFF)",
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{percent}% complete</span>
            <span>Iteration {tick?.iteration.toLocaleString() ?? 0}</span>
          </div>
        </div>

        {/* Score climb */}
        <div
          className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: "var(--muted)" }}
        >
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Best score
            </div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">
              {tick ? tick.bestScore.toFixed(1) : "—"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Current
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">
              {tick ? tick.score.toFixed(1) : "—"}
            </div>
          </div>
        </div>

        {/* Constraint status */}
        <div className="flex flex-col gap-1.5">
          {constraints.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-[12px]">
              {c.status === "satisfied" ? (
                <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
              ) : (
                <AlertTriangle size={14} className="shrink-0 text-amber-500" />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground/80">{c.label}</span>
              {c.detail && (
                <span className="shrink-0 text-muted-foreground">{c.detail}</span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            title="Stop the solver — your board stays exactly as it is"
          >
            <X size={14} /> Cancel — keep board
          </Button>
          {onAskGrok && (
            <Button variant="secondary" className="flex-1" onClick={onAskGrok}>
              <Sparkles size={14} /> Ask Grok for insights
            </Button>
          )}
        </div>
      </div>
    </div>
  );

  return portalToBody(shell);
}
