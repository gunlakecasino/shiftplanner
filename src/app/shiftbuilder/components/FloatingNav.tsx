"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  MONTH_LONG,
} from "@/lib/shiftbuilder/dateUtils";
import {
  APPLY_TO_LIVE_BUSY_LABEL,
  APPLY_TO_LIVE_CONFIRM_LABEL,
  APPLY_TO_LIVE_OPEN_CONFIRM,
} from "@/lib/shiftbuilder/stakesCopy";
import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import { roleLabel } from "@/lib/auth/permissionCatalog";
import { MiniCalendar } from "../redesign/components/MiniCalendar";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Users,
  Layers,
  Settings,
  MoreHorizontal,
  Eye,
  X,
  Eraser,
  CalendarDays,
  RefreshCw,
  ClipboardList,
} from "lucide-react";

const APP_BASE_PATH = "/sheetbuilder";

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

export interface RosterDropdownPerson {
  id: string;
  name: string;
  initials?: string;
  color?: string;
}

export interface RosterDropdownGroups {
  scheduledDefault: RosterDropdownPerson[];
  scheduledOverlaps: RosterDropdownPerson[];
  markedOff: RosterDropdownPerson[];
  notScheduled: RosterDropdownPerson[];
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
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onCopyPriorWeekTasks?: () => void;
  onCopyYesterdayTasks?: () => void;
  onApplyOverlapTasks?: () => void;
  applyOverlapTasksBusy?: boolean;
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
  printBusy?: boolean;
  onOpenCoverGuide?: () => void;
  isDark?: boolean;
  contentMaxWidth?: number;
  userInitials?: string;
  currentUser?: { full_name: string; username: string; role: string };
  onLogout?: () => void;
  onOpenSettings?: (tab?: string) => void;
  /** Hidden from topbar chrome. Prop retained so callers do not have to unwire; engine runtime stays. */
  onOptimizeNight?: () => void;
  engineRunning?: boolean;
  /** Hidden from chrome (PR A). Prop retained so callers do not have to unwire yet. */
  onRunWeek?: () => void;
  weekRunBusy?: boolean;
  onClearDay?: () => void;
  /** Deep refresh: bust server caches + refetch night + placement histories. */
  onRefreshDay?: () => void;
  refreshDayBusy?: boolean;
  rosterSummary?: {
    scheduledCount: number;
    placedCount: number;
    openCount: number;
    calledOffCount: number;
  };
  rosterDropdown?: RosterDropdownGroups;
  isDraftMode?: boolean;
  draftSlotCount?: number;
  onToggleDraftMode?: () => void;
  onSaveAllDraft?: () => void;
  draftApplyBusy?: boolean;
  /** Confirm dialog is the write gate — header Apply must not look live. */
  draftApplyConfirming?: boolean;
  onDiscardDraft?: () => void;
  isSyncing?: boolean;
  rosterOpen?: boolean;
  /** Toggles the real RosterRail panel (search, band filters, drag-to-assign). */
  onToggleRoster?: () => void;
  canvasMode?: "builder" | "print-preview";
  onCanvasModeChange?: (mode: "builder" | "print-preview") => void;
  isDayPublished?: boolean;
  canPublishDay?: boolean;
  onToggleDayPublished?: () => void;
  publishDayBusy?: boolean;
  onPublishWeek?: () => void;
  onUnpublishWeek?: () => void;
  publishWeekBusy?: boolean;
  top?: number;
  permissions?: ShiftBuilderPermissions;
}

const MONTHS = MONTH_LONG;
const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
function nightActionClusterStyle(): CSSProperties {
  return {
    height: 32,
    padding: 2,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    background: "#F4F6FA",
    border: "1px solid #E6EAF0",
    boxShadow: "none",
  };
}

function nightActionSegmentStyle(extra?: CSSProperties): CSSProperties {
  return {
    height: 28,
    minWidth: 68,
    padding: "0 12px",
    borderRadius: 6,
    border: 0,
    background: "transparent",
    color: "#334155",
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: "-0.01em",
    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background var(--sb-motion-instant) var(--sb-spring-snappy), color var(--sb-motion-instant) var(--sb-spring-snappy), opacity var(--sb-motion-instant) var(--sb-spring-snappy)",
    ...extra,
  };
}

function SheetBuilderMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      role="img"
      aria-label="SheetBuilder"
      focusable="false"
    >
      <rect width="32" height="32" rx="4" fill="#EEF1F6" />
      <rect x="6" y="8" width="20" height="2" fill="#64748B" />
      <rect x="6" y="15" width="20" height="2" fill="#64748B" opacity="0.65" />
      <rect x="6" y="22" width="13" height="2" fill="#64748B" opacity="0.4" />
    </svg>
  );
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
    onPrevWeek,
    onNextWeek,
    onPrint,
    printBusy = false,
    isDark = false,
    userInitials = "OP",
    currentUser,
    onLogout,
    onOpenSettings,
    onClearDay,
    onRefreshDay,
    refreshDayBusy = false,
    rosterSummary,
    isDraftMode = false,
    draftSlotCount = 0,
    onToggleDraftMode,
    onSaveAllDraft,
    draftApplyBusy = false,
    draftApplyConfirming = false,
    rosterOpen = false,
    onToggleRoster,
    canvasMode = "builder",
    onCanvasModeChange,
    isDayPublished = false,
    canPublishDay = false,
    onToggleDayPublished,
    publishDayBusy = false,
    top = 0,
    permissions,
  } = props;

  const canEditAssignments = permissions?.canEditAssignments ?? false;
  const canPublish = permissions?.canPublish ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;
  const canApplySchedules = permissions?.canApplySchedules ?? false;
  const canSeeDraftData = permissions?.canSeeDraftData ?? false;
  const showDraftTools = canSeeDraftData && canEditAssignments;
  const showPublishControls = canPublish;
  const showAdminLinks = canAccessSudo;
  const showTeamLink = canManageTeam || canApplySchedules || canAccessSudo;

  const [moreOpen, setMoreOpen] = useState(false);
  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  const [rosterMenuOpen, setRosterMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const launchpadRef = useRef<HTMLDivElement>(null);
  const rosterMenuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId);
  const chromeText = "#0F172A";
  const mutedChromeText = "#64748B";
  const chromeDivider = "#E6EAF0";
  const rosterScheduledCount = rosterSummary?.scheduledCount ?? 0;
  const rosterPlacedCount = rosterSummary?.placedCount ?? 0;
  const rosterOpenCount = rosterSummary?.openCount ?? 0;
  const rosterCalledOffCount = rosterSummary?.calledOffCount ?? 0;
  const rosterButtonTitle =
    `Roster · ${rosterPlacedCount}/${rosterScheduledCount} placed` +
    (rosterOpenCount > 0 ? ` · ${rosterOpenCount} open` : "") +
    (rosterCalledOffCount > 0 ? ` · ${rosterCalledOffCount} marked off` : "");

  const firstDay = days[0]?.date || new Date();
  const monthLabel = `${MONTHS[firstDay.getMonth()]} ${firstDay.getFullYear()}`;

  const closeAllMenus = () => {
    setLaunchpadOpen(false);
    setRosterMenuOpen(false);
    setMoreOpen(false);
    setProfileOpen(false);
    setCalendarOpen(false);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (launchpadRef.current && !launchpadRef.current.contains(target)) setLaunchpadOpen(false);
      if (rosterMenuRef.current && !rosterMenuRef.current.contains(target)) setRosterMenuOpen(false);
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
    setCalendarOpen((v) => !v);
    setLaunchpadOpen(false);
    setRosterMenuOpen(false);
    setMoreOpen(false);
    setProfileOpen(false);
  };

  const menuPanelClass =
    "rounded-xl border border-[#E6EAF0] bg-white shadow-sm py-1 text-[13px] text-[#0F172A]";
  const menuItemClass =
    "w-full text-left px-3 py-1.5 hover:bg-[#F4F6FA] flex items-center gap-2 disabled:opacity-40";
  const menuDividerClass = "h-px bg-[#E6EAF0] my-1 mx-2";

  const isViewingToday = !!selectedDay?.isToday;
  const packageCalendarActiveIndex = Math.max(0, days.findIndex((day) => day.id === selectedDayId));

  const handleGoToToday = () => {
    closeAllMenus();
    onToday();
  };

  return (
    <>
      <style>{`
        .icon-btn { transition: background var(--sb-motion-instant) var(--sb-spring-snappy); }
        .icon-btn:hover { background: rgba(0,0,0,0.06); }
        .icon-btn:active { background: rgba(0,0,0,0.11); }
        .icon-btn:focus-visible { outline: 2px solid #94A3B8; outline-offset: 2px; }
        .live-dot { box-shadow: none; }
      `}</style>

      <nav
        className="sb-sheetbuilder-topbar"
        style={{
          position: "fixed",
          top: top,
          left: 0,
          right: 0,
          width: "100%",
          minWidth: 0,
          background: "#FFFFFF",
          borderRadius: 0,
          border: "none",
          borderBottom: "1px solid #E6EAF0",
          boxShadow: "none",
          boxSizing: "border-box",
          height: 54,
          maxHeight: 54,
          padding: "0 16px",
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 0,
          zIndex: 40,
        }}
      >
        {/* BRAND — SheetBuilder launchpad */}
        <div className="sb-topbar-brand relative flex shrink-0 items-center gap-2.5 border-r border-[#E6EAF0] pr-5" ref={launchpadRef}>
          <button
            type="button"
            className="sb-sheetbuilder-launch-trigger sb-interactive flex min-w-0 items-center gap-2.5 rounded-md"
            onClick={() => {
              setLaunchpadOpen((v) => !v);
              setRosterMenuOpen(false);
              setMoreOpen(false);
              setProfileOpen(false);
              setCalendarOpen(false);
            }}
            title="SheetBuilder launchpad"
            aria-label="Open SheetBuilder launchpad"
            aria-haspopup="menu"
            aria-expanded={launchpadOpen}
          >
            <SheetBuilderMark className="sb-sheetbuilder-brand-mark shrink-0" />
            <div className="min-w-0 pr-1 text-left leading-none">
              <div
                className="truncate text-[13px] font-semibold"
                style={{ color: chromeText, letterSpacing: "-0.025em" }}
              >
                SheetBuilder
              </div>
            </div>
          </button>

          {launchpadOpen && (
            <div
              role="menu"
              aria-label="SheetBuilder launchpad"
              className="sb-sheetbuilder-launchpad absolute left-0 top-full z-[90] mt-1.5 overflow-hidden rounded-md border border-[#E6EAF0] bg-white p-1 text-[#0F172A]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sb-sheetbuilder-launchpad-grid flex flex-col">
                <Link href={APP_BASE_PATH} role="menuitem" className="sb-sheetbuilder-launchpad-card" onClick={() => setLaunchpadOpen(false)}>
                  <span className="sb-sheetbuilder-launchpad-card-icon">
                    <Home size={15} strokeWidth={2} />
                  </span>
                  <strong>Home</strong>
                </Link>

                {showTeamLink && (
                  <Link href={`${APP_BASE_PATH}/team`} role="menuitem" className="sb-sheetbuilder-launchpad-card" onClick={() => setLaunchpadOpen(false)}>
                    <span className="sb-sheetbuilder-launchpad-card-icon">
                      <Users size={15} strokeWidth={2} />
                    </span>
                    <strong>Team</strong>
                  </Link>
                )}

                {showAdminLinks && onOpenSettings && (
                  <button
                    type="button"
                    role="menuitem"
                    className="sb-sheetbuilder-launchpad-card"
                    onClick={() => {
                      onOpenSettings();
                      setLaunchpadOpen(false);
                    }}
                  >
                    <span className="sb-sheetbuilder-launchpad-card-icon">
                      <Settings size={15} strokeWidth={2} />
                    </span>
                    <strong>Settings</strong>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 w-4" />

        {/* LEFT — month picker + go to today */}
        <div className="sb-topbar-month relative flex items-center gap-1 shrink-0" ref={calendarRef}>
          <button
            type="button"
            className="icon-btn sb-interactive flex items-center gap-1 rounded-full px-2.5 py-1.5"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: chromeText,
              letterSpacing: "-0.02em",
            }}
            onClick={toggleCalendar}
            title="Pick a date"
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
          >
            {monthLabel}
            <ChevronDown
              size={12}
              strokeWidth={2.8}
              style={{
                color: mutedChromeText,
                marginTop: 1,
                transform: calendarOpen ? "rotate(180deg)" : undefined,
                transition: "transform var(--sb-motion-instant) var(--sb-spring-snappy)",
              }}
            />
          </button>
          <button
            type="button"
            className="icon-btn sb-interactive sb-month-status-diamond-btn flex items-center justify-center w-6 h-6 rounded-full"
            style={{
              opacity: isViewingToday ? 0.72 : 1,
            }}
            onClick={handleGoToToday}
            title={isViewingToday ? "Viewing today" : "Go to today"}
            aria-label={isViewingToday ? "Viewing today" : "Go to today"}
            disabled={isViewingToday}
          >
            <span className="sb-month-status-diamond" aria-hidden />
          </button>

          {calendarOpen && (
            <MiniCalendar
              activeDate={packageCalendarActiveIndex}
              onClose={() => setCalendarOpen(false)}
              onSelect={(railIndex) => {
                const day = days[railIndex];
                if (day?.date) {
                  onDaySelect(day.id, day.date);
                  return;
                }
                if (day?.dateNum && selectedDate) {
                  onNavigateToDate?.(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day.dateNum));
                }
              }}
            />
          )}
        </div>

        <div className="shrink-0 mx-1" style={{ width: 1, height: 30, background: chromeDivider }} />

        {/* CENTER — day scroller */}
        <div className="sb-topbar-days flex items-center flex-1 min-w-0 gap-0.5">
          <button
            type="button"
            onClick={onPrevWeek}
            className="icon-btn sb-interactive sb-week-nav-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
            style={{ color: mutedChromeText }}
            title="Previous GRAVE week"
            aria-label="Previous GRAVE week"
          >
            <ChevronLeft size={13} strokeWidth={2.8} />
          </button>

          <div className="sb-topbar-day-strip flex items-center justify-around flex-1 px-1">
            {days.map((day, dayIndex) => {
              const isSelected = day.id === selectedDayId;
              const isToday = !!day.isToday;
              const isNextDay = !isSelected && days[dayIndex - 1]?.id === selectedDayId;
              const letter = day.dayLetter || DAY_LETTERS[(day.date?.getDay() ?? 0) % 7];
              const dateNum = day.dateNum ?? day.label;

              if (isSelected) {
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => onDaySelect(day.id, day.date || new Date())}
                    className="sb-day-strip-btn sb-day-strip-btn--active flex flex-col items-center justify-center shrink-0"
                    style={{
                      background: "transparent",
                      borderRadius: 0,
                      width: 36,
                      height: 44,
                      gap: 3,
                      boxShadow: "none",
                      borderBottom: "2px solid #0F172A",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 850,
                        color: "#64748B",
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                      }}
                    >
                      {day.shortLabel || SHORT_MONTHS[day.date?.getMonth() ?? 0]}
                    </span>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 850,
                        color: "#0F172A",
                        lineHeight: 1,
                        letterSpacing: "0",
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
                  className={`sb-interactive sb-day-strip-btn sb-day-strip-btn--inactive flex flex-col items-center justify-center shrink-0${isNextDay ? " sb-day-strip-btn--ahead" : ""}`}
                  style={{
                    width: 36,
                    height: 44,
                    gap: 3,
                    border: "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 850, color: isToday ? "#334155" : "#94A3B8", lineHeight: 1, letterSpacing: "0.08em" }}>
                    {letter}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 850, color: isToday ? "#0F172A" : "#64748B", lineHeight: 1 }}>
                    {dateNum}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onNextWeek}
            className={`icon-btn sb-interactive sb-week-nav-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0${days[days.length - 1]?.id === selectedDayId ? " sb-week-nav-btn--ahead" : ""}`}
            style={{ color: mutedChromeText }}
            title="Next GRAVE week"
            aria-label="Next GRAVE week"
          >
            <ChevronRight size={13} strokeWidth={2.8} />
          </button>
        </div>

        <div className="shrink-0 mx-1" style={{ width: 1, height: 30, background: chromeDivider }} />

        {/* RIGHT — night actions (seen) + roster + more */}
        <div className="sb-topbar-actions flex items-center gap-1 shrink-0">
          <div
            className={`sb-night-action-pills flex items-center shrink-0${isDraftMode ? " sb-night-action-pills--draft-active" : ""}`}
            role="group"
            aria-label="Night actions"
            style={nightActionClusterStyle()}
          >
            {showDraftTools && onToggleDraftMode && (
              isDraftMode && draftSlotCount > 0 && onSaveAllDraft ? (
                <div
                  className="sb-night-action-pill sb-night-action-pill--draft sb-night-action-pill--split"
                  style={{ display: "inline-flex", alignItems: "center", height: 28 }}
                >
                  <button
                    type="button"
                    className="sb-night-action-pill__segment sb-interactive"
                    onClick={onToggleDraftMode}
                    title="Draft mode on — edits stay provisional"
                    aria-pressed
                    aria-label={`Draft mode on — ${draftSlotCount} change${draftSlotCount === 1 ? "" : "s"}`}
                    style={nightActionSegmentStyle({
                      color: "var(--sb-gold-ink)",
                      background: "var(--sb-gold-surface)",
                    })}
                  >
                    <span>Draft</span>
                    <span className="tabular-nums opacity-70">{draftSlotCount}</span>
                  </button>
                  <button
                    type="button"
                    className="sb-night-action-pill__apply sb-interactive"
                    onClick={onSaveAllDraft}
                    disabled={draftApplyBusy || draftApplyConfirming}
                    aria-busy={draftApplyBusy || draftApplyConfirming}
                    aria-haspopup="dialog"
                    aria-expanded={draftApplyConfirming || undefined}
                    title={APPLY_TO_LIVE_OPEN_CONFIRM}
                    aria-label={`Apply ${draftSlotCount} draft change${draftSlotCount === 1 ? "" : "s"} to the live board — confirm required`}
                    style={nightActionSegmentStyle({
                      color: "var(--sb-gold-ink)",
                      fontWeight: 650,
                    })}
                  >
                    {draftApplyBusy ? APPLY_TO_LIVE_BUSY_LABEL : APPLY_TO_LIVE_CONFIRM_LABEL}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sb-night-action-pill sb-night-action-pill--draft sb-interactive"
                  style={nightActionSegmentStyle(
                    isDraftMode
                      ? { color: "var(--sb-gold-ink)", background: "var(--sb-gold-surface)" }
                      : undefined,
                  )}
                  onClick={onToggleDraftMode}
                  aria-pressed={isDraftMode}
                  title={
                    isDraftMode
                      ? "Draft mode on — no unapplied changes"
                      : "Enter Draft mode"
                  }
                  aria-label={isDraftMode ? "Draft mode on" : "Enter Draft mode"}
                >
                  <span>Draft</span>
                </button>
              )
            )}

            {onPrint && (
              <button
                type="button"
                className="sb-night-action-pill sb-night-action-pill--print sb-interactive"
                style={nightActionSegmentStyle()}
                onClick={onPrint}
                disabled={printBusy}
                aria-busy={printBusy}
                title="Open Print Command Center"
                aria-label="Print"
              >
                {printBusy ? <span>Printing…</span> : <span>Print</span>}
              </button>
            )}
          </div>

          <div className="relative" ref={rosterMenuRef}>
            <button
              type="button"
              className="sb-sheetbuilder-roster-toggle icon-btn sb-interactive flex items-center justify-center rounded-full"
              style={{
                color: rosterOpen ? "#0F172A" : mutedChromeText,
                background: rosterOpen ? "#EEF1F6" : "transparent",
              }}
              onClick={() => {
                // Opens the real RosterRail. This used to open a read-only
                // popover listing names with no search, filters, or drag —
                // while the functional panel was only reachable from the
                // utility rail, which this skin hides.
                setRosterMenuOpen(false);
                setLaunchpadOpen(false);
                setMoreOpen(false);
                setProfileOpen(false);
                setCalendarOpen(false);
                onToggleRoster?.();
              }}
              title={rosterButtonTitle}
              aria-label={rosterOpen ? "Hide roster" : "Show roster"}
              aria-pressed={rosterOpen}
            >
              <ClipboardList size={16} strokeWidth={2} />
              {rosterCalledOffCount > 0 && (
                <span className="sb-sheetbuilder-roster-alert" title={`${rosterCalledOffCount} marked off`}>
                  {rosterCalledOffCount}
                </span>
              )}
            </button>

          </div>

          {showPublishControls ? (
            <button
              type="button"
              className="sb-topbar-publish icon-btn sb-interactive flex items-center rounded-full px-2 py-1"
              style={{ fontSize: 11, fontWeight: 550, color: mutedChromeText, letterSpacing: "0.01em" }}
              onClick={onToggleDayPublished}
              disabled={!canPublishDay || publishDayBusy}
              aria-busy={publishDayBusy}
              title={isDayPublished ? "Unpublish this day" : "Publish this day"}
            >
              {isDayPublished ? "Published" : "Unpublished"}
            </button>
          ) : (
            <span
              className="sb-topbar-publish flex items-center rounded-full px-2 py-1 text-[11px] font-medium tracking-normal opacity-80"
              style={{ color: mutedChromeText }}
              title={
                isDayPublished
                  ? "Published night"
                  : "Unpublished — floor viewers cannot open this night"
              }
            >
              {isDayPublished ? "Published" : "Unpublished"}
            </span>
          )}

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="sb-topbar-account icon-btn sb-interactive flex items-center justify-center w-7 h-7 rounded-full shrink-0"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.02em",
                color: chromeText,
                background: "#EEF1F6",
              }}
            onClick={() => {
              setProfileOpen((v) => !v);
              setRosterMenuOpen(false);
              setLaunchpadOpen(false);
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
                <div className="border-b border-[#E6EAF0] px-3 py-2 text-[12px] text-[#64748B]">
                  {currentUser.full_name}
                  <div className="opacity-80">{currentUser.username} · {roleLabel(currentUser.role)}</div>
                </div>
                {showAdminLinks && onOpenSettings && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onOpenSettings();
                      setProfileOpen(false);
                    }}
                  >
                    Settings
                  </button>
                )}
                {showTeamLink && (
                  <Link
                    href={`${APP_BASE_PATH}/team`}
                    className={menuItemClass}
                    onClick={() => setProfileOpen(false)}
                  >
                    <Users size={14} />
                    Team
                  </Link>
                )}
                <button type="button" className={menuItemClass} onClick={() => { onLogout?.(); setProfileOpen(false); }}>
                  Sign out
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className="sb-topbar-more icon-btn sb-interactive flex items-center justify-center w-6 h-6 rounded-full"
              style={{ color: mutedChromeText }}
            onClick={() => {
              setMoreOpen((v) => !v);
              setRosterMenuOpen(false);
              setLaunchpadOpen(false);
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
                className={`absolute right-0 top-full mt-2 w-56 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain z-[70] ${menuPanelClass}`}
                style={{ borderColor: isDark ? undefined : "rgba(0,0,0,0.08)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {onViewChange && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onViewChange(currentView === "breaks" ? "deployment" : "breaks");
                      setMoreOpen(false);
                    }}
                  >
                    <Layers size={14} />
                    {currentView === "breaks" ? "Deployment board" : "Overlap sheet"}
                  </button>
                )}
                <div
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                >
                  Maintenance
                </div>
                {showDraftTools && onClearDay && (
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
                {onRefreshDay && (
                  <button
                    type="button"
                    className={menuItemClass}
                    disabled={refreshDayBusy}
                    onClick={() => {
                      onRefreshDay();
                      setMoreOpen(false);
                    }}
                  >
                    <RefreshCw size={14} className={refreshDayBusy ? "animate-spin" : undefined} />
                    {refreshDayBusy ? "Refreshing Day…" : "Refresh Day"}
                  </button>
                )}

                {showPublishControls && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onToggleDayPublished?.();
                      setMoreOpen(false);
                    }}
                    disabled={!canPublishDay || publishDayBusy}
                    aria-busy={publishDayBusy}
                  >
                    {isDayPublished ? "Unpublish Day" : "Publish Day"}
                  </button>
                )}

                {showTeamLink && (
                  <Link
                    href={`${APP_BASE_PATH}/team?tab=schedule`}
                    className={menuItemClass}
                    onClick={() => setMoreOpen(false)}
                  >
                    <CalendarDays size={14} />
                    Graves Schedule
                  </Link>
                )}

                {onCanvasModeChange && (
                  <>
                    <div className={menuDividerClass} />
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
                          <X size={14} /> Exit Print Preview
                        </>
                      ) : (
                        <>
                          <Eye size={14} /> View Print Preview
                        </>
                      )}
                    </button>
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
