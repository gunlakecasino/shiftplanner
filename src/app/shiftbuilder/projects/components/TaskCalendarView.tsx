"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { WorkItem } from "@/lib/tasks/types";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isoFor(year: number, month: number, day: number): string {
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Month grid keyed by due_date. Reads task instances directly — no extra query. */
export function TaskCalendarView({
  tasks,
  onOpen,
}: {
  tasks: WorkItem[];
  onOpen: (id: string) => void;
}) {
  const todayISO = tonightDateISO();
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayISO.split("-").map(Number);
    return { year: y, month: m - 1 };
  });

  const byDate = useMemo(() => {
    const map = new Map<string, WorkItem[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    return map;
  }, [tasks]);

  const { year, month } = cursor;
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => {
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };
  const goToday = () => {
    const [y, m] = todayISO.split("-").map(Number);
    setCursor({ year: y, month: m - 1 });
  };

  return (
    <div className="sb-projects-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--sb-settings-border-subtle)] px-3 py-2">
        <span className="text-[13px] font-semibold text-[var(--ios-label)]">
          {MONTHS[month]} {year}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--sb-projects-accent)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => step(-1)}
            className="rounded-md p-1 text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)]"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            className="rounded-md p-1 text-[var(--ios-label-tertiary)] hover:bg-[var(--ios-gray-6)]"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-[var(--sb-settings-border-subtle)]">
        {DOW.map((d) => (
          <div
            key={d}
            className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--ios-label-tertiary)]"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`b-${i}`} className="min-h-[92px] border-b border-r border-[var(--sb-settings-border-subtle)] bg-[var(--ios-gray-6)]/30" />;
          }
          const iso = isoFor(year, month, day);
          const dayTasks = byDate.get(iso) ?? [];
          const isToday = iso === todayISO;
          return (
            <div
              key={iso}
              className="min-h-[92px] border-b border-r border-[var(--sb-settings-border-subtle)] p-1"
            >
              <div className="mb-1 flex justify-end">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] tabular-nums"
                  style={
                    isToday
                      ? { background: "var(--sb-projects-accent)", color: "white", fontWeight: 600 }
                      : { color: "var(--ios-label-tertiary)" }
                  }
                >
                  {day}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => {
                  const done = t.status === "complete" || t.status === "cancelled";
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onOpen(t.id)}
                      title={t.title}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight"
                      style={{
                        background: "var(--sb-projects-accent-tint)",
                        color: done ? "var(--ios-label-tertiary)" : "var(--ios-label)",
                        textDecoration: done ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </button>
                  );
                })}
                {dayTasks.length > 3 && (
                  <span className="pl-1 text-[9.5px] text-[var(--ios-label-quaternary)]">
                    +{dayTasks.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
