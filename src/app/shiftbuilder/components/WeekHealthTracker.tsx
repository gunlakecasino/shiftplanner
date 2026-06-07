"use client";

import React from "react";
import { rotationHealthFloaterColors } from "./shiftRotationHealth";

export type WeekHealthTrackerProps = {
  visible: boolean;
  weekDailyHealths: Record<string, number>; // dateKey (YYYY-MM-DD) -> health %
  dayDefs: Array<{
    date: Date;
    name: string;
    short?: string;
    index: number;
  }>; // the 7 days
  selectedDayIndex?: number;
  onSelectDay?: (index: number) => void;
  onDismiss: () => void;
  className?: string;
};

/**
 * Persistent but dismissable tracker showing live rotation health % for each day of the current grave week.
 * - One small glass pill per day (Fri–Thu order from DAY_DEFS).
 * - Uses the consistently tracked per-day health (rich captured when available + stable proxies from week repeat data).
 * - Live: Re-renders when weekDailyHealths updates (assignments, fit data, etc. change).
 * - Click a day pill to jump to it.
 * - X button to dismiss (preference saved via parent localStorage).
 * - Re-show via toggle in the main health cluster when dismissed.
 * - Matches the liquid glass / health color language (green >= target, etc.).
 */
export function WeekHealthTracker({
  visible,
  weekDailyHealths,
  dayDefs,
  selectedDayIndex,
  onSelectDay,
  onDismiss,
  className = "",
}: WeekHealthTrackerProps) {
  if (!visible || !dayDefs || dayDefs.length === 0) return null;

  return (
    <div
      className={`no-print sb-glass-pill flex items-center gap-2 rounded-2xl px-3 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.15)] text-[11px] ${className}`}
      style={{
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.15)",
        backdropFilter: "blur(12px)",
      }}
      role="region"
      aria-label="Week rotation health tracker"
    >
      <div className="flex items-center gap-1.5 pr-2 border-r border-white/15 text-[10px] uppercase tracking-[0.5px] opacity-70">
        Week Health
      </div>

      <div className="flex items-center gap-1.5">
        {dayDefs.map((def, index) => {
          const dateKey = def.date ? new Date(def.date).toISOString().slice(0, 10) : "";
          const health = weekDailyHealths[dateKey] ?? null;
          const isSelected = index === selectedDayIndex;
          const colors = rotationHealthFloaterColors(health);

          const label = (def.short || def.name || "").slice(0, 3) || `D${index + 1}`;

          return (
            <button
              key={index}
              onClick={() => onSelectDay?.(index)}
              className={`flex items-center gap-1 rounded-xl px-2 py-1 transition-all active:scale-[0.985] ${
                isSelected ? "ring-1 ring-white/40" : ""
              }`}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                minWidth: 52,
              }}
              title={`${def.name || label}: ${health != null ? health + "%" : "—"} (click to select day)`}
              aria-label={`${label} health ${health != null ? health : "unknown"} percent`}
            >
              <span className="font-medium tabular-nums tracking-[-0.2px] text-[10px] opacity-90">
                {label}
              </span>
              <span
                className="font-mono font-semibold tabular-nums text-[13px] leading-none"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              >
                {health != null ? `${health}` : "—"}
              </span>
              <span className="text-[8px] opacity-60">%</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onDismiss}
        className="ml-1 rounded-full p-1 opacity-60 hover:opacity-100 active:opacity-80 transition-opacity"
        aria-label="Dismiss week health tracker"
        title="Dismiss (you can re-show from the health cluster)"
      >
        <span className="text-[10px] leading-none">✕</span>
      </button>
    </div>
  );
}
