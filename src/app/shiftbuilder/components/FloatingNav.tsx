"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  Calendar,
  Undo2,
  Redo2,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Sun,
  Moon,
  User,
  Search,
  Printer,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Note: "cmdk" package import removed — the search capsule now exclusively triggers the global CommandPalette
// (react-cmdk based) via onCommandOpen. Duplicate local palette caused z-index + focus conflicts.

// ==================== CVA VARIANTS ====================
const navVariants = cva(
  "fixed top-2 left-4 right-4 z-40 flex items-center mx-auto max-w-[1440px] h-14 px-6 rounded-3xl transition-all duration-200",
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

const segmentVariants = cva(
  "inline-flex items-center rounded-2xl p-0.5 text-xs font-semibold",
  {
    variants: {
      active: {
        true: "bg-white dark:bg-zinc-800 shadow-sm",
        false: "hover:bg-black/5 dark:hover:bg-white/5",
      },
    },
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
  onPrevWeek?: () => void;
  onNextWeek?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomFit?: () => void;
  onZoomOut?: () => void;
  onZoomIn?: () => void;
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
  onPrevWeek,
  onNextWeek,
  onUndo,
  onRedo,
  onZoomFit,
  onZoomOut,
  onZoomIn,
  onCommandOpen,
  onThemeToggle,
  onPrint,
  isDark = false,
  userInitials = "BC",
  currentUser,
  onLogout,
  onOpenSudo,
}: FloatingNavProps) {
  const queryClient = useQueryClient();

  // Profile avatar dropdown state
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile dropdown on outside click or Escape (matches existing patterns)
  useEffect(() => {
    if (!profileOpen) return;

    const onDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
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
        className={cn(navVariants())}
        style={{ ...glassStyle, zIndex: 40 }}
      >
        {/* LEFT: Today */}
        <div className="flex items-center gap-2 shrink-0 pr-3">
          <button
            onClick={onToday}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.985]"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}
          >
            <Calendar className="h-4 w-4" />
            Today
          </button>
        </div>

        {/* CENTER: 9-day strip + Deploy/Breaks */}
        <div className="flex-1 flex items-center justify-center gap-3 min-w-0 px-2">
          <div className="relative flex items-center min-w-0 flex-1 justify-center max-w-[720px]">
            {/* Left seamless half-circle cap — previous GRAVE week */}
            {onPrevWeek && (
              <motion.button
                onClick={onPrevWeek}
                whileHover={{ scale: 1.08, opacity: 0.95 }}
                whileTap={{ scale: 0.88 }}
                transition={SPRING}
                className="absolute left-0.5 top-1/2 z-20 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full"
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
              className="flex items-center gap-0.5 px-7 py-1 rounded-2xl relative"
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--sb-glass-border)",
                width: "100%",
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
                      "relative z-10 flex items-center justify-center rounded-full font-semibold tabular-nums h-7 transition-all flex-1 min-w-0 touch-manipulation",
                      isActive ? "px-2 text-[12.5px]" : "px-1 text-[11px]",
                    )}
                    style={{
                      maxWidth: isBridge ? 36 : 52,
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

                    {isActive && day.shortLabel ? (
                      <span
                        className="mr-0.5 text-[8px] font-bold tracking-[0.5px] opacity-90"
                        style={{ color: "#fff" }}
                      >
                        {day.shortLabel}
                      </span>
                    ) : null}
                    <span className="leading-none tabular-nums inline-block text-center">
                      {isActive ? day.label : day.dayLetter ?? day.label}
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
                className="absolute right-0.5 top-1/2 z-20 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full"
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

          <div className={cn(segmentVariants(), "shrink-0 ml-2")}>
            {(["deployment", "breaks"] as const).map((view) => {
              const isActive = currentView === view;
              return (
                <button
                  key={view}
                  onClick={() => onViewChange(view)}
                  className={cn(
                    segmentVariants({ active: isActive }),
                    "px-3 py-1 text-xs font-semibold rounded-[10px] transition-all active:scale-[0.985]"
                  )}
                >
                  {view === "deployment" ? "Deploy" : "Breaks"}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Command icon, undo/redo, zoom, print, theme, profile */}
        <div className="flex items-center gap-2 shrink-0 pl-3 border-l border-white/20 dark:border-white/10">
          <button
            onClick={() => onCommandOpen?.()}
            className="flex items-center justify-center w-9 h-9 rounded-2xl border transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.985]"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}
            aria-label="Command palette"
            title="Command (⌘K)"
          >
            <Search className="h-4 w-4 opacity-75" />
          </button>

          <div className="flex items-center gap-1">
            <button onClick={onUndo} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Undo">
              <Undo2 className="h-4 w-4" />
            </button>
            <button onClick={onRedo} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Redo">
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          <div
            className="flex items-center rounded-full border overflow-hidden"
            style={{ borderColor: "var(--sb-glass-border)" }}
          >
            <button
              onClick={onZoomFit}
              className="p-2 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all"
              title="Fit artboard to viewport"
              aria-label="Fit to viewport"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={onZoomOut}
              className="px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all text-sm font-medium"
              title="Zoom out"
              aria-label="Zoom out"
            >
              −
            </button>
            <button
              onClick={onZoomIn}
              className="px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all text-sm font-medium"
              title="Zoom in (100% max)"
              aria-label="Zoom in"
            >
              +
            </button>
          </div>

          {/* Print — always visible direct access to Print Command Center */}
          <button 
            onClick={onPrint} 
            className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" 
            title="Print (⌘P)"
            aria-label="Open print command center"
          >
            <Printer className="h-4 w-4" />
          </button>

          {/* Theme toggle — always visible (tiny, high value) */}
          <button onClick={onThemeToggle} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Profile Avatar + Dropdown (always visible) */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C5A26F] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white cursor-pointer active:scale-95 transition-all ring-1 ring-white/20 hover:ring-white/40"
              title={currentUser ? `${currentUser.full_name} — ${currentUser.role}` : "Account"}
              aria-expanded={profileOpen}
            >
              {userInitials}
            </button>

            {/* Profile Dropdown */}
            {profileOpen && currentUser && (
              <div
                className="absolute right-0 mt-2 w-56 rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-md shadow-2xl shadow-black/60 overflow-hidden z-[9999]"
                style={{ fontFamily: "var(--font-atkinson), var(--font-geist-sans)" }}
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
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Command palette is rendered by ShiftBuilderClient; ⌘K icon above opens it. */}
    </>
  );
}
