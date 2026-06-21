"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import {
  FLOATING_NAV_FALLBACK_MAX_WIDTH_PX,
  FLOATING_NAV_MAX_WIDTH_PX,
  floatingNavWidthCss,
} from "@/lib/shiftbuilder/canvasLayout";
import {
  addDays,
  MONTH_LONG,
  sameDay,
} from "@/lib/shiftbuilder/dateUtils";
import {
  ChevronDown,
  LocateFixed,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Coffee,
  Users,
  Layers,
  Sparkles,
  MoreHorizontal,
  Eye,
  X,
  Eraser,
  FilePenLine,
  Check,
} from "lucide-react";

export interface DayItem {
  id: number;
  label: string;
  shortLabel?: string;
  dayLetter?: string;
  isBridge?: boolean;
  dateNum?: number;
  isToday?: boolean;
  date?: Date;
  /** DAY_DEFS accent — used for the active pill background. */
  color?: string;
}

export interface FloatingNavProps {
  days: DayItem[];
  selectedDayId: number;
  onDaySelect: (id: number, date: Date) => void;
  onDayHover?: (id: number, date: Date) => void;
  currentView: "deployment" | "breaks" | "weekly";
  onViewChange?: (view: "deployment" | "breaks" | "weekly") => void;
  onToday: () => void;
  /** Jump to any calendar date (parent updates week + day index). */
  onNavigateToDate?: (date: Date) => void;
  /** Currently selected grave shift date — highlights the day in the month picker. */
  selectedDate?: Date;
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
  onOpenSettings?: (tab?: string) => void;
  onRunEngine?: () => void;
  onClearDay?: () => void;
  isDraftMode?: boolean;
  draftSlotCount?: number;
  onToggleDraftMode?: () => void;
  onSaveAllDraft?: () => void;
  onDiscardDraft?: () => void;
  isSyncing?: boolean;
  rosterOpen?: boolean;
  onRosterToggle?: () => void;
  canvasMode?: "builder" | "print-preview";
  onCanvasModeChange?: (mode: "builder" | "print-preview") => void;
  isDayPublished?: boolean;
  canPublishDay?: boolean;
  onToggleDayPublished?: () => void;
  publishDayBusy?: boolean;
  top?: number;
}

const MONTHS = MONTH_LONG;
const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DEFAULT_ACTIVE_COLOR = "#7B3226";

function hexShadow(color: string): string {
  const c = color.startsWith("#") && color.length === 7 ? `${color}59` : "rgba(0,0,0,0.25)";
  return `0 2px 8px ${c}`;
}

export default function FloatingNav(props: FloatingNavProps) {
  const {
    days,
    selectedDayId,
    onDaySelect,
    onDayHover,
    currentView,
    onViewChange,
    onToday,
    onNavigateToDate,
    selectedDate,
    onLaunchpad,
    onPrevWeek,
    onNextWeek,
    onCopyPriorWeekTasks,
    onCopyYesterdayTasks,
    onRestoreDefaultBreaks,
    onPrint,
    isDark = false,
    contentMaxWidth,
    userInitials = "OP",
    currentUser,
    onLogout,
    onOpenSettings,
    onRunEngine,
    onClearDay,
    isDraftMode = false,
    draftSlotCount = 0,
    onToggleDraftMode,
    onSaveAllDraft,
    onDiscardDraft,
    rosterOpen = false,
    onRosterToggle,
    canvasMode = "builder",
    onCanvasModeChange,
    isDayPublished = false,
    canPublishDay = false,
    onToggleDayPublished,
    onToggleWeekHealth,
    weekHealthVisible = false,
    top = 0,
  } = props;

  const [moreOpen, setMoreOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<Date>(() => new Date());

  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId);
  const activeColor = selectedDay?.color ?? DEFAULT_ACTIVE_COLOR;

  const firstDay = days[0]?.date || new Date();
  const monthLabel = `${MONTHS[firstDay.getMonth()]} ${firstDay.getFullYear()}`;

  const closeAllMenus = () => {
    setMoreOpen(false);
    setProfileOpen(false);
    setCalendarOpen(false);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreRef.current && !moreRef.current.contains(target)) setMoreOpen(false);
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (calendarRef.current && !calendarRef.current.contains(target)) setCalendarOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAllMenus();
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const toggleCalendar = () => {
    const anchor = selectedDate ?? selectedDay?.date ?? new Date();
    setCalendarView(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    setCalendarOpen((v) => !v);
    setMoreOpen(false);
    setProfileOpen(false);
  };

  const pickCalendarDate = (date: Date) => {
    onNavigateToDate?.(date);
    setCalendarOpen(false);
  };

  const handleDefaultTasks = () => {
    onOpenSettings?.("tasks");
    setMoreOpen(false);
  };

  const menuPanelClass = isDark
    ? "rounded-xl border border-white/10 bg-zinc-900 shadow-xl py-1 text-[13px] text-zinc-100"
    : "rounded-xl border bg-white shadow-xl py-1 text-[13px] text-zinc-900";
  const menuItemClass = isDark
    ? "w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 disabled:opacity-40"
    : "w-full text-left px-3 py-1.5 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-40";
  const menuDividerClass = isDark ? "h-px bg-white/10 my-1 mx-2" : "h-px bg-gray-100 my-1 mx-2";

  const calendarHighlight = selectedDate ?? selectedDay?.date;
  const isViewingToday = !!selectedDay?.isToday;

  const handleGoToToday = () => {
    closeAllMenus();
    onToday();
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
        {/* LEFT — month picker + go to today */}
        <div className="relative flex items-center gap-1 shrink-0" ref={calendarRef}>
          <button
            type="button"
            className="icon-btn flex items-center gap-1 rounded-full px-2.5 py-1.5"
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: isDark ? "#f4f4f5" : "#1a1a1a",
              letterSpacing: "-0.015em",
            }}
            onClick={toggleCalendar}
            title="Pick a date"
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
          >
            {monthLabel}
            <ChevronDown
              size={11}
              strokeWidth={2.8}
              style={{
                color: "#999",
                marginTop: 1,
                transform: calendarOpen ? "rotate(180deg)" : undefined,
                transition: "transform 0.15s ease",
              }}
            />
          </button>
          <button
            type="button"
            className="icon-btn flex items-center justify-center w-6 h-6 rounded-full"
            style={{
              color: isViewingToday ? (isDark ? "#71717a" : "#a1a1aa") : activeColor,
              opacity: isViewingToday ? 0.5 : 1,
            }}
            onClick={handleGoToToday}
            title={isViewingToday ? "Viewing today" : "Go to today"}
            aria-label={isViewingToday ? "Viewing today" : "Go to today"}
            disabled={isViewingToday}
          >
            <LocateFixed size={13} strokeWidth={1.8} />
          </button>

          {calendarOpen && onNavigateToDate && (
            <div
              id="floating-nav-calendar-popover"
              role="dialog"
              aria-label="Choose a date"
              className={`absolute left-0 top-full mt-2 w-[280px] z-[80] p-3 backdrop-blur-xl ${
                isDark
                  ? "rounded-2xl border border-white/10 bg-zinc-900/95 text-zinc-100"
                  : "rounded-2xl border border-white/70 bg-[color-mix(in_srgb,var(--ios-background-secondary)_95%,transparent)] text-[12px]"
              }`}
              style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.12)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <button
                  type="button"
                  onClick={() => setCalendarView(addDays(calendarView, -30))}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-[var(--ios-gray-6)] text-[var(--ios-label-tertiary)]"
                  }`}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="font-semibold tabular-nums">
                  {MONTHS[calendarView.getMonth()]} {calendarView.getFullYear()}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarView(addDays(calendarView, 32))}
                  className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    isDark ? "hover:bg-white/10 text-zinc-400" : "hover:bg-[var(--ios-gray-6)] text-[var(--ios-label-tertiary)]"
                  }`}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              <div className="grid grid-cols-7 text-center font-medium mb-1 opacity-70">
                {DAY_LETTERS.map((d, i) => (
                  <div key={`hdr-${i}`}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 text-center">
                {(() => {
                  const year = calendarView.getFullYear();
                  const month = calendarView.getMonth();
                  const firstOfMonth = new Date(year, month, 1);
                  const startWeekday = firstOfMonth.getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const cells: React.ReactNode[] = [];

                  for (let i = 0; i < startWeekday; i++) {
                    const d = new Date(year, month, 1 - (startWeekday - i));
                    cells.push(
                      <button
                        key={`prev-${i}`}
                        type="button"
                        onClick={() => pickCalendarDate(d)}
                        className={`h-7 w-7 text-[11px] rounded-md ${
                          isDark ? "text-zinc-500 hover:bg-white/10" : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)]"
                        }`}
                      >
                        {d.getDate()}
                      </button>,
                    );
                  }

                  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
                    const d = new Date(year, month, dayNum);
                    const isSelectedDay = calendarHighlight && sameDay(d, calendarHighlight);
                    cells.push(
                      <button
                        key={dayNum}
                        type="button"
                        onClick={() => pickCalendarDate(d)}
                        className={`h-7 w-7 text-[11px] rounded-md transition-colors ${
                          isSelectedDay
                            ? "text-white font-semibold"
                            : isDark
                              ? "hover:bg-white/10 text-zinc-200"
                              : "hover:bg-[var(--ios-gray-6)] text-[var(--ios-label)]"
                        }`}
                        style={isSelectedDay ? { background: activeColor } : undefined}
                      >
                        {dayNum}
                      </button>,
                    );
                  }

                  const remaining = 42 - cells.length;
                  for (let i = 1; i <= remaining; i++) {
                    const d = new Date(year, month + 1, i);
                    cells.push(
                      <button
                        key={`next-${i}`}
                        type="button"
                        onClick={() => pickCalendarDate(d)}
                        className={`h-7 w-7 text-[11px] rounded-md ${
                          isDark ? "text-zinc-500 hover:bg-white/10" : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)]"
                        }`}
                      >
                        {d.getDate()}
                      </button>,
                    );
                  }

                  return cells;
                })()}
              </div>

              <div
                className={`mt-2 pt-2 flex justify-between ${
                  isDark ? "border-t border-white/10" : "border-t border-[var(--ios-gray-4)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    onToday();
                    setCalendarOpen(false);
                  }}
                  className={`text-[11px] px-2 py-0.5 rounded-md ${
                    isDark
                      ? "text-sky-400 hover:bg-white/10"
                      : "text-[var(--ios-blue)] hover:bg-[color-mix(in_srgb,var(--ios-blue)_10%,transparent)]"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className={`text-[11px] px-2 py-0.5 rounded-md ${
                    isDark ? "text-zinc-400 hover:bg-white/10" : "text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)]"
                  }`}
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 mx-2" style={{ width: 1, height: 16, background: "rgba(0,0,0,0.12)" }} />

        {/* CENTER — day scroller */}
        <div className="flex items-center flex-1 min-w-0 gap-0.5">
          <button
            type="button"
            onClick={onPrevWeek}
            className="icon-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ color: "#aaa" }}
            title="Previous GRAVE week"
            aria-label="Previous GRAVE week"
          >
            <ChevronLeft size={13} strokeWidth={2.8} />
          </button>

          <div className="flex items-center justify-around flex-1 px-1">
            {days.map((day) => {
              const isSelected = day.id === selectedDayId;
              const isToday = !!day.isToday;
              const letter = day.dayLetter || DAY_LETTERS[(day.date?.getDay() ?? 0) % 7];
              const dateNum = day.dateNum ?? day.label;
              const pillColor = isSelected ? (day.color ?? activeColor) : undefined;

              if (isSelected) {
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => onDaySelect(day.id, day.date || new Date())}
                    className="flex flex-col items-center justify-center shrink-0 transition-transform active:scale-95"
                    style={{
                      background: pillColor,
                      borderRadius: 10,
                      width: 38,
                      height: 43,
                      gap: 0,
                      boxShadow: hexShadow(pillColor ?? DEFAULT_ACTIVE_COLOR),
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
                      {day.shortLabel || SHORT_MONTHS[day.date?.getMonth() ?? 0]}
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
                  key={day.id}
                  type="button"
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
            type="button"
            onClick={onNextWeek}
            className="icon-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ color: "#aaa" }}
            title="Next GRAVE week"
            aria-label="Next GRAVE week"
          >
            <ChevronRight size={13} strokeWidth={2.8} />
          </button>
        </div>

        <div className="shrink-0 mx-2" style={{ width: 1, height: 16, background: "rgba(0,0,0,0.12)" }} />

        {/* RIGHT — actions + avatar + more */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
            style={{
              color: rosterOpen ? activeColor : "#666",
              background: rosterOpen
                ? isDark
                  ? "rgba(255,255,255,0.1)"
                  : `${activeColor}18`
                : undefined,
            }}
            onClick={onRosterToggle}
            title={rosterOpen ? "Hide team roster" : "Show team roster"}
            aria-label={rosterOpen ? "Hide team roster" : "Show team roster"}
            aria-pressed={rosterOpen}
          >
            <Users size={14} strokeWidth={1.8} />
          </button>

          {onViewChange && (
            <button
              type="button"
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
              style={{
                color: currentView === "breaks" ? activeColor : "#666",
                background:
                  currentView === "breaks"
                    ? isDark
                      ? "rgba(255,255,255,0.1)"
                      : `${activeColor}18`
                    : undefined,
              }}
              onClick={() => onViewChange(currentView === "breaks" ? "deployment" : "breaks")}
              title={currentView === "breaks" ? "Deployment board" : "Overlap sheet"}
              aria-label={currentView === "breaks" ? "Back to deployment board" : "Open overlap sheet"}
              aria-pressed={currentView === "breaks"}
            >
              <Layers size={14} strokeWidth={1.8} />
            </button>
          )}

          <button
            type="button"
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
            {isDayPublished ? "PUBLISHED" : "UNPUBLISHED"}
          </button>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full shrink-0"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: isDark ? "#f4f4f5" : "#1a1a1a",
                background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
              }}
              onClick={() => {
                setProfileOpen((v) => !v);
                setMoreOpen(false);
                setCalendarOpen(false);
              }}
              title="Account"
              aria-label="Account menu"
              aria-expanded={profileOpen}
            >
              {userInitials}
            </button>

            {profileOpen && currentUser && (
              <div
                className={`absolute right-0 top-full mt-2 w-44 z-[80] ${menuPanelClass}`}
                style={{ borderColor: isDark ? undefined : "rgba(0,0,0,0.08)" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={`px-3 py-2 text-[12px] border-b ${isDark ? "text-zinc-400 border-white/10" : "text-gray-500"}`}>
                  {currentUser.full_name}
                  <div className="opacity-80">{currentUser.username} · {currentUser.role}</div>
                </div>
                <button type="button" className={menuItemClass} onClick={() => { onLogout?.(); setProfileOpen(false); }}>
                  Sign out
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className="icon-btn flex items-center justify-center w-6 h-6 rounded-full"
              style={{ color: "#aaa" }}
              onClick={() => {
                setMoreOpen((v) => !v);
                setProfileOpen(false);
                setCalendarOpen(false);
              }}
              title="More actions"
              aria-label="More actions"
              aria-expanded={moreOpen}
            >
              <MoreHorizontal size={14} strokeWidth={2} />
            </button>

            {moreOpen && (
              <div
                className={`absolute right-0 top-full mt-2 w-56 z-[70] ${menuPanelClass}`}
                style={{ borderColor: isDark ? undefined : "rgba(0,0,0,0.08)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {onRunEngine && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onRunEngine();
                      setMoreOpen(false);
                    }}
                  >
                    <Sparkles size={14} /> Run Engine
                  </button>
                )}
                {onClearDay && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onClearDay();
                      setMoreOpen(false);
                    }}
                  >
                    <Eraser size={14} /> Clear Day
                  </button>
                )}
                {(onRunEngine || onClearDay) && <div className={menuDividerClass} />}
                {onToggleDraftMode && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onToggleDraftMode();
                      setMoreOpen(false);
                    }}
                  >
                    <FilePenLine size={14} />
                    Draft Mode
                    {isDraftMode && (
                      <span className="ml-auto text-[11px] font-semibold opacity-70">✓</span>
                    )}
                  </button>
                )}
                {onSaveAllDraft && (
                  <button
                    type="button"
                    className={menuItemClass}
                    disabled={!isDraftMode || draftSlotCount === 0}
                    onClick={() => {
                      onSaveAllDraft();
                      setMoreOpen(false);
                    }}
                  >
                    <Check size={14} />
                    Save All
                    {draftSlotCount > 0 && (
                      <span className="ml-auto text-[11px] tabular-nums opacity-60">{draftSlotCount}</span>
                    )}
                  </button>
                )}
                {onDiscardDraft && isDraftMode && draftSlotCount > 0 && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onDiscardDraft();
                      setMoreOpen(false);
                    }}
                  >
                    <X size={14} /> Discard Draft
                  </button>
                )}
                {(onToggleDraftMode || onSaveAllDraft) && <div className={menuDividerClass} />}
                {onRestoreDefaultBreaks && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onRestoreDefaultBreaks();
                      setMoreOpen(false);
                    }}
                  >
                    <Coffee size={14} /> Default Breaks
                  </button>
                )}
                <button type="button" className={menuItemClass} onClick={handleDefaultTasks}>
                  <LayoutGrid size={14} /> Default Tasks
                </button>
                <div className={menuDividerClass} />
                <button
                  type="button"
                  className={menuItemClass}
                  onClick={() => {
                    onToggleDayPublished?.();
                    setMoreOpen(false);
                  }}
                  disabled={!canPublishDay}
                >
                  {isDayPublished ? "Unpublish Day" : "Publish Day"}
                </button>
                {onPrint && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onPrint();
                      setMoreOpen(false);
                    }}
                  >
                    Print
                  </button>
                )}
                {onCanvasModeChange && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onCanvasModeChange(canvasMode === "print-preview" ? "builder" : "print-preview");
                      setMoreOpen(false);
                    }}
                  >
                    {canvasMode === "print-preview" ? (
                      <>
                        <X size={14} /> Exit print preview
                      </>
                    ) : (
                      <>
                        <Eye size={14} /> View print preview
                      </>
                    )}
                  </button>
                )}
                {onCopyPriorWeekTasks && (
                  <button type="button" className={menuItemClass} onClick={() => { onCopyPriorWeekTasks(); setMoreOpen(false); }}>
                    Copy Prior Week Tasks
                  </button>
                )}
                {onCopyYesterdayTasks && (
                  <button type="button" className={menuItemClass} onClick={() => { onCopyYesterdayTasks(); setMoreOpen(false); }}>
                    Copy Yesterday Tasks
                  </button>
                )}
                <div className={menuDividerClass} />
                {onLaunchpad && (
                  <button type="button" className={menuItemClass} onClick={() => { onLaunchpad(); setMoreOpen(false); }}>
                    Back to Launchpad
                  </button>
                )}
                {onToggleWeekHealth && (
                  <button type="button" className={menuItemClass} onClick={() => { onToggleWeekHealth(); setMoreOpen(false); }}>
                    {weekHealthVisible ? "Hide" : "Show"} Week Health
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}