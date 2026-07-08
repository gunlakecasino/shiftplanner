"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Live sync for /projects. Subscribes to postgres_changes on ops_work_items and
 * ops_task_pools and invalidates the ["projects"] query tree on any change, so
 * a second operator's edits appear without a manual refresh.
 *
 * Deliberately simple: it invalidates (triggering a refetch) rather than merging
 * realtime payloads into the cache — robust, and the payload never diverges from
 * a fresh read. A slow poll remains as a fallback (see useProjectsData) in case
 * the socket drops. Uses a nonce'd channel per the codebase convention that
 * prevents "cannot add postgres_changes callbacks after subscribe" under HMR /
 * StrictMode (see createNightAssignmentChannel in lib/shiftbuilder/data.ts).
 *
 * Note: the dev server's browser client uses the service-role key, so realtime
 * works there regardless of RLS; the production anon path relies on the
 * ops_work_items / ops_task_pools anon read policies added in the 20260703
 * migrations and can only be fully confirmed against a prod-key deploy.
 */
export function useProjectsRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const client = getSupabaseClient();
    const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const invalidate = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["projects"] });
      }, 250);
    };

    const channel = client
      .channel(`projects-realtime-${nonce}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_work_items", filter: "department=eq.graves" },
        invalidate,
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "ops_task_pools" }, invalidate)
      .subscribe();

    return () => {
      if (debounce) clearTimeout(debounce);
      void client.removeChannel(channel);
    };
  }, [qc]);
}
