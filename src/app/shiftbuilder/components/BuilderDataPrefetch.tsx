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
    if (!isAuthenticated || !user || !permissions) {
      lastPrefetchedUserIdRef.current = null;
      return;
    }
    if (lastPrefetchedUserIdRef.current === user.id) return;

    let cancelled = false;
    (async () => {
      // Confirm session cookie is live before storming night-core (avoids 401 spam
      // on expired cookie / race after PIN gate).
      try {
        const res = await fetch("/api/auth/session", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
      } catch {
        return;
      }
      if (cancelled) return;
      lastPrefetchedUserIdRef.current = user.id;
      prefetchBuilderWeek(queryClient, permissions);
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, permissions, queryClient]);

  return null;
}