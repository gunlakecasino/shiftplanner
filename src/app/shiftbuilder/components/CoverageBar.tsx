"use client";

import React from "react";
import { X } from "lucide-react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  COVERAGE_BAR_FONT_SIZE,
  COVERAGE_BAR_H,
  isGoldAccent,
} from "@/lib/shiftbuilder/constants";
import {
  coverageChipTone,
  formatCanvasCoverageChip,
} from "@/lib/shiftbuilder/canvasPrideLabels";
import {
  uniqueOutgoingCoverageTasks,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";

/**
 * Quiet paper rail for the iPad night desk.
 * Paper band with quiet ink. Color lives in the
 * 8px left tick — not a saturated flood. Print never uses this.
 */
export function CoveragePaperRail({
  label,
  accent,
  title,
  onRemove,
  removeAriaLabel,
}: {
  label: string;
  accent: string;
  title?: string;
  onRemove?: () => void;
  removeAriaLabel?: string;
}) {
  const goldBanner = isGoldAccent(accent);
  const railBg = "#EEF1F6";
  const railInk = "#334155";
  const tickColor = goldBanner ? "var(--sb-gold-ink)" : accent;

  return (
    <div
      className={`sb-coverage-bar sb-coverage-rail ${onRemove ? "sb-coverage-rail--has-remove" : ""} ${goldBanner ? "sb-coverage-bar--gold-accent" : ""}`}
      style={{ background: railBg, color: railInk }}
      title={title ?? label}
    >
      <span
        className="sb-coverage-rail__tick"
        aria-hidden="true"
        style={{ background: tickColor }}
      />
      <span className="sb-coverage-rail__label sb-coverage-bar-label font-semibold leading-none overflow-hidden whitespace-nowrap">
        {label}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="sb-interactive sb-coverage-rail__remove sb-tablet-touch-target leading-none font-bold flex-shrink-0"
          title="Remove coverage"
          aria-label={removeAriaLabel ?? `Remove coverage: ${label}`}
        >
          <X size={14} strokeWidth={2.4} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * CoverageBar — source-slot coverage.
 * Print / preview keeps the full-strength banner (Golden metrics).
 * Live builder (`builderCalm`) uses a quiet inset chip: same info, less alarm.
 */
const CoverageBar = React.memo(function CoverageBar({
  task,
  slotKey,
  onRemoveTask,
  builderCalm = false,
  presentation,
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
  /** iPad night desk uses a full-width paper rail, not a chip. */
  presentation?: "chip" | "rail";
}) {
  const [hovered, setHovered] = React.useState(false);
  const accent = task.color || "#6B7280";
  const goldBanner = isGoldAccent(accent);
  const chipTone = coverageChipTone(accent);
  const useRail = presentation === "rail";
  const label = builderCalm || useRail ? formatCanvasCoverageChip(task.taskLabel, slotKey) : task.taskLabel;

  if (useRail) {
    return (
      <CoveragePaperRail
        label={label}
        accent={accent}
        title={task.taskLabel}
        onRemove={
          onRemoveTask
            ? () => onRemoveTask(slotKey, task.taskLabel, task.id)
            : undefined
        }
        removeAriaLabel={`Remove coverage: ${task.taskLabel}`}
      />
    );
  }

  if (builderCalm) {
    return (
      <div
        className={`sb-coverage-bar sb-coverage-bar--chip sb-coverage-chip group inline-flex items-center max-w-full select-none ${goldBanner ? "sb-coverage-bar--gold-accent" : ""}`}
        style={{
          background: goldBanner ? "var(--sb-gold-surface)" : chipTone.surface,
          color: goldBanner ? "var(--sb-gold-ink)" : chipTone.ink,
          border: `1px solid ${goldBanner ? "var(--sb-gold-border)" : chipTone.border}`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={task.taskLabel}
      >
        <span
          className="sb-coverage-bar-label font-semibold leading-none truncate"
          style={{
            fontSize: 9,
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
            letterSpacing: "0.01em",
          }}
        >
          {label}
        </span>
        {onRemoveTask && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveTask(slotKey, task.taskLabel, task.id);
            }}
            className="sb-interactive ml-0.5 leading-none font-bold flex-shrink-0 transition-opacity sb-tablet-touch-target"
            style={{
              color: "inherit",
              fontSize: 13,
              opacity: hovered ? 0.9 : 0.45,
              padding: "1px 4px",
              minWidth: 22,
              minHeight: 22,
              borderRadius: 4,
            }}
            title="Remove coverage"
            aria-label={`Remove coverage: ${task.taskLabel}`}
          >
            <X size={11} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`sb-coverage-bar group flex items-center justify-between px-2 select-none ${goldBanner ? "sb-coverage-bar--gold-accent" : ""}`}
      style={{
        background: goldBanner ? "var(--sb-gold-surface)" : accent,
        borderRadius: "0 0 6px 6px",
        paddingTop: 2,
        paddingBottom: 2,
        height: COVERAGE_BAR_H,
        minHeight: COVERAGE_BAR_H,
        zIndex: 1,
        borderTop: goldBanner
          ? "1px solid var(--sb-gold-border)"
          : "1px solid rgba(0,0,0,0.06)",
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
          opacity: 0.95,
        }}
      >
        {task.taskLabel}
      </span>
      {onRemoveTask && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(slotKey, task.taskLabel, task.id);
          }}
          className="sb-interactive ml-1 leading-none font-bold flex-shrink-0 transition-opacity sb-tablet-touch-target"
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

/**
 * One coverage skin for Zone / RR / Aux — reserved full-width footer band.
 * Live desk always paints rails (soft rail-tint). Print keeps Golden banners.
 * Visual slot only: does not change coverage ownership or Apply wiring.
 */
export function SeatCoverageFooter({
  slotKey,
  outgoingTasks,
  coveredBy: _incomingCoveredBy = [],
  onRemoveTask,
  reserved = false,
}: {
  slotKey: string;
  outgoingTasks: NightSlotTask[];
  coveredBy?: CoveredByEntry[];
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void;
  /** Keep the footer band even when this seat has no covering chip. */
  reserved?: boolean;
}) {
  // Incoming covered-by lives in the card body. The reserved band is seat-owned
  // covering only — one chip row, never stacked incoming + outgoing candy.
  void _incomingCoveredBy;
  const chips = uniqueOutgoingCoverageTasks(outgoingTasks, slotKey);
  const hasChips = chips.length > 0;
  if (!reserved && !hasChips) return null;

  return (
    <div
      className={`sb-coverage-footer sb-coverage-footer--band sb-coverage-footer--rails shrink-0${hasChips ? "" : " sb-coverage-footer--empty"}`}
      data-coverage-slot={slotKey}
    >
      {hasChips ? (
        <div className="sb-coverage-footer__row">
          {chips.map((task) => (
            <CoverageBar
              key={task.id}
              task={task}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              builderCalm
              presentation="rail"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default CoverageBar;
