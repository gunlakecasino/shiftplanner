"use client";

/**
 * Task-request data layer (owner-scoped intake + manager triage). Shared by the
 * board request modal (requesters) and the Projects-page pending queue (managers).
 * Backed by /api/shiftbuilder/projects/requests/**.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkItem } from "@/lib/tasks/types";
import { PROJECTS_KEY } from "./useProjectsData";

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

export const MY_REQUESTS_KEY = ["projects", "requests", "mine"] as const;
export const PENDING_REQUESTS_KEY = ["projects", "requests", "pending"] as const;

const POLL_MS = 30_000;

/** The caller's own submitted requests (every approval state). */
export function useMyRequests(enabled = true) {
  return useQuery({
    queryKey: MY_REQUESTS_KEY,
    queryFn: () => api<{ requests: WorkItem[] }>("/api/shiftbuilder/projects/requests"),
    select: (data) => data.requests,
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/** Manager triage queue — every pending request (tasks + projects). */
export function usePendingRequests(enabled = true) {
  return useQuery({
    queryKey: PENDING_REQUESTS_KEY,
    queryFn: () => api<{ requests: WorkItem[] }>("/api/shiftbuilder/projects/requests/pending"),
    select: (data) => data.requests,
    enabled,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

export interface CreateRequestInput {
  workType: "task" | "project";
  title: string;
  description?: string | null;
  priority?: string;
  category?: string | null;
  dueDate?: string | null;
}

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRequestInput) =>
      api<{ request: WorkItem }>("/api/shiftbuilder/projects/requests", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: PENDING_REQUESTS_KEY });
    },
  });
}

export interface UpdateRequestInput {
  id: string;
  patch: Partial<{
    title: string;
    description: string | null;
    priority: string;
    category: string | null;
    dueDate: string | null;
  }>;
}

export function useUpdateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateRequestInput) =>
      api<{ request: WorkItem }>(`/api/shiftbuilder/projects/requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: PENDING_REQUESTS_KEY });
    },
  });
}

export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/projects/requests/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: PENDING_REQUESTS_KEY });
    },
  });
}

export interface DecideRequestInput {
  id: string;
  decision: "approve" | "reject";
  note?: string;
}

export function useDecideRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision, note }: DecideRequestInput) =>
      api<{ request: WorkItem }>(`/api/shiftbuilder/projects/requests/${id}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PENDING_REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: PROJECTS_KEY });
      qc.invalidateQueries({ queryKey: ["projects", "tasks"] });
    },
  });
}
