"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { warmSupabaseConnection } from "@/lib/supabase";
import { prefetchBuilderWeek } from "../lib/builderPrefetch";

/**
 * Runs during PIN gate + auth hydration — seeds week cache before AuthedShiftBuilder mounts.
 */
export function BuilderDataPrefetch() {
  const queryClient = useQueryClient();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    void warmSupabaseConnection();
    prefetchBuilderWeek(queryClient);
  }, [queryClient]);

  return null;
}