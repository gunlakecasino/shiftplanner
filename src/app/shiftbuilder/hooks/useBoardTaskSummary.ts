"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

/**
 * Board task awareness — "the brain behind the board."
 *
 * Loads open Ops Tasks due on-or-before the viewed night and exposes a summary
 * the deployment canvas can read: per-TM counts (for card badges + the placement
 * pad) and totals (for the floating ops pill). Purely informational — never a
 * placement/scoring signal (T1). Isolated in its own tiny store so it never
 * touches the main board store.
 */

export interface TmTaskCount {
  open: number;
  overdue: number;
}

interface BoardTasksState {
  total: number;
  overdue: number;
  byTm: Record<string, TmTaskCount>;
  loaded: boolean;
  /** Operator dismissed the task overlay for this session (hides pill + badges). */
  hidden: boolean;
  setSummary: (s: { total: number; overdue: number; byTm: Record<string, TmTaskCount> }) => void;
  setHidden: (hidden: boolean) => void;
}

export const useBoardTasksStore = create<BoardTasksState>((set) => ({
  total: 0,
  overdue: 0,
  byTm: {},
  loaded: false,
  hidden: false,
  setSummary: (s) => set({ ...s, loaded: true }),
  setHidden: (hidden) => set({ hidden }),
}));

/** Per-TM count selector — cards subscribe narrowly to their occupant. */
export function useTmTaskCount(tmId: string | null | undefined): TmTaskCount | null {
  return useBoardTasksStore((s) => (tmId ? s.byTm[tmId] ?? null : null));
}

const POLL_MS = 60_000;

/**
 * Populates the board task store for the given night. Call once from the board.
 * `enabled` should be the operator's canAccessTasks — when false, it no-ops
 * (and leaves an empty summary, so nothing renders).
 */
export function useBoardTaskSummary(nightDateISO: string | null, enabled: boolean) {
  const setSummary = useBoardTasksStore((s) => s.setSummary);

  useEffect(() => {
    if (!enabled) {
      setSummary({ total: 0, overdue: 0, byTm: {} });
      return;
    }
    let cancelled = false;

    const load = async () => {
      const tonight = nightDateISO || tonightDateISO();
      try {
        const sp = new URLSearchParams({
          workType: "task",
          dueOnOrBefore: tonight,
          status: "not_started,in_progress,blocked,on_hold",
        });
        const res = await fetch(`/api/shiftbuilder/projects/tasks?${sp.toString()}`, {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (!cancelled) setSummary({ total: 0, overdue: 0, byTm: {} });
          return;
        }
        const json = await res.json();
        const tasks: Array<{ dueDate: string | null; assigneeTmId: string | null }> = json.tasks ?? [];

        let total = 0;
        let overdue = 0;
        const byTm: Record<string, TmTaskCount> = {};
        for (const t of tasks) {
          if (!t.dueDate || t.dueDate > tonight) continue;
          total += 1;
          const od = t.dueDate < tonight;
          if (od) overdue += 1;
          if (t.assigneeTmId) {
            const e = byTm[t.assigneeTmId] ?? { open: 0, overdue: 0 };
            e.open += 1;
            if (od) e.overdue += 1;
            byTm[t.assigneeTmId] = e;
          }
        }
        if (!cancelled) setSummary({ total, overdue, byTm });
      } catch {
        if (!cancelled) setSummary({ total: 0, overdue: 0, byTm: {} });
      }
    };

    load();
    const iv = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [nightDateISO, enabled, setSummary]);
}
