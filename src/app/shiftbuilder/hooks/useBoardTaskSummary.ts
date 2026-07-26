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

export interface BoardProjectPill {
  projectId: string;
  title: string;
  color: string;
}

export interface BoardTaskSummary {
  total: number;
  overdue: number;
  byTm: Record<string, TmTaskCount>;
  bySlot: Record<string, TmTaskCount>;
  /** Exact viewed-date projects, keyed by assigned TM. */
  projectsByTm: Record<string, BoardProjectPill[]>;
  /** Exact viewed-date projects, keyed by DB slot composite. */
  projectsBySlot: Record<string, BoardProjectPill[]>;
}

interface BoardTasksState {
  total: number;
  overdue: number;
  byTm: Record<string, TmTaskCount>;
  /** Keyed by DB slot composite: `slot_key` (zone/aux/overlap) or `slot_key|rrSide` (RR). */
  bySlot: Record<string, TmTaskCount>;
  projectsByTm: Record<string, BoardProjectPill[]>;
  projectsBySlot: Record<string, BoardProjectPill[]>;
  loaded: boolean;
  /** Operator dismissed the task overlay for this session (hides pill + badges). */
  hidden: boolean;
  setSummary: (s: BoardTaskSummary) => void;
  setHidden: (hidden: boolean) => void;
}

export const useBoardTasksStore = create<BoardTasksState>((set) => ({
  total: 0,
  overdue: 0,
  byTm: {},
  bySlot: {},
  projectsByTm: {},
  projectsBySlot: {},
  loaded: false,
  hidden: false,
  setSummary: (s) => set({ ...s, loaded: true }),
  setHidden: (hidden) => set({ hidden }),
}));

/** DB slot composite key for a task's location (zone/aux/overlap have no side). */
export function slotCompositeKey(slotKey: string, rrSide: string | null | undefined): string {
  return rrSide ? `${slotKey}|${rrSide}` : slotKey;
}

/** Per-TM count selector — cards subscribe narrowly to their occupant. */
export function useTmTaskCount(tmId: string | null | undefined): TmTaskCount | null {
  return useBoardTasksStore((s) => (tmId ? s.byTm[tmId] ?? null : null));
}

/** Per-slot count selector — cards subscribe narrowly to their own slot. */
export function useSlotTaskCount(slotCompositeKey: string | null | undefined): TmTaskCount | null {
  return useBoardTasksStore((s) => (slotCompositeKey ? s.bySlot[slotCompositeKey] ?? null : null));
}

const EMPTY_PROJECTS: BoardProjectPill[] = [];

export function useTmProjects(tmId: string | null | undefined): BoardProjectPill[] {
  return useBoardTasksStore((s) => (tmId ? s.projectsByTm[tmId] ?? EMPTY_PROJECTS : EMPTY_PROJECTS));
}

export function useSlotProjects(slotComposite: string | null | undefined): BoardProjectPill[] {
  return useBoardTasksStore((s) => (
    slotComposite ? s.projectsBySlot[slotComposite] ?? EMPTY_PROJECTS : EMPTY_PROJECTS
  ));
}

type BoardTaskRow = {
  dueDate: string | null;
  assigneeTmId: string | null;
  slotKey: string | null;
  rrSide: string | null;
  projectId: string | null;
};

type BoardProjectRow = {
  id: string;
  title: string;
  taskColor: string | null;
};

const DEFAULT_PROJECT_PILL_COLOR = "#AF52DE";

export function emptyBoardTaskSummary(): BoardTaskSummary {
  return {
    total: 0,
    overdue: 0,
    byTm: {},
    bySlot: {},
    projectsByTm: {},
    projectsBySlot: {},
  };
}

/** Convert open work into card counters plus exact-date parent-project pills. */
export function buildBoardTaskSummary(
  tasks: BoardTaskRow[],
  projects: BoardProjectRow[],
  viewedDate: string,
): BoardTaskSummary {
  const summary = emptyBoardTaskSummary();
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const projectIdsByTm = new Map<string, Set<string>>();
  const projectIdsBySlot = new Map<string, Set<string>>();
  const bump = (map: Record<string, TmTaskCount>, key: string, isOverdue: boolean) => {
    const entry = map[key] ?? { open: 0, overdue: 0 };
    entry.open += 1;
    if (isOverdue) entry.overdue += 1;
    map[key] = entry;
  };
  const addProject = (
    target: Record<string, BoardProjectPill[]>,
    seenByKey: Map<string, Set<string>>,
    key: string,
    projectId: string,
  ) => {
    const project = projectsById.get(projectId);
    if (!project) return;
    const seen = seenByKey.get(key) ?? new Set<string>();
    if (seen.has(projectId)) return;
    seen.add(projectId);
    seenByKey.set(key, seen);
    target[key] = [
      ...(target[key] ?? []),
      {
        projectId,
        title: project.title,
        color: project.taskColor || DEFAULT_PROJECT_PILL_COLOR,
      },
    ];
  };

  for (const task of tasks) {
    if (!task.dueDate || task.dueDate > viewedDate) continue;
    summary.total += 1;
    const isOverdue = task.dueDate < viewedDate;
    if (isOverdue) summary.overdue += 1;
    if (task.assigneeTmId) bump(summary.byTm, task.assigneeTmId, isOverdue);
    const slotComposite = task.slotKey
      ? slotCompositeKey(task.slotKey, task.rrSide)
      : null;
    if (slotComposite) bump(summary.bySlot, slotComposite, isOverdue);

    // A project pill describes an assignment on this selected date. Overdue
    // work remains in the count badge but does not follow the TM across nights.
    if (task.dueDate !== viewedDate || !task.projectId) continue;
    if (task.assigneeTmId) {
      addProject(
        summary.projectsByTm,
        projectIdsByTm,
        task.assigneeTmId,
        task.projectId,
      );
    }
    if (slotComposite) {
      addProject(
        summary.projectsBySlot,
        projectIdsBySlot,
        slotComposite,
        task.projectId,
      );
    }
  }

  return summary;
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
    const empty = emptyBoardTaskSummary();
    if (!enabled) {
      setSummary(empty);
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
        const [tasksRes, projectsRes] = await Promise.all([
          fetch(`/api/shiftbuilder/projects/tasks?${sp.toString()}`, {
            credentials: "same-origin",
          }),
          fetch("/api/shiftbuilder/projects", {
            credentials: "same-origin",
          }),
        ]);
        if (!tasksRes.ok) {
          if (!cancelled) setSummary(empty);
          return;
        }
        const tasksJson = await tasksRes.json();
        const projectsJson = projectsRes.ok ? await projectsRes.json() : { projects: [] };
        const summary = buildBoardTaskSummary(
          (tasksJson.tasks ?? []) as BoardTaskRow[],
          (projectsJson.projects ?? []) as BoardProjectRow[],
          tonight,
        );
        if (!cancelled) setSummary(summary);
      } catch {
        if (!cancelled) setSummary(empty);
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
