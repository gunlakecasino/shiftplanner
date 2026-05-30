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
  currentUser,
  onLogout,
  onOpenSudo,
}: FloatingNavProps) {
  const queryClient = useQueryClient();

  // Profile avatar dropdown state
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Mobile "more" actions sheet (undo/redo/zoom cluster hidden on small screens)
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const mobileActionsRef = useRef<HTMLDivElement>(null);

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

  // Close mobile actions popover on outside click / Escape
  useEffect(() => {
    if (!mobileActionsOpen) return;

    const onDown = (e: MouseEvent) => {
      if (mobileActionsRef.current && !mobileActionsRef.current.contains(e.target as Node)) {
        setMobileActionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileActionsOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileActionsOpen]);

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
        className={cn(navVariants(), "px-3 sm:px-4 md:px-6 lg:px-8 h-12 sm:h-14")}
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

        {/* CENTER: Date Selector + View Switcher (mobile-friendly scrollable dates) */}
        <div className="flex-1 flex items-center justify-center gap-1.5 md:gap-3 min-w-0 px-1 sm:px-2">
          {/* Date Pills with seamless half-circle week navigation caps */}
          <div className="relative flex items-center min-w-0">
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

            {/* Scrollable pill strip on mobile (snap + touch friendly). Desktop keeps the classic fixed look. */}
            <div
              className="flex items-center gap-1 px-6 md:px-7 py-1 rounded-2xl relative overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--sb-glass-border)",
                maxWidth: "min(420px, 58vw)",
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
                      "relative z-10 flex items-center justify-center rounded-full font-semibold tabular-nums h-7 transition-all flex-shrink-0 snap-center touch-manipulation",
                      isActive ? "px-2.5 sm:px-3 text-sm" : "px-1.5 sm:px-2 text-[11px] sm:text-[12px]"
                    )}
                    style={{
                      minWidth: isActive ? 46 : 30,
                      background: isActive ? ACCENT : "transparent",
                      color: isActive ? "#fff" : isDark ? "#A1A1AA" : "#52525B",
                      border: isActive ? `1px solid ${ACCENT}` : "1px solid transparent",
                      fontWeight: isActive ? 700 : 600,
                      fontSize: isActive ? "12.5px" : "11px",
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
                      <span className="mr-0.5 sm:mr-1 text-[8px] sm:text-[9px] font-bold tracking-[0.5px] opacity-90" style={{ color: "#fff" }}>
                        {day.shortLabel}
                      </span>
                    )}
                    <span 
                      className="leading-none tabular-nums inline-block text-center" 
                      style={{ minWidth: 16 }}
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
                className="absolute right-0.5 top-1/2 z-20 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full"
                style={{
                  background: "rgba(0,0,0,0.025)",
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

          {/* Deployment / Breaks Segmented — slightly more compact on mobile */}
          <div className={cn(segmentVariants(), "shrink-0")}>
            {(["deployment", "breaks"] as const).map((view) => {
              const isActive = currentView === view;
              return (
                <button
                  key={view}
                  onClick={() => onViewChange(view)}
                  className={cn(
                    segmentVariants({ active: isActive }),
                    "px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold rounded-[10px] transition-all active:scale-[0.985]"
                  )}
                >
                  {view === "deployment" ? "Deploy" : "Breaks"}
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Command + Clusters (responsive) */}
        <div className="flex items-center gap-1.5 sm:gap-2 md:gap-2.5 shrink-0 pl-2 sm:pl-3 md:pl-4 border-l border-white/20 dark:border-white/10">
          {/* Command — full pill on md+, compact round icon on mobile */}
          {/* Desktop / tablet rich trigger */}
          <button
            onClick={() => {
              onCommandOpen?.();
            }}
            className="hidden md:flex items-center gap-2 md:gap-2.5 px-4 md:px-5 h-9 rounded-2xl text-[12.5px] font-semibold border transition-all hover:bg-black/5 dark:hover:bg-white/5 active:scale-[0.985] group"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)", minWidth: 200 }}
          >
            <Search className="h-4 w-4 opacity-70" />
            <span>Search · Assign · Command</span>
            <kbd className="ml-auto px-2 py-px text-[9px] font-bold rounded bg-black/10 dark:bg-white/10">⌘K</kbd>
          </button>
          {/* Mobile compact command (round, 40px touch target) */}
          <button
            onClick={() => {
              onCommandOpen?.();
            }}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-2xl border transition-all active:scale-[0.94]"
            style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}
            aria-label="Open command palette"
            title="Command (⌘K)"
          >
            <Search className="h-4 w-4 opacity-80" />
          </button>

          {/* Desktop action cluster (undo/redo/zoom/saved) — hidden on mobile */}
          <div className="hidden md:flex items-center gap-2 md:gap-2.5">
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
          </div>

          {/* Mobile "More" actions trigger (three dots) — opens compact glass sheet */}
          <div className="md:hidden relative" ref={mobileActionsRef}>
            <button
              onClick={() => setMobileActionsOpen((v) => !v)}
              className="w-9 h-9 rounded-2xl border flex items-center justify-center active:scale-[0.94] transition-all"
              style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}
              aria-label="More actions"
              aria-expanded={mobileActionsOpen}
            >
              <span className="text-lg leading-none tracking-[2px] opacity-80">⋯</span>
            </button>

            {/* Compact mobile actions popover (Velvet glass) */}
            {mobileActionsOpen && (
              <div
                className="absolute right-0 mt-2 w-44 rounded-2xl border overflow-hidden z-[9999] shadow-xl"
                style={{
                  background: isDark ? "rgba(9,9,11,0.96)" : "rgba(255,255,255,0.96)",
                  borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
                  backdropFilter: "blur(24px)",
                }}
              >
                <div className="py-1 text-sm">
                  <button
                    onClick={() => { setMobileActionsOpen(false); onUndo?.(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                  >
                    <Undo2 className="h-4 w-4" /> <span>Undo</span>
                  </button>
                  <button
                    onClick={() => { setMobileActionsOpen(false); onRedo?.(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left active:bg-black/5 dark:active:bg-white/5"
                  >
                    <Redo2 className="h-4 w-4" /> <span>Redo</span>
                  </button>
                  <div className="h-px bg-white/10 dark:bg-white/10 my-1 mx-3" />
                  <div className="px-4 py-1.5 text-[11px] text-[#6B7280] font-medium">Zoom</div>
                  <div className="flex items-center gap-1 px-3 pb-2">
                    <button onClick={() => { setMobileActionsOpen(false); onZoomFit?.(); }} className="flex-1 px-3 py-1 rounded-xl text-xs border active:scale-[0.985]" style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}>Fit</button>
                    <button onClick={() => { setMobileActionsOpen(false); onZoomOut?.(); }} className="flex-1 px-3 py-1 rounded-xl text-xs border active:scale-[0.985]" style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}>−</button>
                    <button onClick={() => { setMobileActionsOpen(false); onZoomIn?.(); }} className="flex-1 px-3 py-1 rounded-xl text-xs border active:scale-[0.985]" style={{ background: "var(--sb-glass)", borderColor: "var(--sb-glass-border)" }}>+</button>
                  </div>
                  <div className="px-4 py-1 text-[11px] text-[#6B7280] font-mono">{savedText}</div>
                </div>
              </div>
            )}
          </div>

          {/* Theme toggle — always visible (tiny, high value) */}
          <button onClick={onThemeToggle} className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all" title="Toggle theme">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Profile Avatar + Dropdown (always visible) */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="w-8 h-8 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-[#C5A26F] to-[#8B5CF6] flex items-center justify-center text-[11px] font-bold text-white cursor-pointer active:scale-95 transition-all ring-1 ring-white/20 hover:ring-white/40"
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

      {/* 
        Command Palette is now rendered exclusively by the parent (ShiftBuilderClient).
        The search capsule above only calls onCommandOpen, which wires to the single global
        react-cmdk + Velvet-backed palette (full roster, actions, Sudo, Grok, etc.).
        Duplicate local palette removed to eliminate z-index wars, focus traps, and iPad typing breakage.
      */}
    </>
  );
}
