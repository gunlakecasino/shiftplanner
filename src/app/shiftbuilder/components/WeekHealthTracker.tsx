"use client";

import React from "react";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { rotationHealthFloaterColors } from "./shiftRotationHealth";
import { WEEK_HEALTH_TRACKER_BOTTOM_PX } from "./canvasPillGlass";

export type WeekHealthTrackerProps = {
  visible: boolean;
  weekDailyHealths: Record<string, number>; // dateKey (YYYY-MM-DD) -> health %
  dayDefs: Array<{
    date: Date;
    name: string;
    short?: string;
    index: number;
    dateNum?: number;
  }>;
  selectedDayIndex?: number;
  onSelectDay?: (index: number) => void;
  onDismiss?: () => void;
  className?: string;
  /** Full dismissable bar or compact inline strip (WeekLens). */
  variant?: "bar" | "compact";
  /** bar: below the 1056×816 artboard (inline). compact: parent-controlled layout. */
  placement?: "below-artboard" | "fixed";
  /** When true, all pills show "—" until week histories finish loading. */
  healthLoading?: boolean;
};

/**
 * Live rotation health % for each day of the current grave week.
 * - bar: fixed above CanvasEngineCluster; dismissable; click day to jump.
 * - compact: inline strip for WeekLens / other chrome (no dismiss).
 */
export function WeekHealthTracker({
  visible,
  weekDailyHealths,
  dayDefs,
  selectedDayIndex,
  onSelectDay,
  onDismiss,
  className = "",
  variant = "bar",
  placement = "below-artboard",
  healthLoading = false,
}: WeekHealthTrackerProps) {
  if (!visible || !dayDefs || dayDefs.length === 0) return null;

  const isCompact = variant === "compact";
  const isBelowArtboard = !isCompact && placement === "below-artboard";

  const wrapperStyle: React.CSSProperties | undefined = isCompact
    ? undefined
    : placement === "fixed"
      ? {
          position: "fixed",
          bottom: WEEK_HEALTH_TRACKER_BOTTOM_PX,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 2147483645,
          pointerEvents: "auto",
        }
      : {
          position: "relative",
          pointerEvents: "auto",
          flexShrink: 0,
        };

  return (
    <div
      className={`no-print sb-glass-pill flex items-center gap-2 rounded-2xl shadow-[0_4px_12px_rgba(0,0,0,0.15)] ${
        isCompact ? "px-1.5 py-0.5 text-[8px] gap-1" : "px-3 py-2 text-[11px]"
      } ${className}`}
      style={{
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        background: isCompact
          ? "transparent"
          : isBelowArtboard
            ? "rgba(255,255,255,0.92)"
            : "rgba(255,255,255,0.08)",
        border: isCompact
          ? "none"
          : isBelowArtboard
            ? "1px solid rgba(0,0,0,0.08)"
            : "1px solid rgba(255,255,255,0.15)",
        backdropFilter: isCompact ? undefined : isBelowArtboard ? undefined : "blur(12px)",
        boxShadow: isBelowArtboard
          ? "0 2px 10px rgba(0,0,0,0.08)"
          : undefined,
        ...wrapperStyle,
      }}
      role="region"
      aria-label="Week rotation health tracker"
    >
      {!isCompact && (
        <div className="flex items-center gap-1.5 pr-2 border-r border-white/15 text-[10px] uppercase tracking-[0.5px] opacity-70">
          Week Health
        </div>
      )}

      <div className={`flex items-center ${isCompact ? "gap-0.5" : "gap-1.5"}`}>
        {dayDefs.map((def, index) => {
          const dateKey = def.date ? formatLocalDateISO(def.date) : "";
          const health =
            healthLoading || !dateKey
              ? null
              : (weekDailyHealths[dateKey] ?? null);
          const isSelected = index === selectedDayIndex;
          const colors = rotationHealthFloaterColors(health);

          // Letter + date number (e.g. F5, S6, S7) — Sat/Sun both used to show "S" only.
          const dayLetter = (def.name || def.short || "?").charAt(0).toUpperCase();
          const dateNum = def.dateNum ?? index + 1;
          const label = isCompact
            ? `${dayLetter}${dateNum}`
            : `${dayLetter}${dateNum}`;

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectDay?.(index)}
              className={`flex items-center gap-0.5 rounded-xl transition-all active:scale-[0.985] ${
                isCompact ? "px-1 py-0.5 min-w-[28px]" : "px-2 py-1 gap-1 min-w-[52px]"
              } ${isSelected ? "ring-1 ring-white/40" : ""}`}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
              }}
              title={`${def.name || "Day"} ${dateNum}: ${health != null ? health + "%" : healthLoading ? "loading…" : "—"} (click to select day)`}
              aria-label={`${label} health ${health != null ? health : "unknown"} percent`}
            >
              <span
                className={`font-medium tabular-nums tracking-[-0.2px] opacity-90 ${
                  isCompact ? "text-[7px]" : "text-[10px]"
                }`}
              >
                {label}
              </span>
              <span
                className={`font-mono font-semibold tabular-nums leading-none ${
                  isCompact ? "text-[9px]" : "text-[13px]"
                }`}
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {health != null ? `${health}` : "—"}
              </span>
              {!isCompact && <span className="text-[8px] opacity-60">%</span>}
            </button>
          );
        })}
      </div>

      {!isCompact && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 rounded-full p-1 opacity-60 hover:opacity-100 active:opacity-80 transition-opacity"
          aria-label="Dismiss week health tracker"
          title="Dismiss (you can re-show from the health cluster)"
        >
          <span className="text-[10px] leading-none">✕</span>
        </button>
      )}
    </div>
  );
}