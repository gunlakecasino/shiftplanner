"use client";

import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { cva } from "class-variance-authority";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Download,
  LayoutGrid,
  MoreHorizontal,
  Printer,
  Sparkles,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";
import {
  currentShiftDate,
  formatLocalDateISO,
  MONTH_LONG,
  sameDay,
} from "@/lib/shiftbuilder/dateUtils"; // addDays removed after calendar month nav simplification
import { DEPLOYMENT_CANVAS_MAX_WIDTH_PX } from "@/lib/shiftbuilder/canvasLayout";
import { shiftBuilderVersionLabel } from "@/app/shiftbuilder/version";
import { TodayConnectionPill } from "./TodayConnectionPill";
import { clearTodayOperatorName } from "../lib/todayChangeLog";
import { fetchPublishedDates } from "../lib/publishedDates";
import type { NavDayStripItem, TodayBoardView } from "../hooks/useTodayScheduleNav";

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
  disabled = false,
  children,
  className,
}: {
  onClick?: () => void;
  title: string;
  ariaLabel?: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      className={cn(
        "flex h-8 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5",
        isTabletTouchDevice() && "sb-tablet-touch-target h-11 min-w-11",
        !className?.includes("px-") && "w-8",
        active && "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-100",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export type TodayNavProps = {
  navStrip: NavDayStripItem[];
  selectedNavId: number;
  selectedDayDate: Date;
  onSelectNavDay: (navId: number) => void;
  onDayHover?: (date: Date) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onJumpToDate: (date: Date) => void;
  operatorName?: string;
  onChangeOperator?: () => void;
  currentView?: TodayBoardView;
  onViewChange?: (view: TodayBoardView) => void;
  /** Show print for tonight or published schedules only. */
  showPrint?: boolean;
  onPrint?: () => void;
  onExportPdf?: () => void;
  isPrinting?: boolean;
  isExporting?: boolean;
  exportProgressLabel?: string;
  /** Shift-aware today (8:30am rollover) — keep calendar in sync with the nav strip. */
  todayShiftDate?: Date;
  /** Published dates for the visible 9-day strip (grey out unpublished history). */
  publishedStripDates?: Set<string>;
  publishedStripDatesLoading?: boolean;
  zenActive?: boolean;
  onToggleZen?: () => void;
};

export function TodayNav({
  navStrip,
  selectedNavId,
  selectedDayDate,
  onSelectNavDay,
  onDayHover,
  onPrevWeek,
  onNextWeek,
  onToday,
  onJumpToDate,
  operatorName = "",
  onChangeOperator,
  currentView = "deployment",
  onViewChange,
  showPrint = false,
  onPrint,
  onExportPdf,
  isPrinting = false,
  isExporting = false,
  exportProgressLabel,
  todayShiftDate: todayShiftDateProp,
  publishedStripDates,
  publishedStripDatesLoading = false,
  zenActive = false,
  onToggleZen,
}: TodayNavProps) {
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
      const pop = document.getElementById("today-nav-calendar-popover");
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

  const monthRange = React.useMemo(() => {
    const year = calendarView.getFullYear();
    const month = calendarView.getMonth();
    const from = formatLocalDateISO(new Date(year, month, 1));
    const to = formatLocalDateISO(new Date(year, month + 1, 0));
    return { from, to };
  }, [calendarView]);

  const {
    data: publishedDates,
    isError: publishedDatesError,
    isFetching: publishedDatesFetching,
    refetch: refetchPublishedDates,
  } = useQuery({
    queryKey: ["todayPublishedDates", monthRange.from, monthRange.to],
    queryFn: () => fetchPublishedDates(monthRange.from, monthRange.to),
    staleTime: 1000 * 60 * 5,
    refetchInterval: calendarOpen ? 60_000 : false,
    refetchOnWindowFocus: true,
    retry: 1,
    enabled: calendarOpen,
  });

  // Note: glass appearance is primarily provided by navVariants() cva (glass variant).
  // We only need an inline style here for the elevated z-index on the fixed nav.
  // The previous duplicate glassStyle object (exact backdrop/shadow copy of the cva)
  // was removed during production cleanup to eliminate drift.

  const monthLabel = `${MONTH_LONG[selectedDayDate.getMonth()]} ${selectedDayDate.getFullYear()}`;
  const todayShiftDate = todayShiftDateProp ?? currentShiftDate();
  const stripPublishReady =
    publishedStripDates !== undefined && !publishedStripDatesLoading;

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
          "sb-today-nav-chrome",
          isTabletTouchDevice() ? "sb-tablet-nav sb-tablet-nav--centered" : "overflow-hidden",
        )}
        style={{
          position: "fixed",
          ...(isTabletTouchDevice()
            ? { ["--sb-nav-max-width" as string]: `${DEPLOYMENT_CANVAS_MAX_WIDTH_PX}px` }
            : {
                top: 8,
                left: "50%",
                right: "auto",
                width: `min(calc(100vw - 48px), ${DEPLOYMENT_CANVAS_MAX_WIDTH_PX}px)`,
                maxWidth: DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
                transform: "translateX(-50%)",
              }),
          boxSizing: "border-box",
          zIndex: 40,
        }}
        aria-label="Schedule navigation"
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
              {navStrip.map((day) => (
                <NavStripDayPill
                  key={day.navId}
                  day={day}
                  isActive={day.navId === selectedNavId}
                  stripPublishReady={stripPublishReady}
                  publishedStripDates={publishedStripDates}
                  onSelectNavDay={onSelectNavDay}
                  onDayHover={onDayHover}
                />
              ))}
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

        {/* RIGHT: deployment board tools (no outbound nav links) */}
        <div className="flex shrink-0 items-center gap-2 border-l border-white/20 pl-2 text-[11px]">
          <div
            className="flex shrink-0 items-center rounded-lg p-0.5"
            style={{ background: "rgba(0,0,0,0.04)" }}
          >
            <NavToolButton
              onClick={() => onViewChange?.("deployment")}
              title="Deployment board"
              ariaLabel="Deployment board"
              active={currentView === "deployment"}
            >
              <LayoutGrid className={NAV_ICON} />
            </NavToolButton>
            <NavToolButton
              onClick={() => onViewChange?.("breaks")}
              title="Break sheet"
              ariaLabel="Break sheet"
              active={currentView === "breaks"}
            >
              <Coffee className={NAV_ICON} />
            </NavToolButton>
          </div>
          <TodayConnectionPill date={selectedDayDate} />
          {onToggleZen ? (
            <NavToolButton
              onClick={onToggleZen}
              title={zenActive ? "Exit zen mode" : "Zen mode — hide chrome"}
              ariaLabel={zenActive ? "Exit zen mode" : "Enter zen mode"}
              active={zenActive}
              className="sb-kiosk-tap-target"
            >
              <Sparkles className={NAV_ICON} />
            </NavToolButton>
          ) : null}
          <span
            className="hidden max-w-[6.5rem] truncate font-semibold text-[#1C1C1E] sm:inline"
            title={operatorName ? `Logged as ${operatorName}` : undefined}
          >
            {operatorName}
          </span>
          <TodayNavOverflowMenu
            showPrint={showPrint}
            onPrint={onPrint}
            onExportPdf={onExportPdf}
            isPrinting={isPrinting}
            isExporting={isExporting}
            exportProgressLabel={exportProgressLabel}
            onChangeOperator={onChangeOperator}
            versionLabel={shiftBuilderVersionLabel()}
          />
        </div>
      </nav>

      {calendarOpen && popoverPos
        ? createPortal(
            <div
              id="today-nav-calendar-popover"
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

              {publishedDatesFetching && !publishedDates ? (
                <p className="mb-2 px-1 text-center text-[10px] text-[#8E8E93]">Loading publish status…</p>
              ) : null}
              {publishedDatesError ? (
                <div className="mb-2 rounded-lg border border-amber-200/80 bg-amber-50 px-2 py-1.5 text-[10px] leading-snug text-amber-900">
                  <p>Couldn&apos;t load publish status.</p>
                  <button
                    type="button"
                    onClick={() => void refetchPublishedDates()}
                    className="mt-0.5 font-semibold text-[#C13A14] hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : null}

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
                    const iso = formatLocalDateISO(d);
                    const isTonight = sameDay(d, todayShiftDate);
                    const isPublished = publishedDates?.has(iso) ?? false;
                    const datesReady =
                      publishedDates !== undefined && !publishedDatesError;
                    const isUnpublished =
                      datesReady && !isPublished && !isTonight;

                    return (
                      <CalendarDayButton
                        key={key}
                        date={d}
                        muted={muted}
                        isSelected={sameDay(d, selectedDayDate)}
                        isUnpublished={isUnpublished}
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

function TodayNavOverflowMenu({
  showPrint,
  onPrint,
  onExportPdf,
  isPrinting,
  isExporting,
  exportProgressLabel,
  onChangeOperator,
  versionLabel,
}: {
  showPrint: boolean;
  onPrint?: () => void;
  onExportPdf?: () => void;
  isPrinting: boolean;
  isExporting: boolean;
  exportProgressLabel?: string;
  onChangeOperator?: () => void;
  versionLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const compute = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - 200) });
    };
    const raf = requestAnimationFrame(compute);
    window.addEventListener("resize", compute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", compute);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      const pop = document.getElementById("today-nav-overflow-menu");
      if (pop?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const busy = isPrinting || isExporting;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all hover:bg-black/5 active:scale-95 dark:hover:bg-white/5",
          isTabletTouchDevice() && "sb-tablet-touch-target h-11 min-w-11",
          open && "bg-white shadow-sm dark:bg-zinc-800",
        )}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More actions"
        title="More actions"
      >
        <MoreHorizontal className={NAV_ICON} />
      </button>

      {open && pos
        ? createPortal(
            <div
              id="today-nav-overflow-menu"
              role="menu"
              className="fixed z-[70] w-[200px] rounded-xl border border-white/70 bg-white/95 py-1 text-[12px] shadow-2xl shadow-black/10 backdrop-blur-xl"
              style={{ top: pos.top, left: pos.left }}
            >
              {showPrint && onPrint ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    close();
                    onPrint();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-[#1C1C1E] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                >
                  <Printer className="h-3.5 w-3.5 opacity-70" />
                  {isPrinting ? "Printing…" : "Print sheets"}
                </button>
              ) : null}
              {showPrint && onExportPdf ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={busy}
                  onClick={() => {
                    close();
                    onExportPdf();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-[#1C1C1E] transition-colors hover:bg-black/[0.04] disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5 opacity-70" />
                  {isExporting ? exportProgressLabel ?? "Exporting…" : "Download PDF"}
                </button>
              ) : null}
              {(showPrint && (onPrint || onExportPdf)) && onChangeOperator ? (
                <div className="my-1 border-t border-[#E5E5E7]" />
              ) : null}
              {onChangeOperator ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    clearTodayOperatorName();
                    onChangeOperator();
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-[#1C1C1E] transition-colors hover:bg-black/[0.04]"
                >
                  <UserRound className="h-3.5 w-3.5 opacity-70" />
                  Change name
                </button>
              ) : null}
              <div className="mt-1 border-t border-[#E5E5E7] px-3 py-2 font-mono text-[10px] tabular-nums text-[#AEAEB2]">
                {versionLabel}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function NavStripDayPill({
  day,
  isActive,
  stripPublishReady,
  publishedStripDates,
  onSelectNavDay,
  onDayHover,
}: {
  day: NavDayStripItem;
  isActive: boolean;
  stripPublishReady: boolean;
  publishedStripDates?: Set<string>;
  onSelectNavDay: (navId: number) => void;
  onDayHover?: (date: Date) => void;
}) {
  const isBridge = !!day.bridge;
  const iso = formatLocalDateISO(day.date);
  const isPublished = publishedStripDates?.has(iso) ?? false;
  const isUnpublished =
    stripPublishReady && !day.isToday && !isPublished && !isActive;

  if (isUnpublished) {
    return (
      <span
        className={cn(
          datePillVariants({ active: false }),
          "sb-today-unpublished-pill relative z-10 flex min-h-[36px] w-full min-w-0 cursor-default items-center justify-center rounded-full px-0.5 text-[12px] font-semibold tabular-nums select-none",
        )}
        style={{
          color: "#C7C7CC",
          border: isBridge ? "1px dashed rgba(0,0,0,0.08)" : "1px solid transparent",
        }}
        title="Not published — no schedule on /today"
        aria-disabled="true"
      >
        <span className="leading-none">{day.dayLetter}</span>
      </span>
    );
  }

  return (
    <button
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
      {isActive ? (
        <motion.div
          layoutId="today-active-date-pill"
          className="absolute inset-0 -z-10 rounded-full"
          style={{ background: ACCENT }}
          transition={SPRING}
        />
      ) : null}
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