"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cva } from "class-variance-authority";

import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";
import {
  currentShiftDate,
  MONTH_LONG,
  sameDay,
} from "@/lib/shiftbuilder/dateUtils";
import { DEPLOYMENT_CANVAS_MAX_WIDTH_PX } from "@/lib/shiftbuilder/canvasLayout";
import type { NavDayStripItem } from "@/app/today/hooks/useTodayScheduleNav";

const NAV_ICON = "h-3.5 w-3.5 shrink-0 opacity-80";
const ACCENT = "#C13A14";
const SPRING = { type: "spring" as const, stiffness: 400, damping: 25 };

const navVariants = cva(
  "sb-floating-nav-pill z-40 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-3xl px-3 sm:px-4 transition-all duration-200",
  {
    variants: {
      glass: {
        true: "bg-white/85 dark:bg-zinc-950/85 backdrop-blur-[32px] border border-white/35 dark:border-white/12 shadow-[0_4px_6px_-1px_rgb(0_0_0_/_0.05),_0_2px_4px_-2px_rgb(0_0_0_/_0.03),_0_25px_50px_-12px_rgb(0_0_0_/_0.25),_inset_0_1px_0_rgba(255,255,255,0.98)]",
      },
    },
    defaultVariants: { glass: true },
  },
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
  },
);

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
        "flex h-8 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5",
        isTabletTouchDevice() && "sb-tablet-touch-target h-11 min-w-11",
        !className?.includes("px-") && "w-8",
        active && "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type LogsNavProps = {
  navStrip: NavDayStripItem[];
  selectedNavId: number;
  selectedDayDate: Date;
  onSelectNavDay: (navId: number) => void;
  onDayHover?: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onJumpToDate: (date: Date) => void;
  logOperators?: string[];
  selectedLogOperator?: string | null;
  onLogOperatorChange?: (operator: string | null) => void;
};

export function LogsNav({
  navStrip,
  selectedNavId,
  selectedDayDate,
  onSelectNavDay,
  onDayHover,
  onPrevWeek,
  onNextWeek,
  onToday,
  onJumpToDate,
  logOperators = [],
  selectedLogOperator = null,
  onLogOperatorChange,
}: LogsNavProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState(() => new Date(selectedDayDate));
  const monthBtnRef = useRef<HTMLButtonElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Close popover pos when calendar closes (moved out of effect body to satisfy lint)
  const closeCalendar = useCallback(() => {
    setCalendarOpen(false);
    setPopoverPos(null);
  }, []);

  useEffect(() => {
    if (!calendarOpen) {
      return;
    }

    const compute = () => {
      const btn = monthBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPopoverPos({ top: rect.bottom + 8, left: rect.left });
    };

    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, [calendarOpen, selectedDayDate]); // no direct setState in body now (setCalendarView moved to openCalendar)

  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (monthBtnRef.current?.contains(target)) return;
      const pop = document.getElementById("logs-nav-calendar-popover");
      if (pop?.contains(target)) return;
      closeCalendar();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeCalendar();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [calendarOpen, closeCalendar]); // include stable closeCalendar to satisfy exhaustive-deps

  // Note: glass appearance is primarily provided by navVariants() cva (glass variant).
  // We only need an inline style here for the elevated z-index on the fixed nav.
  // The previous duplicate glassStyle object (exact backdrop/shadow copy of the cva)
  // was removed during production cleanup to eliminate drift.

  const monthLabel = `${MONTH_LONG[selectedDayDate.getMonth()]} ${selectedDayDate.getFullYear()}`;
  const todayShiftDate = React.useMemo(() => currentShiftDate(), []);

  const handlePickDate = (d: Date) => {
    onJumpToDate(d);
    closeCalendar();
  };

  // When opening the calendar, sync the view to current selected day (moved out of effect to avoid setState-in-effect)
  const openCalendar = () => {
    setCalendarView(new Date(selectedDayDate));
    setCalendarOpen(true);
  };

  return (
    <>
      <nav
        className={cn(
          navVariants(),
          "overflow-hidden",
          isTabletTouchDevice() && "sb-tablet-nav",
        )}
        style={{
          position: "fixed",
          top: 8,
          left: "50%",
          right: "auto",
          width: `min(calc(100vw - 48px), ${DEPLOYMENT_CANVAS_MAX_WIDTH_PX}px)`,
          maxWidth: DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
          transform: "translateX(-50%)",
          boxSizing: "border-box",
          zIndex: 40,
        }}
        aria-label="Change log date navigation"
      >
        {/* LEFT: month picker + today */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            ref={monthBtnRef}
            type="button"
            onClick={() => {
        if (calendarOpen) {
          closeCalendar();
        } else {
          openCalendar();
        }
      }}
            className={cn(
              "sb-interactive inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold tracking-[0.2px] text-zinc-700 transition-all hover:bg-black/5",
              isTabletTouchDevice() && "h-11 px-3 text-[13px]",
              calendarOpen && "bg-white shadow-sm",
            )}
            aria-expanded={calendarOpen}
            aria-haspopup="dialog"
            title="Jump to any date"
          >
            <span className="max-w-[9rem] truncate tabular-nums">{monthLabel}</span>
            <ChevronDown className={cn(NAV_ICON, calendarOpen && "rotate-180 transition-transform")} />
          </button>
          <NavToolButton onClick={onToday} title="Jump to today" ariaLabel="Jump to today">
            <Calendar className={NAV_ICON} />
          </NavToolButton>
        </div>

        {/* CENTER: 9-day strip */}
        <div className="min-w-0 px-0.5">
          <div className="relative flex min-w-0 items-stretch justify-center">
            <motion.button
              onClick={onPrevWeek}
              whileHover={{ scale: 1.08, opacity: 0.95 }}
              whileTap={{ scale: 0.88 }}
              transition={SPRING}
              className="absolute left-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full touch-manipulation"
              style={{ background: "rgba(0,0,0,0.025)" }}
              title="Previous GRAVE week (Friday)"
              aria-label="Previous GRAVE week — jump to Friday"
            >
              <ChevronLeft className="h-3.5 w-3.5 text-[#6B7280]" />
            </motion.button>

            <div
              className="relative grid min-h-[40px] w-full min-w-0 grid-cols-9 gap-1 rounded-2xl px-7 py-1.5 sm:px-8"
              style={{
                background: "rgba(0,0,0,0.025)",
                border: "1px solid var(--sb-glass-border)",
              }}
            >
              {navStrip.map((day) => {
                const isActive = day.navId === selectedNavId;
                const isBridge = !!day.bridge;

                return (
                  <button
                    key={day.navId}
                    type="button"
                    onClick={() => onSelectNavDay(day.navId)}
                    onMouseEnter={() => onDayHover?.(day.date)}
                    onTouchStart={() => onDayHover?.(day.date)}
                    aria-current={isActive ? "date" : undefined}
                    className={cn(
                      datePillVariants({ active: isActive }),
                      "relative z-10 flex min-h-[36px] w-full min-w-0 touch-manipulation items-center justify-center rounded-full px-0.5 font-semibold tabular-nums transition-all",
                      isActive ? "px-1 text-[13px]" : "text-[12px]",
                    )}
                    style={{
                      background: isActive ? ACCENT : "transparent",
                      color: isActive ? "#fff" : "#52525B",
                      border: isActive
                        ? `1px solid ${ACCENT}`
                        : isBridge
                          ? "1px dashed rgba(0,0,0,0.15)"
                          : "1px solid transparent",
                      fontWeight: isActive ? 700 : 600,
                      opacity: isBridge && !isActive ? 0.85 : 1,
                    }}
                    title={
                      isBridge
                        ? day.bridge === "prev-week-last"
                          ? "Last day of previous GRAVE week (Thursday)"
                          : "First day of next GRAVE week (Friday)"
                        : undefined
                    }
                  >
                    {isActive && (
                      <motion.div
                        layoutId="logs-active-date-pill"
                        className="absolute inset-0 -z-10 rounded-full"
                        style={{ background: ACCENT }}
                        transition={SPRING}
                      />
                    )}
                    <span className="flex w-full min-w-0 flex-col items-center justify-center gap-0 truncate leading-none tabular-nums">
                      {isActive && day.shortLabel ? (
                        <span
                          className="text-[9px] font-bold leading-none tracking-[0.4px] opacity-90"
                          style={{ color: "#fff" }}
                        >
                          {day.shortLabel}
                        </span>
                      ) : null}
                      <span className="leading-none">
                        {isActive ? String(day.dateNum) : day.dayLetter}
                      </span>
                    </span>
                    {day.isToday && !isActive ? (
                      <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#007AFF]" />
                    ) : null}
                  </button>
                );
              })}
            </div>

            <motion.button
              onClick={onNextWeek}
              whileHover={{ scale: 1.08, opacity: 0.95 }}
              whileTap={{ scale: 0.88 }}
              transition={SPRING}
              className="absolute right-0 top-1/2 z-20 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full touch-manipulation"
              style={{ background: "rgba(0,0,0,0.025)" }}
              title="Next GRAVE week (Friday)"
              aria-label="Next GRAVE week — jump to Friday"
            >
              <ChevronRight className="h-3.5 w-3.5 text-[#6B7280]" />
            </motion.button>
          </div>
        </div>

        {/* RIGHT: log filters + link back to deployment board */}
        <div className="flex shrink-0 items-center gap-2 border-l border-white/20 pl-2 text-[11px]">
          <label className="sr-only" htmlFor="logs-operator-filter">
            Filter by person
          </label>
          <select
            id="logs-operator-filter"
            value={selectedLogOperator ?? ""}
            onChange={(e) =>
              onLogOperatorChange?.(e.target.value ? e.target.value : null)
            }
            className="max-w-[9rem] truncate rounded-lg border border-black/10 bg-white/90 px-2 py-1.5 text-[11px] font-medium text-[#1C1C1E] outline-none focus:ring-2 focus:ring-[#C13A14]/30"
          >
            <option value="">Everyone</option>
            {logOperators.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <Link
            href="/today"
            className="rounded-lg border border-black/10 px-2 py-1 font-medium text-[#6C6C72] transition-colors hover:bg-black/5"
          >
            Board
          </Link>
        </div>
      </nav>

      {calendarOpen && popoverPos
        ? createPortal(
            <div
              id="logs-nav-calendar-popover"
              role="dialog"
              aria-label="Choose a date"
              className="fixed z-[70] w-[280px] rounded-2xl border border-white/70 bg-white/95 p-3 text-[12px] shadow-2xl shadow-black/10 backdrop-blur-xl"
              style={{ top: popoverPos.top, left: popoverPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={() => {
                    // Proper previous month (handles year rollover and varying month lengths)
                    const y = calendarView.getFullYear();
                    const m = calendarView.getMonth();
                    setCalendarView(new Date(y, m - 1, 1));
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[#6B7280] hover:bg-[#F3F4F6]"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <div className="font-semibold tabular-nums text-[#1C1C1E]">
                  {MONTH_LONG[calendarView.getMonth()]} {calendarView.getFullYear()}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Proper next month
                    const y = calendarView.getFullYear();
                    const m = calendarView.getMonth();
                    setCalendarView(new Date(y, m + 1, 1));
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[#6B7280] hover:bg-[#F3F4F6]"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 text-center font-medium text-[#8E8E93]">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <div key={i}>{d}</div>
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

                  const renderDay = (d: Date, key: string, muted = false) => {
                    const isTonight = sameDay(d, todayShiftDate);

                    return (
                      <CalendarDayButton
                        key={key}
                        date={d}
                        muted={muted}
                        isSelected={sameDay(d, selectedDayDate)}
                        isUnpublished={false}
                        isTonight={isTonight}
                        onPick={handlePickDate}
                      />
                    );
                  };

                  for (let i = 0; i < startWeekday; i++) {
                    const d = new Date(year, month, 1 - (startWeekday - i));
                    cells.push(renderDay(d, `prev-${i}`, true));
                  }

                  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
                    const d = new Date(year, month, dayNum);
                    cells.push(renderDay(d, String(dayNum)));
                  }

                  const remaining = 42 - cells.length;
                  for (let i = 1; i <= remaining; i++) {
                    const d = new Date(year, month + 1, i);
                    cells.push(renderDay(d, `next-${i}`, true));
                  }

                  return cells;
                })()}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-[#E5E5E7] pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const today = currentShiftDate();
                    handlePickDate(today);
                  }}
                  className="rounded-md px-2 py-0.5 text-[11px] text-[#007AFF] hover:bg-[#E5F0FF]"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={closeCalendar}
                  className="rounded-md px-2 py-0.5 text-[11px] text-[#6B7280] hover:bg-[#F3F4F6]"
                >
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function CalendarDayButton({
  date,
  muted = false,
  isSelected,
  isUnpublished = false,
  isTonight = false,
  onPick,
}: {
  date: Date;
  muted?: boolean;
  isSelected: boolean;
  isUnpublished?: boolean;
  isTonight?: boolean;
  onPick: (d: Date) => void;
}) {
  // For unpublished non-tonight days on the /today board,
  // render a non-interactive span. This prevents accidental navigation
  // to a week that will just show the "No published schedule" placeholder,
  // while still allowing the date to be visible in the grid for context.
  if (isUnpublished) {
    return (
      <span
        className="relative h-7 w-7 rounded-md text-[11px] cursor-default text-[#D1D5DB] opacity-55 select-none"
        title="Not published — no schedule on /today"
        aria-disabled="true"
      >
        {date.getDate()}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPick(date)}
      title={isTonight ? "Tonight" : undefined}
      className={cn(
        "relative h-7 w-7 rounded-md text-[11px] transition-colors",
        isSelected
          ? "bg-[#111] font-semibold text-white"
          : muted
            ? "text-[#C8C8CC] hover:bg-[#F3F4F6]"
            : "text-[#1C1C1E] hover:bg-[#F3F4F6]",
      )}
    >
      {date.getDate()}
      {isTonight && !isSelected ? (
        <span className="absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[#007AFF]" />
      ) : null}
    </button>
  );
}