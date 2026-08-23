"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkItem } from "@/lib/tasks/types";
import {
  canonicalizeDefaultSlotKey,
  isOverlapPoolSlotKey,
} from "@/lib/shiftbuilder/overlapPoolDefaults";

export const OVERLAP_DEFAULTS_KEY = ["card-defaults", "slot-default-tasks"] as const;

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

export function useSlotDefaults() {
  return useQuery({
    queryKey: OVERLAP_DEFAULTS_KEY,
    queryFn: () => api<{ defaults: WorkItem[] }>("/api/shiftbuilder/overlap-defaults"),
    select: (data) => data.defaults,
    staleTime: 10_000,
  });
}

export interface CreateDefaultInput {
  title: string;
  slotKey: string;
  slotType: string;
  rrSide?: string | null;
  priority?: string;
  poolSortOrder?: number | null;
}

export function useCreateSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateDefaultInput) => {
      const slotKey = canonicalizeDefaultSlotKey(body.slotKey);
      const slotType = isOverlapPoolSlotKey(slotKey) ? "overlap" : body.slotType;
      return api<{ default: WorkItem }>("/api/shiftbuilder/overlap-defaults", {
        method: "POST",
        body: JSON.stringify({ ...body, slotKey, slotType }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: OVERLAP_DEFAULTS_KEY }),
  });
}

export function useUpdateSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        title: string;
        priority: string;
        recurrenceDays: number[] | null;
        poolSortOrder: number | null;
      }>;
    }) =>
      api<{ default: WorkItem }>(`/api/shiftbuilder/overlap-defaults/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: OVERLAP_DEFAULTS_KEY }),
  });
}

export function useDeleteSlotDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: true }>(`/api/shiftbuilder/overlap-defaults/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: OVERLAP_DEFAULTS_KEY }),
  });
}
