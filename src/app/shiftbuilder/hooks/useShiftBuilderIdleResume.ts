"use client";

import { useCallback, useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { resumeShiftBuilderConnectivity } from "@/lib/shiftbuilder/shiftBuilderResume";
import { warmSupabaseConnection } from "@/lib/supabase";
import { liveAssignmentsStore } from "@/lib/shiftbuilder/liveCache";

export type UseShiftBuilderIdleResumeOptions = {
  enabled?: boolean;
  queryClient: QueryClient | undefined;
  nightId: string | null;
  dateKey: string;
  /** Resume after this much wall-clock idle (ms). Default 45s. */
  idleThresholdMs?: number;
  /** While tab is visible, keep REST + realtime warm on this interval (ms). Default 90s. */
  keepaliveIntervalMs?: number;
  onResume?: () => void;
};

/**
 * Detects idle / background / offline gaps and restores Supabase + realtime without a full refresh.
 */
export function useShiftBuilderIdleResume({
  enabled = true,
  queryClient,
  nightId,
  dateKey,
  idleThresholdMs = 45_000,
  keepaliveIntervalMs = 90_000,
  onResume,
}: UseShiftBuilderIdleResumeOptions): void {
  const lastActiveRef = useRef(Date.now());
  const resumeRef = useRef(onResume);
  resumeRef.current = onResume;

  const markActive = useCallback(() => {
    lastActiveRef.current = Date.now();
  }, []);

  const maybeResume = useCallback(
    async (reason: string, force = false) => {
      if (!enabled || !queryClient) return;

      const idleMs = Date.now() - lastActiveRef.current;
      if (!force && idleMs < idleThresholdMs) return;

      const conn = liveAssignmentsStore.getState().connectionStatus[dateKey];
      const realtimeUnhealthy =
        conn === "error" || conn === "disconnected" || (window as any).__realtimeState === "OFFLINE";

      if (!force && idleMs < idleThresholdMs * 2 && !realtimeUnhealthy) return;

      console.log(`[shiftBuilderResume] Resuming after ${Math.round(idleMs / 1000)}s idle (${reason})`);

      try {
        await resumeShiftBuilderConnectivity({ queryClient, nightId, dateKey });
        resumeRef.current?.();
      } catch (e) {
        console.warn("[shiftBuilderResume] resume failed", e);
      } finally {
        markActive();
      }
    },
    [enabled, queryClient, nightId, dateKey, idleThresholdMs, markActive],
  );

  useEffect(() => {
    if (!enabled) return;

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void maybeResume("visibility");
      } else {
        markActive();
      }
    };

    const onFocus = () => {
      void maybeResume("focus");
    };

    const onOnline = () => {
      void maybeResume("online", true);
    };

    const onPageShow = (evt: Event) => {
      const e = evt as PageTransitionEvent;
      if (e.persisted) void maybeResume("bfcache", true);
    };

    const activityEvents = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    const onActivity = () => markActive();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    activityEvents.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );

    const keepalive = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void warmSupabaseConnection();
      const conn = liveAssignmentsStore.getState().connectionStatus[dateKey];
      if (conn === "error" || conn === "disconnected") {
        void maybeResume("keepalive-realtime", true);
      }
    }, keepaliveIntervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      activityEvents.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.clearInterval(keepalive);
    };
  }, [enabled, dateKey, keepaliveIntervalMs, maybeResume, markActive]);
}