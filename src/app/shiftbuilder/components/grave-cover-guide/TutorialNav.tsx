"use client";

import React from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Layers, LocateFixed, Users } from "lucide-react";

const DAY_PILLS = [
  { id: 0, label: "F", dateNum: 20, active: false },
  { id: 1, label: "S", dateNum: 21, active: false },
  { id: 2, label: "S", dateNum: 22, active: false },
  { id: 3, label: "M", dateNum: 23, active: true },
  { id: 4, label: "T", dateNum: 24, active: false },
  { id: 5, label: "W", dateNum: 25, active: false },
  { id: 6, label: "T", dateNum: 26, active: false },
];

type TutorialNavProps = {
  highlightDay?: boolean;
  onDayConfirm?: () => void;
  isDark?: boolean;
};

export function TutorialNav({ highlightDay = false, onDayConfirm, isDark = false }: TutorialNavProps) {
  const activeColor = "#C13A14";

  return (
    <nav
      className={`sb-guide-floating-nav ${highlightDay ? "sb-guide-target" : ""}`}
      style={{
        background: isDark ? "rgba(9,9,11,0.97)" : "rgba(249, 247, 244, 0.97)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(0,0,0,0.075)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 40px rgba(0,0,0,0.06)",
      }}
    >
      <button type="button" className="sb-guide-nav-month">
        JUN
        <ChevronDown size={11} strokeWidth={2.8} style={{ color: "#999" }} />
      </button>
      <button type="button" className="sb-guide-nav-icon" aria-label="Go to today">
        <LocateFixed size={13} strokeWidth={1.8} />
      </button>

      <button type="button" className="sb-guide-nav-week-cap" aria-label="Previous week">
        <ChevronLeft size={14} />
      </button>

      <div className="sb-guide-nav-days">
        {DAY_PILLS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              if (d.active) onDayConfirm?.();
            }}
            className={`sb-guide-nav-day ${d.active ? "is-active" : ""} ${
              d.active && highlightDay ? "sb-guide-target--pulse" : ""
            }`}
            style={
              d.active
                ? {
                    background: activeColor,
                    color: "#fff",
                    boxShadow: `0 2px 8px ${activeColor}59`,
                  }
                : undefined
            }
          >
            <span className="sb-guide-nav-day-letter">{d.label}</span>
            <span className="sb-guide-nav-day-num">{d.dateNum}</span>
          </button>
        ))}
      </div>

      <button type="button" className="sb-guide-nav-week-cap" aria-label="Next week">
        <ChevronRight size={14} />
      </button>

      <div className="sb-guide-nav-spacer" />

      <button type="button" className="sb-guide-nav-icon" title="Deployment board">
        <Layers size={14} />
      </button>
      <button type="button" className="sb-guide-nav-icon sb-guide-nav-icon--active" title="Roster open">
        <Users size={14} />
      </button>
    </nav>
  );
}