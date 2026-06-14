"use client";

import React from "react";
import { createPortal } from "react-dom";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  rotationHealthFloaterColors,
  ROTATION_HEALTH_TARGET,
} from "./shiftRotationHealth";
import {
  WEEK_HEALTH_TRACKER_BOTTOM_PX,
  WEEK_HEALTH_TRACKER_BELOW_NAV_TOP_PX,
  WEEK_HEALTH_TRACKER_BAR_HEIGHT_PX,
} from "./canvasPillGlass";

const SELECTED_ACCENT = "#C13A14";

export type WeekHealthTrackerProps = {
  visible: boolean;
  weekDailyHealths: Record<string, number>;
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
  variant?: "bar" | "compact";
  placement?: "below-artboard" | "below-nav" | "chrome-slot" | "fixed";
  healthLoading?: boolean;
  isDark?: boolean;
};

function healthTone(percent: number): string {
  if (percent >= ROTATION_HEALTH_TARGET) return "#15803d";
  if (percent >= 70) return "#b45309";
  return "#b91c1c";
}

/**
 * Live rotation health % for each day of the current grave week.
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
  isDark = false,
}: WeekHealthTrackerProps) {
  if (!visible || !dayDefs || dayDefs.length === 0) return null;

  const isCompact = variant === "compact";
  const isBar = !isCompact;
  const isBelowNav = isBar && placement === "below-nav";
  const isChromeSlot = isBar && placement === "chrome-slot";
  const isFloaterChrome = isBelowNav || isChromeSlot;

  const fixedChrome: React.CSSProperties | undefined = isCompact
    ? undefined
    : isBelowNav
      ? {
          position: "fixed",
          top: WEEK_HEALTH_TRACKER_BELOW_NAV_TOP_PX,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 39,
          pointerEvents: "auto",
          maxWidth: "calc(100vw - 48px)",
        }
      : placement === "fixed"
        ? {
            position: "fixed",
            bottom: WEEK_HEALTH_TRACKER_BOTTOM_PX,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2147483645,
            pointerEvents: "auto",
          }
        : isChromeSlot
          ? {
              position: "relative",
              width: "fit-content",
              maxWidth: "100%",
            }
          : undefined;

  const shellStyle: React.CSSProperties = {
    fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
    ...fixedChrome,
    ...(isBar
      ? {
          height: WEEK_HEALTH_TRACKER_BAR_HEIGHT_PX,
          minHeight: WEEK_HEALTH_TRACKER_BAR_HEIGHT_PX,
          boxSizing: "border-box",
        }
      : {}),
  };

  if (isCompact) {
    shellStyle.background = "transparent";
    shellStyle.border = "none";
  } else if (isFloaterChrome) {
    shellStyle.background = isDark ? "rgba(9,9,11,0.9)" : "rgba(255,255,255,0.92)";
    shellStyle.border = isDark
      ? "1px solid rgba(255,255,255,0.12)"
      : "1px solid rgba(255,255,255,0.4)";
    shellStyle.backdropFilter = "blur(24px) saturate(180%)";
    shellStyle.WebkitBackdropFilter = "blur(24px) saturate(180%)";
    shellStyle.boxShadow = isDark
      ? "0 8px 24px -8px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.1)"
      : "0 8px 24px -10px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.98)";
  } else if (placement === "below-artboard") {
    shellStyle.background = "rgba(255,255,255,0.92)";
    shellStyle.border = "1px solid rgba(0,0,0,0.08)";
    shellStyle.boxShadow = "0 2px 10px rgba(0,0,0,0.08)";
  } else {
    shellStyle.background = "rgba(255,255,255,0.08)";
    shellStyle.border = "1px solid rgba(255,255,255,0.15)";
    shellStyle.backdropFilter = "blur(12px)";
    shellStyle.WebkitBackdropFilter = "blur(12px)";
  }

  const content = (
    <div
      className={`no-print sb-week-health-tracker flex flex-row items-center ${
        isCompact
          ? "sb-glass-pill rounded-2xl px-1.5 py-0.5 text-[8px] gap-1"
          : `sb-week-health-bar rounded-2xl gap-1.5 ${
              isChromeSlot ? "px-2 py-1" : "px-3 gap-2.5"
            } ${isFloaterChrome && !isChromeSlot ? "sb-week-health-below-nav" : ""}`
      } ${className}`}
      style={shellStyle}
      role="region"
      aria-label="Week rotation health tracker"
    >
      {isBar && (
        <span
          className="shrink-0 text-[9px] font-bold uppercase tracking-[0.14em] opacity-50 pr-1"
          style={{ color: isDark ? "#d4d4d8" : "#52525b" }}
        >
          Week Health
        </span>
      )}

      <div className={`flex flex-row flex-nowrap items-center ${isBar ? "gap-1" : "gap-0.5"}`}>
        {dayDefs.map((def, index) => {
          const dateKey = def.date ? formatLocalDateISO(def.date) : "";
          const health =
            healthLoading || !dateKey
              ? null
              : (weekDailyHealths[dateKey] ?? null);
          const isSelected = index === selectedDayIndex;
          const dayLetter = (def.name || def.short || "?").charAt(0).toUpperCase();
          const dateNum = def.dateNum ?? index + 1;
          const label = `${dayLetter}${dateNum}`;

          if (isBar) {
            const hasHealth = health != null;

            return (
              <button
                key={index}
                type="button"
                onClick={() => onSelectDay?.(index)}
                className={`flex flex-row items-baseline gap-1 rounded-xl transition-all active:scale-[0.98] ${
                  isChromeSlot ? "px-2 py-1" : "px-2.5 py-1.5"
                }`}
                style={{
                  background: isSelected
                    ? SELECTED_ACCENT
                    : isDark
                      ? "rgba(255,255,255,0.06)"
                      : "rgba(0,0,0,0.04)",
                  border: isSelected
                    ? `1px solid ${SELECTED_ACCENT}`
                    : isDark
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(0,0,0,0.05)",
                  opacity: hasHealth ? 1 : 0.45,
                }}
                title={`${def.name || "Day"} ${dateNum}: ${health != null ? health + "%" : healthLoading ? "loading…" : "—"}`}
                aria-label={`${label} health ${health != null ? health : "unknown"} percent`}
                aria-current={isSelected ? "true" : undefined}
              >
                <span
                  className="text-[10px] font-semibold tabular-nums"
                  style={{ color: isSelected ? "#fff" : isDark ? "#a1a1aa" : "#6b7280" }}
                >
                  {label}
                </span>
                <span
                  className="text-[14px] font-bold tabular-nums leading-none"
                  style={{
                    color: isSelected
                      ? "#fff"
                      : hasHealth
                        ? healthTone(health)
                        : isDark
                          ? "#52525b"
                          : "#9ca3af",
                  }}
                >
                  {health != null ? `${health}%` : "—"}
                </span>
              </button>
            );
          }

          const colors = rotationHealthFloaterColors(health);

          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelectDay?.(index)}
              className={`flex items-center gap-0.5 rounded-xl px-1 py-0.5 min-w-[28px] transition-all active:scale-[0.985] ${
                isSelected ? "ring-1 ring-white/40" : ""
              }`}
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
              }}
              title={`${def.name || "Day"} ${dateNum}: ${health != null ? health + "%" : healthLoading ? "loading…" : "—"}`}
              aria-label={`${label} health ${health != null ? health : "unknown"} percent`}
            >
              <span className="text-[7px] font-medium tabular-nums opacity-90">{label}</span>
              <span className="font-mono text-[9px] font-semibold tabular-nums leading-none">
                {health != null ? `${health}` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {isBar && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-45 transition-opacity hover:opacity-80"
          style={{ color: isDark ? "#e4e4e7" : "#52525b" }}
          aria-label="Dismiss week health tracker"
          title="Dismiss"
        >
          <span className="text-[14px] leading-none">×</span>
        </button>
      )}
    </div>
  );

  if (isBelowNav && typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}