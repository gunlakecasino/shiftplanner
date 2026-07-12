"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { TaskPool, WorkItem, WorkItemDetail, WorkItemStatus } from "@/lib/tasks/types";
import {
  canonicalizeDefaultSlotKey,
  isOverlapPoolSlotKey,
} from "@/lib/shiftbuilder/overlapPoolDefaults";
import { DEFAULTS_KEY, POOLS_KEY, PROJECTS_KEY, type ProjectWithCounts } from "./useProjectsData";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Every tasks-list query in the cache, regardless of filter — patched together on optimistic edits. */
function allTasksQueryKeys(qc: ReturnType<typeof useQueryClient>): QueryKey[] {
  return qc
    .getQueryCache()
    .findAll({ queryKey: ["projects", "tasks"] })
    .map((q) => q.queryKey);
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; description?: string }) =>
      api<{ project: WorkItem }>("/api/shiftbuilder/projects", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/projects/${projectId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROJECTS_KEY }),
  });
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  projectId?: string | null;
  priority?: string;
  category?: string | null;
  assigneeTmId?: string | null;
  dueDate?: string | null;
  dueShift?: string | null;
  workType?: "task" | "recurring";
  recurrenceType?: string;
  recurrenceDays?: number[];
  advanceDays?: number;
  slotKey?: string | null;
  slotType?: string | null;
  rrSide?: string | null;
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskInput) =>
      api<{ task: WorkItem }>("/api/shiftbuilder/projects/tasks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

export interface UpdateTaskInput {
  taskId: string;
  patch: Partial<{
    title: string;
    description: string | null;
    priority: string;
    category: string | null;
    projectId: string | null;
    poolId: string | null;
    dueDate: string | null;
    dueShift: string | null;
    assigneeTmId: string | null;
    slotKey: string | null;
    slotType: string | null;
    rrSide: string | null;
    status: WorkItemStatus;
    statusReason: string;
  }>;
}

/** Generic task PATCH with optimistic list-cache patching + snapshot rollback (T10). */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, patch }: UpdateTaskInput) =>
      api<{ task: WorkItem }>(`/api/shiftbuilder/projects/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async ({ taskId, patch }) => {
      const keys = allTasksQueryKeys(qc);
      await Promise.all(keys.map((k) => qc.cancelQueries({ queryKey: k })));
      const snapshots = keys.map((key) => [key, qc.getQueryData(key)] as const);

      for (const key of keys) {
        qc.setQueryData<{ tasks: WorkItem[] } | undefined>(key, (prev) =>
          prev
            ? {
                tasks: prev.tasks.map((t) => (t.id === taskId ? { ...t, ...(patch as Partial<WorkItem>) } : t)),
              }
            : prev,
        );
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: (_data, _err, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
      qc.invalidateQueries({ queryKey: ["projects", "task-detail", taskId] });
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/projects/tasks/${taskId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
  });
}

export function useGenerateNextOccurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      api<{ instance: WorkItem; template: WorkItem }>(
        `/api/shiftbuilder/projects/tasks/${templateId}/generate-next`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "tasks"] }),
  });
}

export function useToggleChecklistItem(taskId: string) {
  const qc = useQueryClient();
  const key = ["projects", "task-detail", taskId];
  return useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: string; isDone: boolean }) =>
      api(`/api/shiftbuilder/projects/tasks/${taskId}/checklist/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ isDone }),
      }),
    onMutate: async ({ itemId, isDone }) => {
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<{ task: WorkItemDetail }>(key);
      qc.setQueryData<{ task: WorkItemDetail } | undefined>(key, (prev) =>
        prev
          ? {
              task: {
                ...prev.task,
                checklist: prev.task.checklist.map((c) => (c.id === itemId ? { ...c, isDone } : c)),
              },
            }
          : prev,
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData(key, ctx.snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useAddChecklistItem(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) =>
      api(`/api/shiftbuilder/projects/tasks/${taskId}/checklist`, {
        method: "POST",
        body: JSON.stringify({ label }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "task-detail", taskId] }),
  });
}

export function useCreatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; distributionMode?: string }) =>
      api<{ pool: TaskPool }>("/api/shiftbuilder/projects/pools", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  });
}

export function useUpdatePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poolId, patch }: { poolId: string; patch: Record<string, unknown> }) =>
      api<{ pool: TaskPool }>(`/api/shiftbuilder/projects/pools/${poolId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: POOLS_KEY }),
  });
}

export function useDeletePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poolId: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/projects/pools/${poolId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: POOLS_KEY });
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
    },
  });
}

export function useDistributePool() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (poolId: string) =>
      api<{ distributed: number; message?: string }>(
        `/api/shiftbuilder/projects/pools/${poolId}/distribute`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
      qc.invalidateQueries({ queryKey: POOLS_KEY });
    },
  });
}

export interface CreateDefaultInput {
  title: string;
  slotKey: string;
  slotType: string;
  rrSide?: string | null;
  taskColor?: string | null;
  isCoverage?: boolean;
  priority?: string;
  recurrenceDays?: number[] | null;
  poolSortOrder?: number | null;
}

export interface UpdateDefaultInput {
  id: string;
  patch: Partial<{
    title: string;
    taskColor: string | null;
    active: boolean;
    isCoverage: boolean;
    priority: string;
    recurrenceDays: number[] | null;
    poolSortOrder: number | null;
  }>;
}

export function useCreateSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDefaultInput) => {
      // Canonicalize OL pool writes to overlap_am_0 / overlap_pm_0 (PR5).
      // Server re-checks the same rule; client keeps request payloads consistent.
      const slotKey = canonicalizeDefaultSlotKey(body.slotKey);
      const slotType = isOverlapPoolSlotKey(slotKey) ? "overlap" : body.slotType;
      return api<{ default: WorkItem }>("/api/shiftbuilder/projects/defaults", {
        method: "POST",
        body: JSON.stringify({ ...body, slotKey, slotType }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFAULTS_KEY }),
  });
}

export function useUpdateSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateDefaultInput) =>
      api<{ default: WorkItem }>(`/api/shiftbuilder/projects/defaults/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFAULTS_KEY }),
  });
}

export function useDeleteSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/projects/defaults/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEFAULTS_KEY }),
  });
}

export function useAddComment(taskId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api(`/api/shiftbuilder/projects/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", "task-detail", taskId] }),
  });
}

export type { ProjectWithCounts };
