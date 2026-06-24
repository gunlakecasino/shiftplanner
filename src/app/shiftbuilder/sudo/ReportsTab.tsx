"use client";

/**
 * Settings-embedded reports — compact dashboard with link to full /shiftbuilder/reports page.
 */

import React from "react";
import Link from "next/link";
import { ArrowUpRight, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sudoIosClasses } from "./sudoIosTheme";
import { ReportsDashboard } from "../reports/components/ReportsDashboard";

export interface ReportsTabProps {
  isDark?: boolean;
}

export function ReportsTab({ isDark = false }: ReportsTabProps = {}) {
  const ios = sudoIosClasses(isDark);

  return (
    <div className={cn("flex h-full min-h-0 flex-col", ios.page)}>
      <div className="sb-settings-bleed-bar flex shrink-0 items-center justify-between gap-3 border-b border-[var(--sb-settings-border-paper)] bg-[color-mix(in_srgb,#4D1A8A_6%,var(--ios-background-secondary))] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{
              background: "color-mix(in srgb, #4D1A8A 14%, transparent)",
              color: "#4D1A8A",
            }}
          >
            <BarChart3 size={16} strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-[var(--ios-label)]">
              Embedded preview
            </div>
            <div className="truncate text-[10px] text-[var(--ios-label-tertiary)]">
              Open the full dashboard for expanded charts and layout
            </div>
          </div>
        </div>
        <Link
          href="/shiftbuilder/reports"
          className="sb-interactive inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors"
          style={{
            borderColor: "color-mix(in srgb, #4D1A8A 30%, var(--sb-settings-border-paper))",
            color: "#4D1A8A",
            background: "color-mix(in srgb, #4D1A8A 8%, var(--ios-background-secondary))",
          }}
        >
          Full Dashboard
          <ArrowUpRight size={13} />
        </Link>
      </div>

      <ReportsDashboard embedded initialView="overview" className="flex-1" />
    </div>
  );
}