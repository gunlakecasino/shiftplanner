"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { warmSupabaseConnection } from "@/lib/supabase";
import { prefetchBuilderWeek } from "../lib/builderPrefetch";

/**
 * Seeds the operational week cache after PIN auth — never prefetches on the
 * unauthenticated client fallback path (which could bypass publish policy).
 */
export function BuilderDataPrefetch() {
  const queryClient = useQueryClient();
  const { isAuthenticated, user, permissions } = useOpsAuth();
  const lastPrefetchedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    void warmSupabaseConnection();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      lastPrefetchedUserIdRef.current = null;
      return;
    }
    if (lastPrefetchedUserIdRef.current === user.id) return;
    lastPrefetchedUserIdRef.current = user.id;
    prefetchBuilderWeek(queryClient, permissions);
  }, [isAuthenticated, user, permissions, queryClient]);

  return null;
}