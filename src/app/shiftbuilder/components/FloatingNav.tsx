"use client";

import * as React from "react";
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
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, addDays, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Note: "cmdk" package import removed — the search capsule now exclusively triggers the global CommandPalette
// (react-cmdk based) via onCommandOpen. Duplicate local palette caused z-index + focus conflicts.

// ==================== CVA VARIANTS ====================
const navVariants = cva(
  "fixed top-2 left-4 right-4 z-40 flex items-center mx-auto max-w-[1280px] h-14 px-6 rounded-3xl transition-all duration-200",
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
  dateNum?: number;
  isToday?: boolean;
  date?: Date;
}

export interface FloatingNavProps {
  days: DayItem[];
  selectedDayId: number;
  onDaySelect: (id: number, date: Date) => void;
  currentView: "deployment" | "breaks";
  onViewChange: (view: "deployment" | "breaks") => void;
  placedCount?: { current: number; total: number }; // kept for compatibility, no longer rendered
  savedText?: string;
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
  isDark?: boolean;
  userInitials?: string;
}

// ==================== SPRING ====================
const SPRING = { type: "spring" as const, stiffness: 400, damping: 25 };

// ==================== COMPONENT ====================
export default function FloatingNav({
  days,
  selectedDayId,
  onDaySelect,
  currentView,
  onViewChange,
  placedCount,
  savedText = "Saved",
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
  isDark = false,
  userInitials = "BC",
}: FloatingNavProps) {
  const queryClient = useQueryClient();

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
        className={cn(navVariants(), "px-4 sm:px-6 lg:px-8")}
        style={{ ...glassStyle, zIndex: 40 }}
      >
        {/* LEFT: Today only (B logo removed) */}
        <div className="flex items-center gap-2 md:gap-3 shrink-0 pr-2 md:pr-4">
          <button
            onClick={onToday}
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full border transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.985]"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}
          >
            <Calendar className="h-4 w-4" />
            Today
          </button>
        </div>

        {/* CENTER: Date Selector + View Switcher */}
        <div className="flex-1 flex items-center justify-center gap-2 md:gap-3 min-w-0 px-2">
          {/* Date Pills with seamless half-circle week navigation caps */}
          <div className="relative flex items-center">
            {/* Left seamless half-circle cap — previous GRAVE week */}
            {onPrevWeek && (
              <motion.button
                onClick={onPrevWeek}
                whileHover={{ scale: 1.08, opacity: 0.95 }}
                whileTap={{ scale: 0.88 }}
                transition={SPRING}
                className="absolute left-1 top-1/2 z-20 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full"
                style={{
                  background: "rgba(0,0,0,0.025)", // seamless match with strip
                }}
                title="Previous week"
                aria-label="Previous GRAVE week"
              >
                <motion.span
                  whileHover={{ x: -1.5 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                >
                  <ChevronLeft className="h-3.5 w-3.5 text-[#6B7280] dark:text-[#8E8E93]" />
                </motion.span>
              </motion.button>
            )}

            {/* The pill strip itself (7 days always fully visible) */}
            <div
              className="flex items-center gap-1 px-7 py-1 rounded-2xl relative"
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--sb-glass-border)",
              }}
            >
              {days.map((day) => {
                const isActive = day.id === selectedDayId;

                return (
                  <button
                    key={day.id}
                    onClick={() => handleDaySelect(day.id, day.date || new Date())}
                    className={cn(
                      datePillVariants({ active: isActive }),
                      "relative z-10 flex items-center justify-center rounded-full font-semibold tabular-nums h-7 transition-all flex-shrink-0",
                      isActive ? "px-3 text-sm" : "px-2 text-[12px]"
                    )}
                    style={{
                      minWidth: isActive ? 58 : 34,
                      background: isActive ? ACCENT : "transparent",
                      color: isActive ? "#fff" : isDark ? "#A1A1AA" : "#52525B",
                      border: isActive ? `1px solid ${ACCENT}` : "1px solid transparent",
                      fontWeight: isActive ? 700 : 600,
                      fontSize: isActive ? "13px" : "12px",
                    }}
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

                    {isActive && day.shortLabel && (
                      <span className="mr-1 text-[9px] font-bold tracking-[0.5px] opacity-90" style={{ color: "#fff" }}>
                        {day.shortLabel}
                      </span>
                    )}
                    <span 
                      className="leading-none tabular-nums inline-block text-center" 
                      style={{ minWidth: 18 }}
                    >
                      {day.label}
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
                className="absolute right-1 top-1/2 z-20 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full"
                style={{
                  background: "rgba(0,0,0,0.025)", // seamless match with strip
                }}
                title="Next week"
                aria-label="Next GRAVE week"
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

          {/* Deployment / Breaks Segmented */}
          <div className={cn(segmentVariants())}>
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
                  {view === "deployment" ? "Deployment" : "Breaks"}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Command + Clusters */}
        <div className="flex items-center gap-2 md:gap-2.5 shrink-0 pl-3 md:pl-4 border-l border-white/20 dark:border-white/10">
          {/* Command Capsule */}
          <button
            onClick={() => {
              onCommandOpen?.();
            }}
            className="flex items-center gap-2 md:gap-2.5 px-4 md:px-5 h-9 rounded-2xl text-[12.5px] font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.985] group"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)", minWidth: 200 }}
          >
            <Search className="h-4 w-4 opacity-70" />
            <span>Search · Assign · Command</span>
            <kbd className="ml-auto px-2 py-px text-[9px] font-bold rounded bg-black/10 dark:bg-white/10">⌘K</kbd>
          </button>

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button onClick={onUndo} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Undo">
              <Undo2 className="h-4 w-4" />
            </button>
            <button onClick={onRedo} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Redo">
              <Redo2 className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom Cluster */}
          <div className="flex items-center gap-px text-xs font-medium">
            <button onClick={onZoomFit} className="px-2 py-1 rounded-l-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all">Fit</button>
            <button onClick={onZoomOut} className="px-1.5 py-1 hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all">−</button>
            <button onClick={onZoomIn} className="px-1.5 py-1 rounded-r-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all">+</button>
          </div>

          <div className="text-xs text-[#6B7280] px-2">{savedText}</div>

          {/* Theme */}
          <button onClick={onThemeToggle} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Avatar */}
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#C5A26F] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white cursor-pointer active:scale-95 transition-all" title="User">
            {userInitials}
          </div>
        </div>
      </nav>

      {/* 
        Command Palette is now rendered exclusively by the parent (ShiftBuilderClient).
        The search capsule above only calls onCommandOpen, which wires to the single global
        react-cmdk + Velvet-backed palette (full roster, actions, Sudo, Grok, etc.).
        Duplicate local palette removed to eliminate z-index wars, focus traps, and iPad typing breakage.
      */}
    </>
  );
}
