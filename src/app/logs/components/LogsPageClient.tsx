"use client";

import { useState } from "react";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { useTodayScheduleNav } from "@/app/today/hooks/useTodayScheduleNav";
import { TODAY_NAV_CLEARANCE } from "@/app/today/lib/constants";
import { TodayNav } from "@/app/today/components/TodayNav";
import { useDeploymentLogs } from "../hooks/useDeploymentLogs";
import { LogsTimeline } from "./LogsTimeline";

export function LogsPageClient() {
  const nav = useTodayScheduleNav();
  const [operator, setOperator] = useState<string | null>(null);
  const nightDate = formatLocalDateISO(nav.selectedDay.date);

  const { data, isLoading, isFetching } = useDeploymentLogs(nightDate, operator);

  const nightLabel = nav.selectedDay.date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className="flex h-screen flex-col overflow-hidden text-[#1C1C1E]"
      style={{
        background: "#F4F3F0",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <TodayNav
        variant="logs"
        navStrip={nav.navStrip}
        selectedNavId={nav.selectedNavId}
        selectedDayDate={nav.selectedDay.date}
        onSelectNavDay={nav.selectNavDay}
        onDayHover={nav.prefetchNight}
        onPrevWeek={nav.goPrevWeek}
        onNextWeek={nav.goNextWeek}
        onToday={nav.goToday}
        onJumpToDate={nav.jumpToDate}
        logOperators={data?.operators ?? []}
        selectedLogOperator={operator}
        onLogOperatorChange={setOperator}
      />

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ paddingTop: TODAY_NAV_CLEARANCE }}
      >
        <header className="shrink-0 border-b border-black/6 bg-white/50 px-4 backdrop-blur-sm">
          <p className="pt-3 text-[11px] font-semibold uppercase tracking-[0.35px] text-[#C13A14]">
            Graves Deployment
          </p>
          <h1 className="pb-3 text-lg font-bold tracking-tight text-[#1C1C1E]">
            Change log · {nightLabel}
          </h1>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
        {isFetching && !isLoading ? (
          <p className="px-4 py-2 text-center text-[10px] text-[#8E8E93]">Refreshing…</p>
        ) : null}
        <LogsTimeline
          entries={data?.entries ?? []}
          loading={isLoading}
          nightLabel={nightLabel}
          operatorFilter={operator}
        />
        </div>
      </div>
    </div>
  );
}