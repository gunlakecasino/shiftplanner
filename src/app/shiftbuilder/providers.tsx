// v1.1 — iPad UI/UX world-class release
"use client";

import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { reportWebVitals } from "@/lib/perf";
import {
  clearBuilderNightQueries,
  registerOpsSessionQueryCacheHandler,
} from "@/lib/auth/opsSessionQueryCache";
import { getSupabaseRestOrigin, warmSupabaseConnection } from "@/lib/supabase";
import { resetLiveCrossDayCache } from "@/lib/shiftbuilder/liveCache";
import { useShiftBuilderStore } from "./store/useShiftBuilderStore";
import { BuilderDataPrefetch } from "./components/BuilderDataPrefetch";
import { toast } from "sonner";
import { useOpsAuth } from "@/lib/auth/opsAuth";

const DRAFT_RECOVERY_PREFIX = "shiftbuilder:draft-recovery:";
const DRAFT_RECOVERY_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * QueryProvider
 *
 * Single QueryClient per browser session + early Supabase connection warm.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const { user } = useOpsAuth();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.suppressGlobalError) return;
            const message = error instanceof Error ? error.message : "The change could not be saved.";
            toast.error("Change not saved", { description: message });
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  useEffect(() => {
    const origin = getSupabaseRestOrigin();
    if (origin && !document.querySelector(`link[data-supabase-preconnect]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect";
      link.href = origin;
      link.crossOrigin = "anonymous";
      link.setAttribute("data-supabase-preconnect", "1");
      document.head.appendChild(link);
    }
    void warmSupabaseConnection();
  }, []);

  useEffect(() => {
    return registerOpsSessionQueryCacheHandler(() => {
      const state = useShiftBuilderStore.getState();
      if (user?.id && Object.keys(state.draftAssignments).length > 0) {
        try {
          sessionStorage.setItem(
            `${DRAFT_RECOVERY_PREFIX}${user.id}`,
            JSON.stringify({
              savedAt: Date.now(),
              draftAssignments: state.draftAssignments,
              isDraftMode: state.isDraftMode,
            }),
          );
        } catch {
          // Session cleanup must continue even when storage is unavailable.
        }
      }
      clearBuilderNightQueries(queryClient);
      resetLiveCrossDayCache();
      state.setAssignments({});
      state.clearDraft();
    });
  }, [queryClient, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    const key = `${DRAFT_RECOVERY_PREFIX}${user.id}`;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        savedAt?: number;
        draftAssignments?: Record<string, unknown>;
        isDraftMode?: boolean;
      };
      sessionStorage.removeItem(key);
      if (
        !saved.savedAt ||
        Date.now() - saved.savedAt > DRAFT_RECOVERY_MAX_AGE_MS ||
        !saved.draftAssignments ||
        Object.keys(saved.draftAssignments).length === 0
      ) {
        return;
      }
      const state = useShiftBuilderStore.getState();
      if (Object.keys(state.draftAssignments).length > 0) return;
      state.setDraftAssignments(saved.draftAssignments);
      state.setIsDraftMode(saved.isDraftMode !== false);
      toast.success("Draft restored", {
        description: "Your uncommitted placement work was preserved while the session was locked.",
      });
    } catch {
      sessionStorage.removeItem(key);
    }
  }, [user?.id]);

  return (
    <QueryClientProvider client={queryClient}>
      <BuilderDataPrefetch />
      {children}
    </QueryClientProvider>
  );
}

if (typeof window !== "undefined") {
  reportWebVitals();
}
