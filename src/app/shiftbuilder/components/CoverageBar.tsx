"use client";

import React from "react";
import { X } from "lucide-react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  COVERAGE_BAR_FONT_SIZE,
  COVERAGE_BAR_H,
  isGoldAccent,
} from "@/lib/shiftbuilder/constants";

/**
 * CoverageBar — rendered at the very bottom of a zone or RR card to show
 * that the TM is pulling double duty covering another slot.
 * Background is the accent color of the SOURCE slot.
 */
const CoverageBar = React.memo(function CoverageBar({
  task,
  slotKey,
  onRemoveTask,
  builderCalm = false,
}: {
  task: NightSlotTask;
  slotKey: string;
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void;
  /** Softer saturation in live builder — print/preview stays full strength. */
  builderCalm?: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  const accent = task.color || "#6B7280";
  const goldBanner = isGoldAccent(accent);

  return (
    <div
      className={`sb-coverage-bar group flex items-center justify-between px-2 select-none ${builderCalm ? "sb-coverage-bar--builder-calm" : ""} ${goldBanner ? "sb-coverage-bar--gold-accent" : ""}`}
      style={{
        background: goldBanner
          ? "var(--sb-gold-surface)"
          : builderCalm
            ? `color-mix(in srgb, ${accent} 55%, var(--ios-background-secondary))`
            : accent,
        borderRadius: "0 0 6px 6px",
        paddingTop: 2,
        paddingBottom: 2,
        height: COVERAGE_BAR_H,
        minHeight: COVERAGE_BAR_H,
        zIndex: 1,
        borderTop: goldBanner
          ? "1px solid var(--sb-gold-border)"
          : "1px solid rgba(0,0,0,0.06)",
        boxShadow: builderCalm ? "none" : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={task.taskLabel}
    >
      <span
        className="sb-coverage-bar-label font-semibold uppercase tracking-[0.3px] leading-none truncate"
        style={{
          fontSize: COVERAGE_BAR_FONT_SIZE,
          fontFamily: "var(--font-atkinson)",
          color: goldBanner ? "var(--sb-gold-ink)" : "#ffffff",
          opacity: builderCalm ? 0.75 : 0.95,
        }}
      >
        {builderCalm ? task.taskLabel.replace(/^AND\s+/i, '+ ') : task.taskLabel}
      </span>
      {onRemoveTask && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(slotKey, task.taskLabel, task.id);
          }}
          className="sb-interactive ml-1 leading-none font-bold flex-shrink-0 transition-all sb-tablet-touch-target"
          style={{
            color: goldBanner
              ? hovered
                ? "var(--sb-gold-ink)"
                : "color-mix(in srgb, var(--sb-gold-ink) 58%, transparent)"
              : hovered
                ? "var(--ios-white)"
                : "color-mix(in srgb, var(--ios-white) 55%, transparent)",
            fontSize: 15,
            opacity: hovered ? 1 : 0.6,
            padding: "2px 6px",
            minWidth: 28,
            minHeight: 28,
            borderRadius: 4,
          }}
          title="Remove coverage"
          aria-label={`Remove coverage: ${task.taskLabel}`}
        >
          <X size={14} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});

export default CoverageBar;
