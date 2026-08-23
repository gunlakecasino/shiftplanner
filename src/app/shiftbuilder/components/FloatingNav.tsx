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
import { velvetGlassPillStyle } from "./canvasPillGlass";
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
  deepOptimizeRunning?: boolean;
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
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
function nightActionClusterStyle(): CSSProperties {
  return velvetGlassPillStyle({
    height: 32,
    padding: 2,
    borderRadius: 8,
    display: "inline-flex",
    alignItems: "center",
    gap: 0,
    boxShadow: "inset 0 1px 0 var(--sb-glass-highlight)",
  });
}

function nightActionSegmentStyle(extra?: CSSProperties): CSSProperties {
  return {
    height: 28,
    padding: "0 10px",
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
      <rect x="7" y="5" width="18" height="22" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M11 12.5h10M11 16.5h10M11 20.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const launchpadRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId);
  const chromeText = "#f4f4f5";
  const mutedChromeText = "rgba(244,244,245,0.62)";
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
    setMoreOpen(false);
    setProfileOpen(false);
    setCalendarOpen(false);
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (launchpadRef.current && !launchpadRef.current.contains(target)) setLaunchpadOpen(false);
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
          background: "linear-gradient(180deg, #343340 0%, #292933 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 0,
          border: "none",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 16px 40px -28px rgba(0,0,0,0.8)",
          boxSizing: "border-box",
          height: 54,
          maxHeight: 54,
          padding: "0 16px",
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 10,
          zIndex: 40,
        }}
      >
        {/* Identity + month — one quiet cluster, not a competing brand stack */}
        <div className="sb-topbar-identity relative flex shrink-0 items-center gap-2" ref={launchpadRef}>
          <button
            type="button"
            className="sb-sheetbuilder-launch-trigger sb-interactive flex min-w-0 items-center gap-1.5 rounded-md"
            onClick={() => {
              setLaunchpadOpen((v) => !v);
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
            <span
              className="sb-topbar-wordmark truncate text-[13px] font-medium"
              style={{ color: chromeText, letterSpacing: "-0.02em" }}
            >
              SheetBuilder
            </span>
          </button>

          {launchpadOpen && (
            <div
              role="menu"
              aria-label="SheetBuilder launchpad"
              className="sb-sheetbuilder-launchpad absolute left-0 top-full z-[90] mt-2 overflow-hidden rounded-[26px] border border-white/10 bg-[#252532] p-5 text-zinc-100 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sb-sheetbuilder-launchpad-grid grid grid-cols-2 gap-5">
                <Link href={APP_BASE_PATH} role="menuitem" className="sb-sheetbuilder-launchpad-card" onClick={() => setLaunchpadOpen(false)}>
                  <span className="sb-sheetbuilder-launchpad-card-icon">
                    <Home size={28} strokeWidth={2} />
                  </span>
                  <strong>Home</strong>
                </Link>

                {showTeamLink && (
                  <Link href={`${APP_BASE_PATH}/team`} role="menuitem" className="sb-sheetbuilder-launchpad-card" onClick={() => setLaunchpadOpen(false)}>
                    <span className="sb-sheetbuilder-launchpad-card-icon">
                      <Users size={28} strokeWidth={2} />
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
                      <Settings size={28} strokeWidth={2} />
                    </span>
                    <strong>Settings</strong>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="sb-topbar-month relative flex items-center gap-0.5 shrink-0" ref={calendarRef}>
          <button
            type="button"
            className="icon-btn sb-interactive sb-topbar-month-btn flex items-center gap-0.5 rounded-md px-1.5 py-1"
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: mutedChromeText,
              letterSpacing: "-0.01em",
            }}
            onClick={toggleCalendar}
            title="Pick a date"
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
          >
            {monthLabel}
            <ChevronDown
              size={11}
              strokeWidth={2.4}
              style={{
                color: "rgba(244,244,245,0.42)",
                marginTop: 1,
                transform: calendarOpen ? "rotate(180deg)" : undefined,
                transition: "transform 0.15s ease",
              }}
            />
          </button>
          <button
            type="button"
            className="icon-btn sb-interactive sb-month-status-diamond-btn flex items-center justify-center w-6 h-6 rounded-md"
            style={{
              opacity: isViewingToday ? 0.55 : 0.9,
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

        {/* Day strip — same type size as neighbors; selection is ink, not a neon pill */}
        <div className="sb-topbar-days flex items-center flex-1 min-w-0 gap-0.5">
          <button
            type="button"
            onClick={onPrevWeek}
            className="icon-btn sb-interactive sb-week-nav-btn flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{ color: mutedChromeText }}
            title="Previous GRAVE week"
            aria-label="Previous GRAVE week"
          >
            <ChevronLeft size={13} strokeWidth={2.4} />
          </button>

          <div className="sb-topbar-day-strip flex items-center justify-center flex-1 min-w-0">
            {days.map((day) => {
              const isSelected = day.id === selectedDayId;
              const isToday = !!day.isToday;
              const letter = day.dayLetter || DAY_LETTERS[(day.date?.getDay() ?? 0) % 7];
              const dateNum = day.dateNum ?? day.label;

              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => onDaySelect(day.id, day.date || new Date())}
                  onMouseEnter={() => onDayHover?.(day.id, day.date || new Date())}
                  className={`sb-interactive sb-day-strip-btn flex flex-col items-center justify-center shrink-0${
                    isSelected ? " sb-day-strip-btn--active" : " sb-day-strip-btn--inactive"
                  }${isToday ? " sb-day-strip-btn--today" : ""}`}
                  aria-current={isSelected ? "date" : undefined}
                  aria-label={`${letter} ${dateNum}${isToday ? ", today" : ""}`}
                >
                  <span className="sb-day-strip-letter">{letter}</span>
                  <span className="sb-day-strip-num">{dateNum}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onNextWeek}
            className="icon-btn sb-interactive sb-week-nav-btn flex items-center justify-center w-6 h-6 rounded-md shrink-0"
            style={{ color: mutedChromeText }}
            title="Next GRAVE week"
            aria-label="Next GRAVE week"
          >
            <ChevronRight size={13} strokeWidth={2.4} />
          </button>
        </div>

        {/* Engine / Draft / Print primary; Published + account secondary */}
        <div className="sb-topbar-actions flex items-center gap-1.5 shrink-0">
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

          {showPublishControls ? (
            <button
              type="button"
              className="sb-topbar-publish sb-interactive flex items-center gap-1.5 px-1.5 py-1"
              style={{ fontSize: 11, fontWeight: 500, color: mutedChromeText, letterSpacing: "0" }}
              onClick={onToggleDayPublished}
              disabled={!canPublishDay || publishDayBusy}
              aria-busy={publishDayBusy}
              title={isDayPublished ? "Unpublish this day" : "Publish this day"}
            >
              <span
                className="live-dot shrink-0"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: isDayPublished ? "#34d399" : "#d4a800",
                  display: "inline-block",
                }}
              />
              {isDayPublished ? "Published" : "Unpublished"}
            </button>
          ) : (
            <span
              className="sb-topbar-publish flex items-center gap-1.5 px-1.5 py-1 text-[11px] font-medium"
              style={{ color: mutedChromeText }}
              title={
                isDayPublished
                  ? "Published night"
                  : "Unpublished — floor viewers cannot open this night"
              }
            >
              <span
                className="shrink-0"
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: isDayPublished ? "#34d399" : "#d4a800",
                  display: "inline-block",
                }}
              />
              {isDayPublished ? "Published" : "Unpublished"}
            </span>
          )}

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="sb-topbar-account icon-btn sb-interactive flex items-center justify-center w-6 h-6 rounded-full shrink-0"
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.02em",
                color: mutedChromeText,
                background: "transparent",
              }}
            onClick={() => {
              setProfileOpen((v) => !v);
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
              className="sb-topbar-more icon-btn sb-interactive flex items-center justify-center w-6 h-6 rounded-md"
              style={{ color: "rgba(244,244,245,0.48)" }}
            onClick={() => {
              setMoreOpen((v) => !v);
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
                {(onToggleRoster || onViewChange) && (
                  <>
                    <div
                      className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                    >
                      Board
                    </div>
                    {onToggleRoster && (
                      <button
                        type="button"
                        className={menuItemClass}
                        onClick={() => {
                          onToggleRoster();
                          setMoreOpen(false);
                        }}
                        title={rosterButtonTitle}
                        aria-pressed={rosterOpen}
                      >
                        <ClipboardList size={14} />
                        {rosterOpen ? "Hide Roster" : "Roster"}
                        {rosterCalledOffCount > 0 && (
                          <span className="ml-auto text-[11px] tabular-nums opacity-60">
                            {rosterCalledOffCount}
                          </span>
                        )}
                      </button>
                    )}
                    {onViewChange && (
                      <button
                        type="button"
                        className={menuItemClass}
                        onClick={() => {
                          onViewChange(currentView === "breaks" ? "deployment" : "breaks");
                          setMoreOpen(false);
                        }}
                        aria-pressed={currentView === "breaks"}
                      >
                        <Layers size={14} />
                        {currentView === "breaks" ? "Deployment board" : "Overlap sheet"}
                      </button>
                    )}
                    <div className={menuDividerClass} />
                  </>
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
