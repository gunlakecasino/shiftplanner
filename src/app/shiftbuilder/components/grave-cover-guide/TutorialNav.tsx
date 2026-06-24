"use client";

import React from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  LocateFixed,
  MoreHorizontal,
  Users,
} from "lucide-react";

const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

const DAY_PILLS = [
  { id: 0, dateNum: 20, weekday: 5, month: 5 },
  { id: 1, dateNum: 21, weekday: 6, month: 5 },
  { id: 2, dateNum: 22, weekday: 0, month: 5 },
  { id: 3, dateNum: 23, weekday: 1, month: 5, selected: true },
  { id: 4, dateNum: 24, weekday: 2, month: 5 },
  { id: 5, dateNum: 25, weekday: 3, month: 5 },
  { id: 6, dateNum: 26, weekday: 4, month: 5 },
];

function hexShadow(color: string): string {
  return `0 2px 8px ${color}59`;
}

type TutorialNavProps = {
  highlightDay?: boolean;
  onDayConfirm?: () => void;
  isDark?: boolean;
};

export function TutorialNav({ highlightDay = false, onDayConfirm, isDark = false }: TutorialNavProps) {
  const activeColor = "#C13A14";

  return (
    <nav
      className="sb-guide-floating-nav"
      style={{
        background: isDark ? "rgba(9,9,11,0.97)" : "rgba(249, 247, 244, 0.97)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderRadius: 9999,
        border: "1px solid rgba(0,0,0,0.075)",
        boxShadow:
          "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 40px rgba(0,0,0,0.06)",
        padding: "8px 14px",
        fontFamily: "var(--font-ui, var(--font-builder, 'Helvetica Neue', Helvetica, Arial, sans-serif)",
      }}
    >
      <button type="button" className="sb-guide-nav-month" style={{ fontSize: 12, fontWeight: 600 }}>
        JUN
        <ChevronDown size={11} strokeWidth={2.8} style={{ color: "#999", marginTop: 1 }} />
      </button>
      <button type="button" className="sb-guide-nav-icon" aria-label="Go to today" style={{ opacity: 0.5 }}>
        <LocateFixed size={13} strokeWidth={1.8} />
      </button>

      <div className="sb-guide-nav-divider" />

      <button type="button" className="sb-guide-nav-week-cap" aria-label="Previous week">
        <ChevronLeft size={13} strokeWidth={2.8} />
      </button>

      <div className="sb-guide-nav-days">
        {DAY_PILLS.map((d) => {
          const isSelected = !!d.selected;
          const letter = DAY_LETTERS[d.weekday];
          const pillColor = isSelected ? activeColor : undefined;

          if (isSelected) {
            return (
              <button
                key={d.id}
                type="button"
                onClick={onDayConfirm}
                className={`sb-guide-nav-day-selected ${
                  highlightDay ? "sb-guide-target sb-guide-target--pulse" : ""
                }`}
                style={{
                  background: pillColor,
                  borderRadius: 10,
                  width: 38,
                  height: 43,
                  boxShadow: hexShadow(pillColor ?? activeColor),
                }}
              >
                <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em" }}>
                  {SHORT_MONTHS[d.month]}
                </span>
                <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1 }}>
                  {d.dateNum}
                </span>
              </button>
            );
          }

          return (
            <button
              key={d.id}
              type="button"
              className="sb-guide-nav-day-idle"
              style={{ width: 31, height: 40 }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#a1a1aa" : "#444" }}>{letter}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="sb-guide-nav-week-cap" aria-label="Next week">
        <ChevronRight size={13} strokeWidth={2.8} />
      </button>

      <div className="sb-guide-nav-divider" />

      <button
        type="button"
        className="sb-guide-nav-icon sb-guide-nav-icon--active"
        title="Team roster open"
        style={{ color: activeColor, background: `${activeColor}18` }}
      >
        <Users size={14} strokeWidth={1.8} />
      </button>
      <button type="button" className="sb-guide-nav-icon" title="Deployment board">
        <Layers size={14} strokeWidth={1.8} />
      </button>

      <span className="sb-guide-nav-status">
        <span className="sb-guide-nav-status-dot" style={{ background: "#22c55e" }} />
        PUBLISHED
      </span>

      <button type="button" className="sb-guide-nav-avatar" title="Account">
        BK
      </button>
      <button type="button" className="sb-guide-nav-icon" title="More actions">
        <MoreHorizontal size={14} strokeWidth={2} />
      </button>
    </nav>
  );
}