"use client";

import { useEffect } from "react";
import { useQueryClient, type InvalidateQueryFilters } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";
import { DEFAULTS_KEY, POOLS_KEY, PROJECTS_KEY } from "./useProjectsData";

/**
 * Live sync for /projects. Subscribes to postgres_changes on ops_work_items and
 * ops_task_pools and invalidates only the query keys backed by the changed
 * table, so a second operator's edits appear without a manual refresh — and
 * without refetching unrelated data (the roster, notably, lives under its own
 * ["roster"] root and is never touched here).
 *
 * Table → key mapping (all key shapes from useProjectsData / useRequestsData):
 * - ops_work_items backs tasks, task-detail, requests, slot defaults AND the
 *   projects list itself (projects are work_type='project' rows — there is no
 *   separate ops_projects table), so an event invalidates all five. The
 *   projects-list invalidation is exact:true because PROJECTS_KEY (["projects"])
 *   is also the root of the tree; a prefix match would drag pools along.
 * - ops_task_pools backs only the pools list.
 *
 * Deliberately simple: it invalidates (triggering a refetch) rather than merging
 * realtime payloads into the cache — robust, and the payload never diverges from
 * a fresh read. A slow poll remains as a fallback (see useProjectsData) in case
 * the socket drops. Uses a nonce'd channel per the codebase convention that
 * prevents "cannot add postgres_changes callbacks after subscribe" under HMR /
 * StrictMode (unique channel topic per mount).
 *
 * Note: the dev server's browser client uses the service-role key, so realtime
 * works there regardless of RLS; the production anon path relies on the
 * ops_work_items / ops_task_pools anon read policies added in the 20260703
 * migrations and can only be fully confirmed against a prod-key deploy.
 */

const TABLE_INVALIDATIONS: Record<string, InvalidateQueryFilters[]> = {
  ops_work_items: [
    { queryKey: PROJECTS_KEY, exact: true },
    { queryKey: ["projects", "tasks"] },
    { queryKey: ["projects", "task-detail"] },
    { queryKey: ["projects", "requests"] },
    { queryKey: DEFAULTS_KEY },
  ],
  ops_task_pools: [{ queryKey: POOLS_KEY }],
};

export function useProjectsRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const client = getSupabaseClient();
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    // One channel covers both tables, so the 250ms debounce is keyed per table:
    // a burst of work-item events collapses to one tasks refetch without
    // delaying (or triggering) a pools refetch.
    const debounces = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidate = (table: keyof typeof TABLE_INVALIDATIONS) => () => {
      const pending = debounces.get(table);
      if (pending) clearTimeout(pending);
      debounces.set(
        table,
        setTimeout(() => {
          debounces.delete(table);
          for (const filters of TABLE_INVALIDATIONS[table]) qc.invalidateQueries(filters);
        }, 250),
      );
    };

    const channel = client
      .channel(`projects-realtime-${nonce}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_work_items", filter: "department=eq.graves" },
        invalidate("ops_work_items"),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_task_pools" },
        invalidate("ops_task_pools"),
      )
      .subscribe();

    return () => {
      debounces.forEach((t) => clearTimeout(t));
      void client.removeChannel(channel);
    };
  }, [qc]);
}
