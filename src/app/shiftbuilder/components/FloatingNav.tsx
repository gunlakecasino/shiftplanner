"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  addDays,
  MONTH_LONG,
} from "@/lib/shiftbuilder/dateUtils";
import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import { roleLabel } from "@/lib/auth/permissionCatalog";
import { RequestBoardModal } from "./RequestBoardModal";
import { MiniCalendar } from "../redesign/components/MiniCalendar";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Users,
  Layers,
  Sparkles,
  Settings,
  MoreHorizontal,
  Eye,
  X,
  Eraser,
  FilePenLine,
  Check,
  CalendarDays,
  BarChart2,
  RefreshCw,
  Bell,
  BookOpen,
  Copy,
  Printer,
  Zap,
  ClipboardList,
  ClipboardPlus,
  CalendarRange,
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
  /** Preview the unified week engine (rolling solve + cross-night polish + fairness ledger) for the visible grave week. Read-only — opens a results sheet, doesn't write. */
  onRunWeek?: () => void; // Optimize Week preview (uses unified week engine)
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
const DEFAULT_ACTIVE_COLOR = "#7B3226";

function hexShadow(color: string): string {
  const c = color.startsWith("#") && color.length === 7 ? `${color}59` : "rgba(0,0,0,0.25)";
  return `0 2px 8px ${c}`;
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
      <rect width="32" height="32" rx="7" fill="#1e1e28" />
      <rect x="5" y="5" width="6.5" height="9" rx="1.5" fill="#C8960C" />
      <rect x="12.75" y="5" width="6.5" height="9" rx="1.5" fill="#D93838" />
      <rect x="20.5" y="5" width="6.5" height="9" rx="1.5" fill="#4B7BE8" />
      <rect x="5" y="15.5" width="6.5" height="9" rx="1.5" fill="#D96B9A" />
      <rect x="12.75" y="15.5" width="6.5" height="9" rx="1.5" fill="#4CAF7D" />
      <rect x="20.5" y="15.5" width="6.5" height="9" rx="1.5" fill="#9B6A45" />
    </svg>
  );
}

const ROSTER_AVATAR_PALETTE = [
  "#e0a40c",
  "#ef4444",
  "#df5f9c",
  "#4db783",
  "#4f7fe5",
  "#8b5cf6",
  "#7b675e",
  "#0ea5b7",
];

function initialsForName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function rosterAvatarColor(person: RosterDropdownPerson, fallbackIndex: number): string {
  if (person.color) return person.color;
  const key = `${person.id || ""}${person.name || ""}`;
  let hash = fallbackIndex;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return ROSTER_AVATAR_PALETTE[hash % ROSTER_AVATAR_PALETTE.length] ?? ROSTER_AVATAR_PALETTE[0];
}

const EMPTY_ROSTER_DROPDOWN: RosterDropdownGroups = {
  scheduledDefault: [],
  scheduledOverlaps: [],
  markedOff: [],
  notScheduled: [],
};

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
    onCopyPriorWeekTasks,
    onCopyYesterdayTasks,
    onApplyOverlapTasks,
    applyOverlapTasksBusy = false,
    onPrint,
    onOpenCoverGuide,
    isDark = false,
    contentMaxWidth,
    userInitials = "OP",
    currentUser,
    onLogout,
    onOpenSettings,
    onOptimizeNight,
    onRunWeek,
    weekRunBusy = false,
    engineRunning = false,
    onClearDay,
    onRefreshDay,
    refreshDayBusy = false,
    rosterSummary,
    rosterDropdown,
    isDraftMode = false,
    draftSlotCount = 0,
    onToggleDraftMode,
    onSaveAllDraft,
    onDiscardDraft,
    rosterOpen = false,
    canvasMode = "builder",
    onCanvasModeChange,
    isDayPublished = false,
    canPublishDay = false,
    onToggleDayPublished,
    publishDayBusy = false,
    onPublishWeek,
    onUnpublishWeek,
    publishWeekBusy = false,
    onToggleWeekHealth,
    weekHealthVisible = false,
    top = 0,
    permissions,
  } = props;

  const canEditAssignments = permissions?.canEditAssignments ?? false;
  const canPublish = permissions?.canPublish ?? false;
  const canRunEngine = permissions?.canRunEngine ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;
  const canAccessReports = permissions?.canAccessReports ?? false;
  const canAccessTasks = permissions?.canAccessTasks ?? false;
  const canRequestTasks = permissions?.canRequestTasks ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;
  const canApplySchedules = permissions?.canApplySchedules ?? false;
  const canSeeDraftData = permissions?.canSeeDraftData ?? false;
  const showDraftTools = canSeeDraftData && canEditAssignments;
  const showPublishControls = canPublish;
  const showEngineTools = canRunEngine;
  const engineBusy = engineRunning;
  const showAdminLinks = canAccessSudo;
  const showReportsLink = canAccessReports;
  const showProjectsLink = canAccessTasks;
  const showTeamLink = canManageTeam || canApplySchedules || canAccessSudo;

  const [moreOpen, setMoreOpen] = useState(false);
  const [launchpadOpen, setLaunchpadOpen] = useState(false);
  const [rosterMenuOpen, setRosterMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const launchpadRef = useRef<HTMLDivElement>(null);
  const rosterMenuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const selectedDay = days.find((d) => d.id === selectedDayId);
  const activeColor = "#22c55e";
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
  const notificationCount = rosterCalledOffCount;
  const navRoster = rosterDropdown ?? EMPTY_ROSTER_DROPDOWN;

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

  const renderRosterRows = (people: RosterDropdownPerson[], emptyLabel = "No team members") => {
    if (!people.length) {
      return <div className="sb-sheetbuilder-roster-popover__empty">{emptyLabel}</div>;
    }

    return people.map((person, index) => {
      const initials = person.initials || initialsForName(person.name);
      const color = rosterAvatarColor(person, index);
      return (
        <div className="sb-sheetbuilder-roster-popover__row" key={person.id || `${person.name}-${index}`}>
          <span
            className="sb-sheetbuilder-roster-popover__avatar"
            style={{ background: color }}
            aria-hidden
          >
            {initials.slice(0, 2)}
          </span>
          <span className="sb-sheetbuilder-roster-popover__name">{person.name}</span>
        </div>
      );
    });
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
          fontFamily: "var(--font-ui, var(--font-builder, 'Helvetica Neue', Helvetica, Arial, sans-serif))",
          userSelect: "none",
          display: "flex",
          alignItems: "center",
          gap: 0,
          zIndex: 40,
        }}
      >
        {/* BRAND — SheetBuilder launchpad */}
        <div className="relative flex shrink-0 items-center gap-2.5 border-r border-white/10 pr-5" ref={launchpadRef}>
          <button
            type="button"
            className="sb-sheetbuilder-launch-trigger flex min-w-0 items-center gap-2.5 rounded-md"
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

                {showReportsLink && (
                  <Link href={`${APP_BASE_PATH}/reports`} role="menuitem" className="sb-sheetbuilder-launchpad-card" onClick={() => setLaunchpadOpen(false)}>
                    <span className="sb-sheetbuilder-launchpad-card-icon">
                      <BarChart2 size={28} strokeWidth={2} />
                    </span>
                    <strong>Reports</strong>
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

        <div className="shrink-0 w-4" />

        {/* LEFT — month picker + go to today */}
        <div className="relative flex items-center gap-1 shrink-0" ref={calendarRef}>
          <button
            type="button"
            className="icon-btn flex items-center gap-1 rounded-full px-2.5 py-1.5"
            style={{
              fontSize: 13,
              fontWeight: 850,
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
            className="icon-btn sb-month-status-diamond-btn flex items-center justify-center w-6 h-6 rounded-full"
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
        <div className="flex items-center flex-1 min-w-0 gap-0.5">
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

          <div className="flex items-center justify-around flex-1 px-1">
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
                    className="sb-day-strip-btn sb-day-strip-btn--active flex flex-col items-center justify-center shrink-0 transition-transform active:scale-95"
                    style={{
                      background: activeColor,
                      borderRadius: 999,
                      width: 42,
                      height: 42,
                      gap: 0,
                      boxShadow: "0 6px 16px -9px rgba(34,197,94,0.95), inset 0 1px 0 rgba(255,255,255,0.22)",
                    }}
                  >
                    <span
                      style={{
	                        fontSize: 8,
	                        fontWeight: 900,
                        color: "rgba(255,255,255,0.76)",
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                        marginBottom: 2,
                      }}
                    >
                      {day.shortLabel || SHORT_MONTHS[day.date?.getMonth() ?? 0]}
                    </span>
                    <span
                      style={{
	                        fontSize: 18,
	                        fontWeight: 950,
                        color: "#fff",
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

        {/* RIGHT — actions + avatar + more */}
        <div className="flex items-center gap-0.5 shrink-0">
          {showEngineTools && onOptimizeNight && (
            <button
              type="button"
              className="icon-btn sb-interactive sb-run-day-btn flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{
                color: engineBusy ? "#888" : "#fff",
                background: engineBusy ? "rgba(255,255,255,0.08)" : activeColor,
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: "0.02em",
                boxShadow: engineBusy ? undefined : hexShadow(activeColor),
              }}
              disabled={engineBusy}
              onClick={onOptimizeNight}
              title="Run day placements"
              aria-label="Run day placements"
            >
              <Zap size={13} strokeWidth={2.4} fill="currentColor" />
              <span className="hidden min-[860px]:inline">Run Day</span>
            </button>
          )}

          <button
            type="button"
            className="sb-topbar-notification-btn icon-btn flex items-center justify-center rounded-full"
            style={{
              color: mutedChromeText,
              background: "rgba(255,255,255,0.04)",
            }}
            title={
              notificationCount > 0
                ? `${notificationCount} roster notifications`
                : "No roster notifications"
            }
            aria-label={
              notificationCount > 0
                ? `${notificationCount} roster notifications`
                : "No roster notifications"
            }
          >
            <Bell size={15} strokeWidth={2} />
            {notificationCount > 0 && (
              <span className="sb-topbar-notification-badge">{notificationCount}</span>
            )}
          </button>

          <div className="relative" ref={rosterMenuRef}>
            <button
              type="button"
              className="sb-sheetbuilder-roster-toggle icon-btn flex items-center justify-center rounded-full"
              style={{
                color: rosterMenuOpen || rosterOpen ? "#fff" : mutedChromeText,
                background: rosterMenuOpen || rosterOpen
                  ? "rgba(255,255,255,0.13)"
                  : "rgba(255,255,255,0.04)",
              }}
              onClick={() => {
                setRosterMenuOpen((v) => !v);
                setLaunchpadOpen(false);
                setMoreOpen(false);
                setProfileOpen(false);
                setCalendarOpen(false);
              }}
              title={rosterButtonTitle}
              aria-label="Open roster"
              aria-haspopup="menu"
              aria-expanded={rosterMenuOpen}
              aria-pressed={rosterMenuOpen || rosterOpen}
            >
              <ClipboardList size={16} strokeWidth={2} />
              {rosterCalledOffCount > 0 && (
                <span className="sb-sheetbuilder-roster-alert" title={`${rosterCalledOffCount} marked off`}>
                  {rosterCalledOffCount}
                </span>
              )}
            </button>

            {rosterMenuOpen && (
              <div
                role="menu"
                aria-label="Roster"
                className="sb-sheetbuilder-roster-popover absolute right-0 top-full z-[92] mt-3"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sb-sheetbuilder-roster-popover__title">ROSTER</div>

                <section className="sb-sheetbuilder-roster-popover__section">
                  <div className="sb-sheetbuilder-roster-popover__section-header sb-sheetbuilder-roster-popover__section-header--scheduled">
                    <span className="sb-sheetbuilder-roster-popover__state-icon">✓</span>
                    <span>SCHEDULED</span>
                  </div>
                  <div className="sb-sheetbuilder-roster-popover__subhead">DEFAULT</div>
                  {renderRosterRows(navRoster.scheduledDefault, "No default schedule")}
                  <div className="sb-sheetbuilder-roster-popover__subhead">OVERLAPS</div>
                  {renderRosterRows(navRoster.scheduledOverlaps, "No overlap team members")}
                </section>

                <div className="sb-sheetbuilder-roster-popover__divider" />

                <section className="sb-sheetbuilder-roster-popover__section">
                  <div className="sb-sheetbuilder-roster-popover__section-header sb-sheetbuilder-roster-popover__section-header--off">
                    <span className="sb-sheetbuilder-roster-popover__state-icon">−</span>
                    <span>MARKED OFF</span>
                  </div>
                  {renderRosterRows(navRoster.markedOff, "Nobody marked off")}
                </section>

                <div className="sb-sheetbuilder-roster-popover__divider" />

                <section className="sb-sheetbuilder-roster-popover__section">
                  <div className="sb-sheetbuilder-roster-popover__section-header sb-sheetbuilder-roster-popover__section-header--unscheduled">
                    <span className="sb-sheetbuilder-roster-popover__state-icon">○</span>
                    <span>NOT SCHEDULED</span>
                  </div>
                  {renderRosterRows(navRoster.notScheduled, "Everyone is scheduled")}
                </section>
              </div>
            )}
          </div>

          {onViewChange && (
            <button
              type="button"
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full"
              style={{
                color: currentView === "breaks" ? "#fff" : mutedChromeText,
                background:
                  currentView === "breaks"
                    ? `${activeColor}66`
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

          {showPublishControls ? (
            <button
              type="button"
              className="icon-btn flex items-center gap-1.5 rounded-full px-2.5 py-1"
              style={{ fontSize: 10, fontWeight: 700, color: chromeText, letterSpacing: "0.06em" }}
              onClick={onToggleDayPublished}
              disabled={!canPublishDay || publishDayBusy}
              aria-busy={publishDayBusy}
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
          ) : (
            <span
              className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide opacity-80"
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
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: isDayPublished ? "#22c55e" : "#f59e0b",
                  display: "inline-block",
                }}
              />
              {isDayPublished ? "PUBLISHED" : "UNPUBLISHED"}
            </span>
          )}

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              className="icon-btn flex items-center justify-center w-7 h-7 rounded-full shrink-0"
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
                {showProjectsLink && (
                  <Link
                    href={`${APP_BASE_PATH}/projects`}
                    className={menuItemClass}
                    onClick={() => setProfileOpen(false)}
                  >
                    <ClipboardList size={14} />
                    Projects
                  </Link>
                )}
                {canRequestTasks && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      setProfileOpen(false);
                      setRequestOpen(true);
                    }}
                  >
                    <ClipboardPlus size={14} />
                    Request Work
                  </button>
                )}
                {showReportsLink && (
                  <Link
                    href={`${APP_BASE_PATH}/reports`}
                    className={menuItemClass}
                    onClick={() => setProfileOpen(false)}
                  >
                    <BarChart2 size={14} />
                    Reports
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
              className="icon-btn flex items-center justify-center w-6 h-6 rounded-full"
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
                className={`absolute right-0 top-full mt-2 w-64 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain z-[70] ${menuPanelClass}`}
                style={{ borderColor: isDark ? undefined : "rgba(0,0,0,0.08)" }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Engine & Maintenance */}
                {showEngineTools && (onOptimizeNight || onRunWeek) && (
                  <div
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] ${isDark ? "text-zinc-500" : "text-gray-400"}`}
                  >
                    Engine
                  </div>
                )}
                {showEngineTools && onOptimizeNight && (
                  <button
                    type="button"
                    className={menuItemClass}
                    disabled={engineBusy}
                    onClick={() => {
                      onOptimizeNight();
                      setMoreOpen(false);
                    }}
                  >
                    <Sparkles size={14} /> Run Day Placements
                    {engineRunning && (
                      <span className="ml-auto text-[10px] opacity-60">Running…</span>
                    )}
                  </button>
                )}
                {showEngineTools && onRunWeek && (
                  <button
                    type="button"
                    className={menuItemClass}
                    disabled={weekRunBusy}
                    onClick={() => {
                      onRunWeek();
                      setMoreOpen(false);
                    }}
                  >
                    <CalendarRange size={14} className="shrink-0" />
                    <span className="flex min-w-0 flex-col items-start leading-tight">
                      <span className="truncate">Optimize Week</span>
                      <span className="truncate text-[10px] font-normal opacity-60">
                        Cross-night fairness · preview + per-night draft
                      </span>
                    </span>
                    {weekRunBusy && (
                      <span className="ml-auto text-[10px] opacity-60">Running…</span>
                    )}
                  </button>
                )}
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

                {((showEngineTools && (onOptimizeNight || onRunWeek)) || (showDraftTools && onClearDay) || onRefreshDay) && (
                  <div className={menuDividerClass} />
                )}

                {/* Draft */}
                {showDraftTools && onToggleDraftMode && (
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
                {showDraftTools && onSaveAllDraft && (
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
                    Apply to Live
                    {draftSlotCount > 0 && (
                      <span className="ml-auto text-[11px] tabular-nums opacity-60">{draftSlotCount}</span>
                    )}
                  </button>
                )}
                {showDraftTools && onDiscardDraft && isDraftMode && draftSlotCount > 0 && (
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

                {showDraftTools && (onToggleDraftMode || onSaveAllDraft) && <div className={menuDividerClass} />}

                {/* Apply Overlap Tasks (K13): staffed AM/PM pool from ops_work_items.
                    Zone/RR defaults materialize on night create only (applySlotDefaultsToNight). */}
                {onApplyOverlapTasks && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onApplyOverlapTasks();
                      setMoreOpen(false);
                    }}
                    disabled={applyOverlapTasksBusy}
                  >
                    <Layers size={14} />
                    {applyOverlapTasksBusy ? "Applying…" : "Apply Overlap Tasks"}
                  </button>
                )}

                {/* Copies (task population) */}
                {showDraftTools && onCopyPriorWeekTasks && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onCopyPriorWeekTasks();
                      setMoreOpen(false);
                    }}
                  >
                    <Copy size={14} /> Copy Tasks from Prior Week
                  </button>
                )}
                {showDraftTools && onCopyYesterdayTasks && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onCopyYesterdayTasks();
                      setMoreOpen(false);
                    }}
                  >
                    <Copy size={14} /> Copy Tasks from Yesterday
                  </button>
                )}

                {(onApplyOverlapTasks || (showDraftTools && (onCopyPriorWeekTasks || onCopyYesterdayTasks))) && (
                  <div className={menuDividerClass} />
                )}

                {/* Admin & Schedule */}
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

                {showPublishControls && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onPublishWeek?.();
                      setMoreOpen(false);
                    }}
                    disabled={publishWeekBusy}
                  >
                    Publish Week
                  </button>
                )}

                {showPublishControls && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onUnpublishWeek?.();
                      setMoreOpen(false);
                    }}
                    disabled={publishWeekBusy}
                  >
                    Unpublish Week
                  </button>
                )}

                {(showAdminLinks || showPublishControls) && (
                  <div className={menuDividerClass} />
                )}

                {/* Guides & Output */}
                {onOpenCoverGuide && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onOpenCoverGuide();
                      setMoreOpen(false);
                    }}
                  >
                    <BookOpen size={14} />
                    Grave Cover Guide
                  </button>
                )}

                {onPrint && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onPrint();
                      setMoreOpen(false);
                    }}
                  >
                    <Printer size={14} /> Print
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
                        <X size={14} /> Exit Print Preview
                      </>
                    ) : (
                      <>
                        <Eye size={14} /> View Print Preview
                      </>
                    )}
                  </button>
                )}

                {onViewChange && (
                  <button
                    type="button"
                    className={menuItemClass}
                    onClick={() => {
                      onViewChange(currentView === "weekly" ? "deployment" : "weekly");
                      setMoreOpen(false);
                    }}
                  >
                    <CalendarRange size={14} />
                    {currentView === "weekly" ? "Exit Weekly View" : "Weekly View"}
                  </button>
                )}

                {(onOpenCoverGuide || onPrint || onCanvasModeChange) && (
                  <div className={menuDividerClass} />
                )}

                {/* Analytics */}
                {showDraftTools && onToggleWeekHealth && (
                  <button type="button" className={menuItemClass} onClick={() => { onToggleWeekHealth(); setMoreOpen(false); }}>
                    {weekHealthVisible ? "Hide" : "Show"} Week Health
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>
      <RequestBoardModal open={requestOpen} onClose={() => setRequestOpen(false)} isDark={isDark} />
    </>
  );
}
