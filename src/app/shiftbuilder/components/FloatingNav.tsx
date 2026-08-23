"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  MONTH_LONG,
} from "@/lib/shiftbuilder/dateUtils";
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
  onOpenCoverGuide?: () => void;
  isDark?: boolean;
  contentMaxWidth?: number;
  userInitials?: string;
  currentUser?: { full_name: string; username: string; role: string };
  onLogout?: () => void;
  onOpenSettings?: (tab?: string) => void;
  /** Primary day placement action: opens the SheetBuilder run confirmation. */
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
    height: 30,
    padding: 1,
    borderRadius: 4,
    display: "inline-flex",
    alignItems: "center",
    gap: 0,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "none",
  };
}

function nightActionSegmentStyle(extra?: CSSProperties): CSSProperties {
  return {
    height: 28,
    minWidth: 64,
    padding: "0 12px",
    borderRadius: 6,
    border: 0,
    background: "transparent",
    color: "var(--sb-text-2, #3C3C43)",
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "background 0.14s var(--sb-spring-snappy), color 0.14s var(--sb-spring-snappy)",
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
      <rect width="32" height="32" rx="4" fill="#2A2B32" />
      <rect x="6" y="8" width="20" height="2" fill="#C8C4BA" />
      <rect x="6" y="15" width="20" height="2" fill="#C8C4BA" opacity="0.65" />
      <rect x="6" y="22" width="13" height="2" fill="#C8C4BA" opacity="0.4" />
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
    isDark = false,
    userInitials = "OP",
    currentUser,
    onLogout,
    onOpenSettings,
    onOptimizeNight,
    engineRunning = false,
    onClearDay,
    onRefreshDay,
    refreshDayBusy = false,
    rosterSummary,
    isDraftMode = false,
    draftSlotCount = 0,
    onToggleDraftMode,
    onSaveAllDraft,
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
  const canRunEngine = permissions?.canRunEngine ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;
  const canApplySchedules = permissions?.canApplySchedules ?? false;
  const canSeeDraftData = permissions?.canSeeDraftData ?? false;
  const showDraftTools = canSeeDraftData && canEditAssignments;
  const showPublishControls = canPublish;
  const showEngineTools = canRunEngine;
  const engineBusy = engineRunning;
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
  const chromeText = "#f4f4f5";
  const mutedChromeText = "rgba(244,244,245,0.66)";
  const chromeDivider = "rgba(255,255,255,0.12)";
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
    "rounded-xl border border-white/10 bg-[#1d1d20] shadow-xl py-1 text-[13px] text-zinc-100";
  const menuItemClass =
    "w-full text-left px-3 py-1.5 hover:bg-white/10 flex items-center gap-2 disabled:opacity-40";
  const menuDividerClass = "h-px bg-white/10 my-1 mx-2";

  const isViewingToday = !!selectedDay?.isToday;
  const packageCalendarActiveIndex = Math.max(0, days.findIndex((day) => day.id === selectedDayId));

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
          background: "#1E1F24",
          borderRadius: 0,
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
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
        <div className="sb-topbar-brand relative flex shrink-0 items-center gap-2.5 border-r border-white/10 pr-5" ref={launchpadRef}>
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
              className="sb-sheetbuilder-launchpad absolute left-0 top-full z-[90] mt-1.5 overflow-hidden rounded-md border border-white/10 bg-[#1E1F24] p-1 text-zinc-100"
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
                transition: "transform 0.15s ease",
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
            {days.map((day) => {
              const isSelected = day.id === selectedDayId;
              const isToday = !!day.isToday;
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
                      borderBottom: "1px solid rgba(244,244,245,0.88)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 850,
                        color: "rgba(244,244,245,0.72)",
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
                        color: "#f4f4f5",
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
                  className="sb-interactive sb-day-strip-btn sb-day-strip-btn--inactive flex flex-col items-center justify-center shrink-0"
                  style={{
                    width: 36,
                    height: 44,
                    gap: 3,
                    border: "1px solid transparent",
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 850, color: isToday ? "rgba(255,255,255,0.72)" : "rgba(244,244,245,0.46)", lineHeight: 1, letterSpacing: "0.08em" }}>
                    {letter}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 850, color: isToday ? "rgba(255,255,255,0.82)" : "rgba(244,244,245,0.64)", lineHeight: 1 }}>
                    {dateNum}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onNextWeek}
            className="icon-btn sb-interactive sb-week-nav-btn flex items-center justify-center w-5 h-5 rounded-full shrink-0"
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
            {showEngineTools && onOptimizeNight && (
              <button
                type="button"
                className="sb-night-action-pill sb-night-action-pill--engine sb-interactive"
                style={nightActionSegmentStyle(
                  engineBusy
                    ? { color: "var(--sb-optimize-ink)" }
                    : undefined,
                )}
                disabled={engineBusy}
                onClick={onOptimizeNight}
                aria-busy={engineBusy}
                title="Engine — results land in Draft"
                aria-label="Engine — run day placements"
              >
                <span>{engineRunning ? "Running…" : "Engine"}</span>
              </button>
            )}

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
                    title="Apply draft changes to the live board"
                    aria-label={`Apply ${draftSlotCount} draft change${draftSlotCount === 1 ? "" : "s"} to the live board`}
                    style={nightActionSegmentStyle({
                      color: "var(--sb-gold-ink)",
                      fontWeight: 650,
                    })}
                  >
                    Apply
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
                title="Open Print Command Center"
                aria-label="Print"
              >
                <span>Print</span>
              </button>
            )}
          </div>

          <div className="relative" ref={rosterMenuRef}>
            <button
              type="button"
              className="sb-sheetbuilder-roster-toggle icon-btn sb-interactive flex items-center justify-center rounded-full"
              style={{
                color: rosterOpen ? "#fff" : mutedChromeText,
                background: rosterOpen
                  ? "rgba(255,255,255,0.13)"
                  : "rgba(255,255,255,0.04)",
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
                background: "rgba(255,255,255,0.08)",
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
                <div className="border-b border-white/10 px-3 py-2 text-[12px] text-zinc-400">
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
              style={{ color: "#aaa" }}
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
