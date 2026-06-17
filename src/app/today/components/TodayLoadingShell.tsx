"use client";

import { useEffect } from "react";
import { warmSupabaseConnection } from "@/lib/supabase";

export function TodayLoadingShell({
  label = "Loading deployment board…",
  compact = false,
}: {
  label?: string;
  /** Inline artboard loader (no full viewport height). */
  compact?: boolean;
}) {
  useEffect(() => {
    void warmSupabaseConnection();
  }, []);

  return (
    <div
      className={`flex items-center justify-center px-6 ${compact ? "flex-1 min-h-0" : "min-h-screen"}`}
      style={{
        background: "#F4F3F0",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <div className="text-center">
        <div
          className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-[#C13A14]/25 border-t-[#C13A14]"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-[#1C1C1E]">{label}</p>
      </div>
    </div>
  );
}