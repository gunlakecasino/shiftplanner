"use client";

import { useQuery } from "@tanstack/react-query";
import type { TaskPool, WorkItem, WorkItemDetail } from "@/lib/tasks/types";

export type ProjectWithCounts = WorkItem & { taskCounts: { total: number; open: number } };
export type PoolWithCounts = TaskPool & { taskCounts: { total: number; open: number } };

const PROJECTS_KEY = ["projects"] as const;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

export interface TaskFilters {
  projectId?: string | null;
  status?: string[];
  /** 'task' = one-off/generated instances (the List/Board), 'recurring' = templates. */
  workType?: "task" | "recurring";
}

export function tasksKey(filters: TaskFilters = {}) {
  return [
    "projects",
    "tasks",
    filters.projectId ?? "all",
    (filters.status ?? []).join(","),
    filters.workType ?? "all",
  ] as const;
}

/**
 * Polling-based live-enough sync for this foundation pass. True Postgres CDC
 * realtime (matching liveCache.ts) needs an anon-readable RLS policy on
 * ops_work_items — the same tradeoff zone_assignments already made — which is
 * a deliberate access-control call, not something to flip silently for a
 * nicer checkbox animation. See docs/TASKS_SYSTEM_PLAN.md T10 for the plan.
 */
const LIVE_ENOUGH_POLL_MS = 12_000;

export function useProjects() {
  return useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchJson<{ projects: ProjectWithCounts[] }>("/api/shiftbuilder/projects"),
    select: (data) => data.projects,
    refetchInterval: LIVE_ENOUGH_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export function useTasks(filters: TaskFilters = {}) {
  return useQuery({
    queryKey: tasksKey(filters),
    queryFn: () => {
      const sp = new URLSearchParams();
      if (filters.projectId) sp.set("projectId", filters.projectId);
      if (filters.status?.length) sp.set("status", filters.status.join(","));
      if (filters.workType) sp.set("workType", filters.workType);
      return fetchJson<{ tasks: WorkItem[] }>(`/api/shiftbuilder/projects/tasks?${sp.toString()}`);
    },
    select: (data) => data.tasks,
    refetchInterval: LIVE_ENOUGH_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/** Recurring templates only (work_type='recurring') — the Recurring view. */
export function useRecurringTemplates(projectId: string | null = null) {
  return useTasks({ projectId, workType: "recurring" });
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ["projects", "task-detail", taskId],
    queryFn: () => fetchJson<{ task: WorkItemDetail }>(`/api/shiftbuilder/projects/tasks/${taskId}`),
    select: (data) => data.task,
    enabled: !!taskId,
    staleTime: 3_000,
  });
}

export const POOLS_KEY = ["projects", "pools"] as const;

export function usePools() {
  return useQuery({
    queryKey: POOLS_KEY,
    queryFn: () => fetchJson<{ pools: PoolWithCounts[] }>("/api/shiftbuilder/projects/pools"),
    select: (data) => data.pools,
    refetchInterval: LIVE_ENOUGH_POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export interface RosterMember {
  tmId: string;
  name: string;
}

export function useRoster() {
  return useQuery({
    queryKey: ["projects", "roster"],
    queryFn: () => fetchJson<{ roster: RosterMember[] }>("/api/shiftbuilder/projects/roster"),
    select: (data) => data.roster,
    staleTime: 5 * 60_000,
  });
}

export { PROJECTS_KEY };
