"use client";

import React from "react";
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
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
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
        ...(builderCalm || goldBanner
          ? {}
          : { position: "absolute", bottom: 0, left: 0, right: 0 }),
        background: goldBanner
          ? "var(--sb-gold-surface)"
          : builderCalm
            ? `color-mix(in srgb, ${accent} 65%, var(--ios-background-secondary))`
            : accent,
        borderRadius: "0 0 3px 3px",
        paddingTop: 3,
        paddingBottom: 3,
        height: COVERAGE_BAR_H,
        minHeight: COVERAGE_BAR_H,
        zIndex: 2,
        borderTop: goldBanner
          ? "1px solid var(--sb-gold-border)"
          : builderCalm
            ? "1px solid color-mix(in srgb, var(--ios-background-secondary) 20%, transparent)"
            : "1px solid rgba(255,255,255,0.25)",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={task.taskLabel}
    >
      <span
        className="sb-coverage-bar-label font-extrabold uppercase tracking-[0.6px] leading-none truncate"
        style={{
          fontSize: COVERAGE_BAR_FONT_SIZE,
          fontFamily: "var(--font-atkinson)",
          color: goldBanner ? "var(--sb-gold-ink)" : "#ffffff",
        }}
      >
        {task.taskLabel}
      </span>
      {onRemoveTask && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(slotKey, task.taskLabel);
          }}
          className="sb-interactive ml-1 leading-none font-bold flex-shrink-0 transition-all"
          style={{
            color: goldBanner
              ? hovered
                ? "var(--sb-gold-ink)"
                : "color-mix(in srgb, var(--sb-gold-ink) 58%, transparent)"
              : hovered
                ? "var(--ios-white)"
                : "color-mix(in srgb, var(--ios-white) 55%, transparent)",
            fontSize: 13,
            opacity: hovered ? 1 : 0.55,
          }}
          title="Remove coverage"
        >
          ×
        </button>
      )}
    </div>
  );
});

export default CoverageBar;