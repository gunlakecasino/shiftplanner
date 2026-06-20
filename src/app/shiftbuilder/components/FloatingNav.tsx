"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  FLOATING_NAV_FALLBACK_MAX_WIDTH_PX,
  FLOATING_NAV_MAX_WIDTH_PX,
  floatingNavWidthCss,
} from "@/lib/shiftbuilder/canvasLayout";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Coffee,
  Sparkles,
  MoreHorizontal,
  Users,
  Rocket,
  Printer,
  UserRound,
  Eye,
  X,
} from "lucide-react";

// Types kept for compatibility with ShiftBuilderClient
export interface DayItem {
  id: number;
  label: string;
  shortLabel?: string;
  dayLetter?: string;
  isBridge?: boolean;
  dateNum?: number;
  isToday?: boolean;
  date?: Date;
}

export interface FloatingNavProps {
  days: DayItem[];
  selectedDayId: number;
  onDaySelect: (id: number, date: Date) => void;
  onDayHover?: (id: number, date: Date) => void;
  currentView: "deployment" | "breaks" | "weekly";
  onViewChange?: (view: "deployment" | "breaks" | "weekly") => void;
  onToday: () => void;
  onLaunchpad?: () => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onCopyPriorWeekTasks?: () => void;
  onCopyYesterdayTasks?: () => void;
  onRestoreDefaultBreaks?: () => void;
  restoreDefaultBreaksBusy?: boolean;
  onToggleWeekHealth?: () => void;
  weekHealthVisible?: boolean;
  weekHealthPercent?: number | null;
  weekHealthLoading?: boolean;
  onZoomFit?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  zoomLabel?: string;
  isZoomed?: boolean;
  onThemeToggle?: () => void;
  onPrint?: () => void;
  isDark?: boolean;
  contentMaxWidth?: number;
  userInitials?: string;
  currentUser?: { full_name: string; username: string; role: string };
  onLogout?: () => void;
  /** Opens OMS Settings (optional tab id, e.g. "tasks"). */
  onOpenSettings?: (tab?: string) => void;
  isSyncing?: boolean;
  rosterOpen?: boolean;
  onRosterToggle?: () => void;
  canvasMode?: "builder" | "print-preview";
  onCanvasModeChange?: (mode: "builder" | "print-preview") => void;
  isDayPublished?: boolean;
  canPublishDay?: boolean;
  onToggleDayPublished?: () => void;
  publishDayBusy?: boolean;

  /** Stripped variant for the /today kiosk page (minimal right side + restricted more menu). */
  variant?: 'full' | 'today';
  /** Top offset for fixed positioning (today uses 8, builder uses 0). */
  top?: number;
  /** Exit action for today kiosk (change operator / leave view). */
  onExit?: () => void;
  exitLabel?: string;
  /** For today variant name display in the pill. */
  operatorName?: string;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

export default function FloatingNav(props: FloatingNavProps) {
  const {
    days,
    selectedDayId,
    onDaySelect,
    onDayHover,
    currentView,
    onViewChange,
    onToday,
    onLaunchpad,
    onPrevWeek,
    onNextWeek,
    onCopyPriorWeekTasks,
    onCopyYesterdayTasks,
    onRestoreDefaultBreaks,
    onPrint,
    isDark = false,
    contentMaxWidth,
    currentUser,
    onLogout,
    onOpenSettings,
    rosterOpen = false,
    onRosterToggle,
    canvasMode = 'builder',
    onCanvasModeChange,
    isDayPublished = false,
    canPublishDay = false,
    onToggleDayPublished,
    onToggleWeekHealth,
    weekHealthVisible = false,
    variant = 'full',
    top = 0,
    onExit,
    exitLabel = 'Exit',
    operatorName,
  } = props;

  const isTodayVariant = variant === 'today';

  // Internal states for dropdowns
  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLButtonElement>(null);

  // Close dropdowns on outside click / escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  // Month label
  const firstDay = days[0]?.date || new Date();
  const monthLabel = `${MONTHS[firstDay.getMonth()]} ${firstDay.getFullYear()}`;

  // Simple "run engine" placeholder (parent can provide via other means or we call a global if needed)
  const handleRunEngine = () => {
    // In full integration this would be passed as prop. For now trigger a toast or parent action if available.
    console.log("[FloatingNav] Run Engine requested");
  };

  const handleDefaultTasks = () => {
    onOpenSettings?.("tasks");
    setMoreOpen(false);
  };

  return (
    <>
      <style>{`
        .icon-btn { transition: background 0.12s ease; }
        .icon-btn:hover { background: rgba(0,0,0,0.06); }
        .icon-btn:active { background: rgba(0,0,0,0.11); }
        @keyframes live-pulse {
          0% { box-shadow: 0 0 0 0 rgba(34,197,94,0.5); }
          70% { box-shadow: 0 0 0 6px rgba(34,197,94,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); }
        }
        .live-dot { animation: live-pulse 2s ease-out infinite; }
      `}</style>

      <nav
        style={{
          position: "fixed",
          top: top,
          left: "50%",
          transform: "translateX(-50%)",
          width: floatingNavWidthCss(
            contentMaxWidth ? FLOATING_NAV_MAX_WIDTH_PX : FLOATING_NAV_FALLBACK_MAX_WIDTH_PX,
          ),
          background: isDark ? "rgba(9,9,11,0.97)" : "rgba(249, 247, 244, 0.97)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 9999,
          border: "1px solid rgba(0,0,0,0.075)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.07), 0 16px 40px rgba(0,0,0,0.06)",
          padding: "8px 14px",
          fontFamily: "'Inter', system-ui, sans-serif",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 0,
          zIndex: 40,
        }}
      >
        {/* LEFT — month + calendar */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="icon-btn flex items-center gap-1 rounded-full px-2.5 py-1.5"
            style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#f4f4f5" : "#1a1a1a", letterSpacing: "-0.015em" }}
            onClick={onToday}
            title="Jump to today"
          >
            {monthLabel}
            <ChevronDown size={11} strokeWidth={2.8} style={{ color: "#999", marginTop: 1 }} />
          </button>
          <button
            className="icon-btn flex items-center justify-center w-6 h-6 rounded-full"
            style={{ color: "#666" }}
            onClick={onToday}
            title="Today"
          >
            <Calendar size={13} strokeWidth={1.8} />
          </button>
        </div>

        {/* DIVIDER */}
        <div className="shrink-0 mx-2" style={{ width: 1, height: 16, background: "rgba(0,0,0,0.12)" }} />

        {/* CENTER — day scroller */}
        <div className="flex items-center flex-1 min-w-0 gap-0.5">
          <button
            onClick={onPrevWeek}
            className="icon-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ color: "#aaa" }}
            title="Previous GRAVE week"
          >
            <ChevronLeft size={13} strokeWidth={2.8} />
          </button>

          <div className="flex items-center justify-around flex-1 px-1">
            {days.map((day, i) => {
              const isSelected = day.id === selectedDayId;
              const isToday = !!day.isToday;
              const letter = day.dayLetter || DAY_LETTERS[(day.date?.getDay() ?? i) % 7];
              const dateNum = day.dateNum || day.label;

              if (isSelected) {
                return (
                  <button
                    key={i}
                    onClick={() => onDaySelect(day.id, day.date || new Date())}
                    className="flex flex-col items-center justify-center shrink-0 transition-transform active:scale-95"
                    style={{
                      background: "#7B3226",
                      borderRadius: 10,
                      width: 38,
                      height: 43,
                      gap: 0,
                      boxShadow: "0 2px 8px rgba(123,50,38,0.35)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 8,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.6)",
                        letterSpacing: "0.12em",
                        lineHeight: 1,
                        marginBottom: 2,
                      }}
                    >
                      {day.shortLabel || SHORT_MONTHS[(day.date?.getMonth() ?? 5)]}
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 800,
                        color: "#fff",
                        lineHeight: 1,
                        letterSpacing: "-0.04em",
                      }}
                    >
                      {dateNum}
                    </span>
                  </button>
                );
              }

              return (
                <button
                  key={i}
                  onClick={() => onDaySelect(day.id, day.date || new Date())}
                  onMouseEnter={() => onDayHover?.(day.id, day.date || new Date())}
                  className="icon-btn flex flex-col items-center justify-center shrink-0 rounded-full"
                  style={{
                    width: 31,
                    height: 40,
                    gap: 4,
                    border: isToday ? "1.5px dashed rgba(0,0,0,0.22)" : "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#a1a1aa" : "#444", lineHeight: 1 }}>
                    {letter}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            onClick={onNextWeek}
            className="icon-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ color: "#aaa" }}
            title="Next GRAVE week"
          >
            <ChevronRight size={13} strokeWidth={2.8} />
          </button>
        </div>

        {/* DIVIDER */}
        <div className="shrink-0 mx-2" style={{ width: 1, height: 16, background: "rgba(0,0,0,0.12)" }} />

        {/* RIGHT — actions + user + more dropdown */}
        <div className="flex items-center gap-0.5 shrink-0">
          {/* Builder-only controls (hidden in today kiosk stripped variant) */}
          {!isTodayVariant && (
            <button
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
              style={{ color: "#666" }}
              onClick={onRosterToggle}
              title={rosterOpen ? "Hide roster" : "Show roster"}
            >
              <LayoutGrid size={14} strokeWidth={1.8} />
            </button>
          )}

          {/* View toggle — keep for today to allow breaks view if wired */}
          {onViewChange && (
            <button
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
              style={{ color: "#666" }}
              onClick={() => onViewChange(currentView === "breaks" ? "deployment" : "breaks")}
              title="Breaks view"
            >
              <Coffee size={14} strokeWidth={1.8} />
            </button>
          )}

          {!isTodayVariant && (
            <>
              {/* LIVE / Publish status */}
              <button
                className="icon-btn flex items-center gap-1.5 rounded-full px-2.5 py-1"
                style={{ fontSize: 10, fontWeight: 700, color: isDark ? "#f4f4f5" : "#1a1a1a", letterSpacing: "0.06em" }}
                onClick={onToggleDayPublished}
                disabled={!canPublishDay}
                title={isDayPublished ? "Unpublish this day" : "Publish this day"}
              >
                <span
                  className="live-dot shrink-0"
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: isDayPublished ? "#22c55e" : "#f59e0b",
                    display: "inline-block",
                  }}
                />
                {isDayPublished ? "LIVE" : "DRAFT"}
              </button>

              <button
                className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
                style={{ color: "#666" }}
                onClick={handleRunEngine}
                title="Run Engine / AI"
              >
                <Sparkles size={14} strokeWidth={1.8} />
              </button>
            </>
          )}

          {/* User / operator name */}
          <button
            className="icon-btn flex items-center gap-1 rounded-full px-2.5 py-1.5"
            style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#f4f4f5" : "#1a1a1a", letterSpacing: "-0.015em" }}
            onClick={() => {
              if (isTodayVariant && onExit) {
                onExit();
              } else {
                setProfileOpen((v) => !v);
              }
            }}
            title={isTodayVariant ? (exitLabel || "Exit") : "Account"}
            ref={profileRef as any}
          >
            {isTodayVariant
              ? (currentUser?.full_name || operatorName || "Operator")
              : (currentUser?.full_name || "Brian Killian")}
          </button>

          {/* Basic profile menu (today variant uses direct exit on name click) */}
          {!isTodayVariant && profileOpen && currentUser && (
            <div className="absolute right-0 mt-10 w-44 rounded-xl border bg-white shadow-lg py-1 z-[80] text-[13px]" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
              <div className="px-3 py-2 text-[12px] text-gray-500 border-b">{currentUser.username} · {currentUser.role}</div>
              <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onLogout}>Sign out</button>
            </div>
          )}

          {/* More / Dropdown */}
          <div className="relative" ref={moreRef}>
            <button
              className="icon-btn flex items-center justify-center w-6 h-6 rounded-full"
              style={{ color: "#aaa" }}
              onClick={() => setMoreOpen((v) => !v)}
              title="More actions"
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>

            {moreOpen && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl border bg-white shadow-xl py-1 z-[70] text-[13px]"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
                onClick={() => setMoreOpen(false)}
              >
                {isTodayVariant ? (
                  <>
                    {onPrint && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => { onPrint?.(); }}
                      >
                        <Printer size={14} /> Print sheet
                      </button>
                    )}
                    {onExit && (
                      <button
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                        onClick={() => { onExit?.(); }}
                      >
                        <UserRound size={14} /> {exitLabel}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2" onClick={() => { onRestoreDefaultBreaks?.(); }}>
                      <Coffee size={14} /> Default Breaks
                    </button>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2" onClick={handleDefaultTasks}>
                      <LayoutGrid size={14} /> Default Tasks
                    </button>
                    <div className="h-px bg-gray-100 my-1 mx-2" />
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100"
                      onClick={onToggleDayPublished}
                      disabled={!canPublishDay}
                    >
                      {isDayPublished ? "Unpublish Day" : "Publish Day"}
                    </button>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onPrint}>
                      Print
                    </button>
                    <button
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2"
                      onClick={() => onCanvasModeChange?.(canvasMode === 'print-preview' ? 'builder' : 'print-preview')}
                    >
                      {canvasMode === 'print-preview' ? (
                        <><X size={14} /> Exit print preview</>
                      ) : (
                        <><Eye size={14} /> View print preview</>
                      )}
                    </button>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onCopyPriorWeekTasks}>
                      Copy Prior Week Tasks
                    </button>
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onCopyYesterdayTasks}>
                      Copy Yesterday Tasks
                    </button>
                    <div className="h-px bg-gray-100 my-1 mx-2" />
                    <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onLaunchpad}>
                      Back to Launchpad
                    </button>
                    {onToggleWeekHealth && (
                      <button className="w-full text-left px-3 py-1.5 hover:bg-gray-100" onClick={onToggleWeekHealth}>
                        {weekHealthVisible ? "Hide" : "Show"} Week Health
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
