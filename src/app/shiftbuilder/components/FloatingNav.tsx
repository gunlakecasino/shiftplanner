"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Rocket,
  Undo2,
  Redo2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  Search,
  Printer,
  LayoutGrid,
  Coffee,
  Users,
  PenLine,
  ScanEye,
  Table2,
} from "lucide-react";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BuilderSyncStrip } from "./builderPrimitives";

// Note: "cmdk" package import removed — the search capsule now exclusively triggers the global CommandPalette
// (react-cmdk based) via onCommandOpen. Duplicate local palette caused z-index + focus conflicts.

// ==================== CVA VARIANTS ====================
const NAV_ICON = "h-3.5 w-3.5 shrink-0 opacity-80";

function NavToolButton({
  onClick,
  title,
  ariaLabel,
  active = false,
  children,
  className,
}: {
  onClick?: () => void;
  title: string;
  ariaLabel?: string;
  active?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={ariaLabel ?? title}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5",
        isTabletTouchDevice() && "sb-tablet-touch-target h-11 w-11",
        active && "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

const navVariants = cva(
  "sb-floating-nav-pill fixed top-2 z-40 grid h-14 grid-cols-[auto_minmax(0,1fr)_max-content] items-center gap-1.5 rounded-3xl px-3 sm:px-4 transition-all duration-200",
  {
    variants: {
      glass: {
        true: "bg-white/85 dark:bg-zinc-950/85 backdrop-blur-[32px] border border-white/35 dark:border-white/12 shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.05),_0_2px_4px_-2px_rgb(0_0_0_/_0.03),_0_25px_50px_-12px_rgb(0_0_0_/_0.25),_inset_0_1px_0_rgba(255,255,255,0.98)]",
      },
    },
    defaultVariants: { glass: true },
  }
);

const datePillVariants = cva(
  "relative z-10 flex items-center justify-center rounded-full font-semibold tabular-nums transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C13A14]/40",
  {
    variants: {
      active: {
        true: "text-white",
        false: "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100",
      },
    },
    defaultVariants: { active: false },
  }
);

// ==================== TYPES ====================
export interface DayItem {
  id: number;
  label: string;
  shortLabel?: string;
  /** F/S/S/M/T/W/T — shown on inactive pills in the 9-day strip. */
  dayLetter?: string;
  /** True for Thu-before / Fri-after bridge pills (adjacent week boundaries). */
  isBridge?: boolean;
  dateNum?: number;
  isToday?: boolean;
  date?: Date;
}

export interface FloatingNavProps {
  days: DayItem[];
  selectedDayId: number;
  onDaySelect: (id: number, date: Date) => void;
  /** Called on hover for aggressive prefetch — makes day switching feel instant */
  onDayHover?: (id: number, date: Date) => void;
  currentView: "deployment" | "breaks";
  onViewChange: (view: "deployment" | "breaks") => void;
  placedCount?: { current: number; total: number }; // kept for compatibility, no longer rendered
  onToday: () => void;
  /** Return to ShiftBuilder launchpad (canvas mode only). */
  onLaunchpad?: () => void;
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomFit?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
  /** e.g. "108%" when zoomed; omit or "Fit" when at fit scale */
  zoomLabel?: string;
  isZoomed?: boolean;
  onCommandOpen?: () => void;
  onThemeToggle?: () => void;
  onPrint?: () => void;
  isDark?: boolean;
  userInitials?: string;

  /** Full authenticated operator for the profile dropdown */
  currentUser?: {
    full_name: string;
    username: string;
    role: string;
  };
  /** Sign out handler (from useOpsAuth) */
  onLogout?: () => void;
  /** Open Sudo (only shown for privileged roles). Fulfills the post-PIN auth UX request. */
  onOpenSudo?: () => void;
  isSyncing?: boolean;
  /** Floating roster panel — critical on iPad where roster defaults collapsed. */
  rosterOpen?: boolean;
  onRosterToggle?: () => void;
  /** Builder vs print-preview — lives in nav so it never covers zone cards. */
  canvasMode?: "builder" | "print-preview";
  onCanvasModeChange?: (mode: "builder" | "print-preview") => void;
  /** Weekly Overview live table (next to Launchpad + Today). */
  onWeeklyOverview?: () => void;
  weeklyOverviewOpen?: boolean;
}

// ==================== SPRING ====================
const SPRING = { type: "spring" as const, stiffness: 400, damping: 25 };

// ==================== COMPONENT ====================
export default function FloatingNav({
  days,
  selectedDayId,
  onDaySelect,
  onDayHover,
  currentView,
  onViewChange,
  placedCount,
  onToday,
  onLaunchpad,
  onPrevWeek,
  onNextWeek,
  onUndo,
  onRedo,
  onZoomFit,
  onZoomOut,
  onZoomIn,
  zoomLabel,
  isZoomed = false,
  onCommandOpen,
  onThemeToggle,
  onPrint,
  isDark = false,
  userInitials = "BC",
  currentUser,
  onLogout,
  onOpenSudo,
  isSyncing = false,
  rosterOpen = false,
  onRosterToggle,
  canvasMode = "builder",
  onCanvasModeChange,
  onWeeklyOverview,
  weeklyOverviewOpen,
}: FloatingNavProps) {
  const queryClient = useQueryClient();

  // Profile avatar dropdown state
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  // Close profile dropdown on outside click or Escape (matches existing patterns)
  useEffect(() => {
    if (!profileOpen) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = profileRef.current && profileRef.current.contains(target);
      const clickedMenu = profileMenuRef.current && profileMenuRef.current.contains(target);
      if (!clickedTrigger && !clickedMenu) {
        setProfileOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [profileOpen]);

  // Compute fixed position for the profile dropdown so it is never clipped by
  // ancestors (stage overflow-hidden, nav insets, transforms, or high-z overlays).
  // Using fixed + getBoundingClientRect guarantees it's always fully visible
  // and correctly right-aligned to the avatar, regardless of the floating nav's
  // complex calc'd width/positioning.
  useEffect(() => {
    if (!profileOpen) {
      setDropdownPos(null);
      return;
    }

    const computePos = () => {
      const container = profileRef.current;
      if (!container) return;
      const btn = container.querySelector("button") as HTMLElement | null;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 8, // matches mt-2 visually
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };

    // Run after paint so rects are accurate
    const raf = requestAnimationFrame(computePos);

    // Recompute on resize (nav can reflow)
    window.addEventListener("resize", computePos);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", computePos);
    };
  }, [profileOpen]);

  // TanStack Query for day switching with optimistic updates + instant feel
  const { data: currentDayData } = useQuery({
    queryKey: ["currentDay", selectedDayId],
    queryFn: async () => ({
      id: selectedDayId,
      date: days.find((d) => d.id === selectedDayId)?.date,
    }),
    staleTime: 1000 * 60 * 5,
  });

  const handleDaySelect = (id: number, date: Date) => {
    // Optimistic update — the UI updates immediately
    queryClient.setQueryData(["currentDay", id], { id, date });

    onDaySelect(id, date);

    // In a real app you would do:
    // await updateDayMutation.mutateAsync({ dayId: id });
    // queryClient.invalidateQueries({ queryKey: ["schedule", id] });
  };

  // Note: placedCount prop is kept for API compatibility but no longer used in the nav UI.

  const ACCENT = "#C13A14";

  const [compactCanvasToggle, setCompactCanvasToggle] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (min-width: 768px) and (max-width: 1180px)");
    const onMq = () => setCompactCanvasToggle(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    return () => mq.removeEventListener("change", onMq);
  }, []);

  const glassStyle = {
    background: isDark ? "rgba(9,9,11,0.85)" : "rgba(255,255,255,0.85)",
    backdropFilter: "blur(32px) saturate(180%)",
    WebkitBackdropFilter: "blur(32px) saturate(180%)",
    border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.35)",
    boxShadow: isDark
      ? "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1), 0 25px 50px -12px rgb(0 0 0 / 0.35), inset 0 1px 0 rgba(255,255,255,0.12)"
      : "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.03), 0 25px 50px -12px rgb(0 0 0 / 0.25), inset 0 1px 0 rgba(255,255,255,0.98)",
  };

  return (
    <>
      <nav
        className={cn(
          navVariants(),
          "relative overflow-hidden",
          isTabletTouchDevice() && "sb-tablet-nav",
        )}
        style={{ ...glassStyle, zIndex: 40 }}
      >
        <BuilderSyncStrip active={isSyncing} />
        {/* LEFT: Launchpad + Today */}
        <div className="flex shrink-0 items-center gap-0.5">
          {onLaunchpad ? (
            <NavToolButton onClick={onLaunchpad} title="Return to Launchpad">
              <Rocket className={NAV_ICON} />
            </NavToolButton>
          ) : null}
          <NavToolButton onClick={onToday} title="Jump to today">
            <Calendar className={NAV_ICON} />
          </NavToolButton>
          {onRosterToggle ? (
            <NavToolButton
              onClick={onRosterToggle}
              title={rosterOpen ? "Hide roster" : "Show roster"}
              ariaLabel={rosterOpen ? "Hide team roster panel" : "Show team roster panel"}
              active={rosterOpen}
            >
              <Users className={NAV_ICON} />
            </NavToolButton>
          ) : null}
          {onWeeklyOverview ? (
            <NavToolButton
              onClick={onWeeklyOverview}
              title="Weekly Overview"
              ariaLabel="Open live weekly overview table"
              active={weeklyOverviewOpen}
            >
              <Table2 className={NAV_ICON} />
            </NavToolButton>
          ) : null}
        </div>

        {/* CENTER: 9-day strip */}
        <div className="min-w-0 px-0.5">
          <div className="relative flex min-w-0 items-stretch justify-center">
            {/* Left seamless half-circle cap — previous GRAVE week */}
            {onPrevWeek && (
              <motion.button
                onClick={onPrevWeek}
                whileHover={{ scale: 1.08, opacity: 0.95 }}
                whileTap={{ scale: 0.88 }}
                transition={SPRING}
                className="absolute left-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full touch-manipulation"
                style={{
                  background: "rgba(0,0,0,0.025)",
                }}
                title="Previous GRAVE week (Friday)"
                aria-label="Previous GRAVE week — jump to Friday"
              >
                <motion.span
                  whileHover={{ x: -1.5 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-[#6B7280] dark:text-[#8E8E93]" />
                </motion.span>
              </motion.button>
            )}

            <div
              className="relative grid min-h-[40px] w-full min-w-0 grid-cols-9 gap-1 rounded-2xl px-7 py-1.5 sm:px-8"
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--sb-glass-border)",
              }}
            >
              {days.map((day) => {
                const isActive = day.id === selectedDayId;
                const isBridge = !!day.isBridge;

                return (
                  <button
                    key={day.id}
                    onClick={() => handleDaySelect(day.id, day.date || new Date())}
                    onMouseEnter={() => onDayHover?.(day.id, day.date || new Date())}
                    onTouchStart={() => onDayHover?.(day.id, day.date || new Date())}
                    className={cn(
                      datePillVariants({ active: isActive }),
                      "relative z-10 flex items-center justify-center rounded-full font-semibold tabular-nums min-h-[36px] w-full min-w-0 transition-all touch-manipulation",
                      isActive ? "text-[13px] px-1" : "text-[12px] px-0.5",
                    )}
                    style={{
                      background: isActive ? ACCENT : "transparent",
                      color: isActive ? "#fff" : isDark ? "#A1A1AA" : "#52525B",
                      border: isActive
                        ? `1px solid ${ACCENT}`
                        : isBridge
                          ? `1px dashed ${isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)"}`
                          : "1px solid transparent",
                      fontWeight: isActive ? 700 : 600,
                      opacity: isBridge && !isActive ? 0.85 : 1,
                    }}
                    title={
                      isBridge
                        ? day.id === 0
                          ? "Last day of previous GRAVE week (Thursday)"
                          : "First day of next GRAVE week (Friday)"
                        : undefined
                    }
                  >
                    {/* The sliding active highlight - pure layout animation */}
                    {isActive && (
                      <motion.div
                        layoutId="active-date-pill"
                        className="absolute inset-0 rounded-full -z-10"
                        style={{ background: ACCENT }}
                        transition={SPRING}
                      />
                    )}

                    <span className="leading-none tabular-nums flex flex-col items-center justify-center gap-0 min-w-0 w-full truncate">
                      {isActive && day.shortLabel ? (
                        <span
                          className="text-[9px] font-bold tracking-[0.4px] opacity-90 leading-none"
                          style={{ color: "#fff" }}
                        >
                          {day.shortLabel}
                        </span>
                      ) : null}
                      <span className="leading-none">
                        {isActive ? day.label : day.dayLetter ?? day.label}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Right seamless half-circle cap — next GRAVE week */}
            {onNextWeek && (
              <motion.button
                onClick={onNextWeek}
                whileHover={{ scale: 1.08, opacity: 0.95 }}
                whileTap={{ scale: 0.88 }}
                transition={SPRING}
                className="absolute right-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full touch-manipulation"
                style={{
                  background: "rgba(0,0,0,0.025)",
                }}
                title="Next GRAVE week (Friday)"
                aria-label="Next GRAVE week — jump to Friday"
              >
                <motion.span
                  whileHover={{ x: 1.5 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <ChevronRight className="h-3.5 w-3.5 text-[#6B7280] dark:text-[#8E8E93]" />
                </motion.span>
              </motion.button>
            )}
          </div>
        </div>

        {/* RIGHT: compact icon toolbar */}
        <div className="flex shrink-0 items-center gap-0.5 border-l border-white/20 pl-1.5 dark:border-white/10">
          <div
            className="flex shrink-0 items-center rounded-lg p-0.5"
            style={{ background: "rgba(0,0,0,0.04)" }}
          >
            <NavToolButton
              onClick={() => onViewChange("deployment")}
              title="Deployment board"
              ariaLabel="Deployment board"
              active={currentView === "deployment"}
            >
              <LayoutGrid className={NAV_ICON} />
            </NavToolButton>
            <NavToolButton
              onClick={() => onViewChange("breaks")}
              title="Break sheet"
              ariaLabel="Break sheet"
              active={currentView === "breaks"}
            >
              <Coffee className={NAV_ICON} />
            </NavToolButton>
          </div>

          {onCanvasModeChange ? (
            <div
              className={cn(
                "sb-nav-canvas-mode-toggle flex shrink-0 items-center rounded-lg p-0.5",
                compactCanvasToggle && "sb-nav-canvas-compact",
              )}
              style={{
                background: "rgba(0,0,0,0.04)",
                fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
              }}
            >
              <button
                type="button"
                onClick={() => onCanvasModeChange("builder")}
                className={`sb-interactive inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 font-semibold tracking-[0.2px] ${
                  isTabletTouchDevice() ? "min-h-11 text-[14px]" : "min-h-8 text-[10px]"
                } ${canvasMode === "builder" ? "bg-[#0A84FF] text-white shadow-sm" : "text-zinc-500 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/5"}`}
                title="Builder — digital authoring veil with xAI assists"
                aria-label="Builder mode"
              >
                {compactCanvasToggle ? <PenLine className="h-4 w-4 shrink-0" /> : null}
                <span className="sb-nav-canvas-label">Builder</span>
              </button>
              <button
                type="button"
                onClick={() => onCanvasModeChange("print-preview")}
                className={`sb-interactive inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 font-semibold tracking-[0.2px] ${
                  isTabletTouchDevice() ? "min-h-11 text-[14px]" : "min-h-8 text-[10px]"
                } ${canvasMode === "print-preview" ? "bg-[#C13A14] text-white shadow-sm" : "text-zinc-500 hover:bg-white/60 dark:text-zinc-400 dark:hover:bg-white/5"}`}
                title="Preview — exact Golden sheet for PDF/print"
                aria-label="Print preview mode"
              >
                {compactCanvasToggle ? <ScanEye className="h-4 w-4 shrink-0" /> : null}
                <span className="sb-nav-canvas-label">Preview</span>
              </button>
            </div>
          ) : null}

          <NavToolButton onClick={() => onCommandOpen?.()} title="Command (⌘K)" ariaLabel="Command palette">
            <Search className={NAV_ICON} />
          </NavToolButton>

          <div className="flex shrink-0 items-center">
            <NavToolButton onClick={onUndo} title="Undo">
              <Undo2 className={NAV_ICON} />
            </NavToolButton>
            <NavToolButton onClick={onRedo} title="Redo">
              <Redo2 className={NAV_ICON} />
            </NavToolButton>
          </div>

          <div
            className="flex shrink-0 items-center overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--sb-glass-border)" }}
          >
            <NavToolButton onClick={onZoomFit} title="Fit artboard" className="rounded-none">
              <Maximize2 className={NAV_ICON} />
            </NavToolButton>
            <NavToolButton onClick={onZoomOut} title="Zoom out" className="rounded-none">
              <ZoomOut className={NAV_ICON} />
            </NavToolButton>
            {isZoomed && zoomLabel ? (
              <button
                type="button"
                onClick={onZoomFit}  // quick way back to adaptable fit; could also jump to 1.0
                className="min-w-[2.75rem] px-1 text-center text-[10px] font-bold tabular-nums text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                aria-live="polite"
                title="Click to fit (or use Fit button)"
              >
                {zoomLabel}
              </button>
            ) : null}
            <NavToolButton onClick={onZoomIn} title="Zoom in" className="rounded-none">
              <ZoomIn className={NAV_ICON} />
            </NavToolButton>
          </div>

          <NavToolButton onClick={onPrint} title="Print Command Center (⌘P)" ariaLabel="Open print command center">
            <Printer className={NAV_ICON} />
          </NavToolButton>

          <NavToolButton onClick={onThemeToggle} title="Toggle theme">
            {isDark ? <Sun className={NAV_ICON} /> : <Moon className={NAV_ICON} />}
          </NavToolButton>

          <div ref={profileRef} className="relative">
            <button
              onClick={() => {
                const willOpen = !profileOpen;
                if (willOpen) {
                  // Compute synchronously so the menu renders in the correct place immediately
                  const container = profileRef.current;
                  if (container) {
                    const btn = container.querySelector("button") as HTMLElement | null;
                    if (btn) {
                      const rect = btn.getBoundingClientRect();
                      setDropdownPos({
                        top: rect.bottom + 8,
                        right: Math.max(8, window.innerWidth - rect.right),
                      });
                    }
                  }
                }
                setProfileOpen(willOpen);
              }}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-[#C5A26F] to-[#8B5CF6] text-[10px] font-bold text-white ring-1 ring-white/20 transition-all hover:ring-white/40 active:scale-95"
              title={currentUser ? `${currentUser.full_name} — ${currentUser.role}` : "Account"}
              aria-expanded={profileOpen}
            >
              {userInitials}
            </button>

            {/* Profile Dropdown
                - Uses React Portal to document.body so it completely escapes
                  the nav's stacking context, any ancestor transforms (canvas zoom/pan),
                  overflow-hidden on the stage, and inset calculations.
                - Positioned with fixed + rect from the avatar so it is always
                  fully on-screen and right-aligned under the button.
                - High z ensures it appears above the nav, roster, cards, etc.
            */}
            {profileOpen && currentUser && dropdownPos &&
              createPortal(
                <div
                  ref={profileMenuRef}
                  className="fixed w-56 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden z-[10000]"
                  style={{
                    top: `${dropdownPos.top}px`,
                    right: `${dropdownPos.right}px`,
                    fontFamily: "var(--font-atkinson), var(--font-geist-sans)",
                  }}
                >
                {/* User header */}
                <div className="px-4 py-3 border-b border-zinc-800">
                  <div className="font-semibold text-zinc-100 tracking-tight">
                    {currentUser.full_name}
                  </div>
                  <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                    {currentUser.username} · {currentUser.role}
                  </div>
                </div>

                {/* Actions */}
                <div className="py-1">
                  {onOpenSudo && currentUser && (
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        onOpenSudo();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-[#8B6910] hover:bg-[#B89708]/10 hover:text-[#B89708] dark:text-[#E9B948] dark:hover:bg-[#B89708]/10 transition-colors"
                    >
                      <span className="ms text-base" style={{ fontSize: 16 }}>shield</span>
                      Open Sudo
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout?.();
                    }}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
                  >
                    <span className="ms text-base" style={{ fontSize: 16 }}>logout</span>
                    Sign out
                  </button>
                </div>
              </div>,
              document.body
            )}
          </div>
        </div>
      </nav>

      {/* Command palette is rendered by ShiftBuilderClient; ⌘K icon above opens it. */}
    </>
  );
}
