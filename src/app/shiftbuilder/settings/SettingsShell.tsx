"use client";

/**
 * OMS Settings — full-page admin surface (replaces the Sudo modal).
 * Hidden entry: long-press the version label on the shift builder footer.
 */

import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { useTheme } from "../hooks/useTheme";
import { useCurrentNight } from "../hooks/useCurrentNight";
import {
  startOfShiftWeek,
  currentShiftDate,
  daysBetween,
  buildDayDefs,
  parseLocalDateISO,
  formatLocalDateISO,
} from "@/lib/shiftbuilder/dateUtils";
import { GoldHairline } from "../sudo/SudoGlass";
import { TeamTab } from "../sudo/TeamTab";
import { TasksTab } from "../sudo/TasksTab";
import { ReportsTab } from "../sudo/ReportsTab";
import { DefaultsTab } from "../sudo/DefaultsTab";
import { DashboardTab } from "../sudo/DashboardTab";
import { UsersTab } from "../sudo/UsersTab";
import { TMDefaultsTab } from "../sudo/TMDefaultsTab";
import { WeeklyRosterTab } from "../sudo/WeeklyRosterTab";

const EngineConfigTab = dynamic(
  () => import("../sudo/EngineConfigTab").then((m) => ({ default: m.EngineConfigTab })),
  { ssr: false },
);
const BatchPlannerTab = dynamic(
  () => import("../sudo/BatchPlannerTab").then((m) => ({ default: m.BatchPlannerTab })),
  { ssr: false },
);

type SettingsTab =
  | "dashboard"
  | "tmDefaults"
  | "tasks"
  | "defaults"
  | "team"
  | "weeklyRoster"
  | "users"
  | "engine"
  | "planner"
  | "reports";

type TabDef = {
  id: SettingsTab;
  label: string;
  msIcon: string;
  section: "operations" | "people" | "engine" | "insights";
};

const TABS: TabDef[] = [
  { id: "tmDefaults", label: "TM Defaults", section: "operations", msIcon: "event_repeat" },
  { id: "tasks", label: "Tasks", section: "operations", msIcon: "checklist" },
  { id: "defaults", label: "Card Defaults", section: "operations", msIcon: "layers" },
  { id: "team", label: "Team", section: "people", msIcon: "group" },
  { id: "weeklyRoster", label: "Weekly Roster", section: "people", msIcon: "table_chart" },
  { id: "users", label: "Users", section: "people", msIcon: "manage_accounts" },
  { id: "engine", label: "Engine Config", section: "engine", msIcon: "tune" },
  { id: "planner", label: "Batch Planner", section: "engine", msIcon: "bolt" },
  { id: "reports", label: "Reports", section: "insights", msIcon: "bar_chart" },
  { id: "dashboard", label: "Dashboard", section: "insights", msIcon: "dashboard" },
];

const SECTION_LABELS: Record<TabDef["section"], string> = {
  operations: "Operations",
  people: "People",
  engine: "Engine",
  insights: "Insights",
};

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

function resolveInitialTab(param: string | null): SettingsTab {
  if (param && VALID_TABS.has(param)) return param as SettingsTab;
  return "dashboard";
}

function resolveWeekContext() {
  const today = currentShiftDate();
  let weekStart = startOfShiftWeek(today);
  let dayIndex = Math.max(0, Math.min(6, daysBetween(weekStart, today)));

  if (typeof window !== "undefined") {
    const savedDate = localStorage.getItem("oms_selected_date");
    if (savedDate) {
      try {
        const parsed = parseLocalDateISO(savedDate);
        weekStart = startOfShiftWeek(parsed);
        dayIndex = Math.max(0, Math.min(6, daysBetween(weekStart, parsed)));
      } catch {
        /* keep defaults */
      }
    }
  }

  const dayDefs = buildDayDefs(weekStart, today);
  const selectedDay = dayDefs[dayIndex] ?? dayDefs[0];
  return { weekStart, selectedDay };
}

function InsufficientPermNotice({ feature, isDark = false }: { feature: string; isDark?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono tracking-[1px] mb-4 border border-amber-500/40",
          isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700",
        )}
      >
        PRIVILEGE REQUIRED
      </div>
      <div className="text-xl font-semibold tracking-[-0.3px] mb-2">{feature}</div>
      <div className={cn("max-w-sm text-[13px] leading-snug", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
        Your current role does not grant access to this tool. Contact a sudo_admin to request the necessary privilege.
      </div>
    </div>
  );
}

export function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark } = useTheme();
  const { user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();

  const canRunEngine = permissions?.canRunEngine ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(() =>
    resolveInitialTab(searchParams.get("tab")),
  );
  const [dataEpoch, setDataEpoch] = React.useState(0);

  const { weekStart, selectedDay } = React.useMemo(() => resolveWeekContext(), [dataEpoch]);
  const currentNight = useCurrentNight(selectedDay);
  const currentNightId = currentNight.nightId ?? null;

  const onDataChanged = React.useCallback(() => {
    setDataEpoch((e) => e + 1);
    const dateKey = formatLocalDateISO(selectedDay.date);
    try {
      currentNight.queryClient?.invalidateQueries({ queryKey: ["nightCore", dateKey] });
      currentNight.queryClient?.invalidateQueries({ queryKey: ["nightSecondary", dateKey] });
      currentNight.queryClient?.invalidateQueries({ queryKey: ["night", dateKey] });
    } catch {
      /* ignore */
    }
  }, [selectedDay.date, currentNight.queryClient]);

  const handleTabSelect = (tab: SettingsTab) => {
    setActiveTab(tab);
    router.replace(`/shiftbuilder/settings?tab=${tab}`, { scroll: false });
  };

  const visibleTabs = TABS.filter((t) => t.id !== "users" || currentOperator?.role === "sudo_admin");

  const sections = (["operations", "people", "engine", "insights"] as const).map((section) => ({
    id: section,
    label: SECTION_LABELS[section],
    tabs: visibleTabs.filter((t) => t.section === section),
  }));

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col",
        isDark ? "bg-[#0A0A0B] text-zinc-100" : "bg-[#F2F2F0] text-[#1C1C1E]",
      )}
    >
      <GoldHairline isDark={isDark} />

      <header
        className={cn(
          "flex items-center justify-between px-6 py-3.5 border-b shrink-0",
          isDark ? "border-white/10 bg-[#111113]" : "border-black/10 bg-[#F8F8F6]",
        )}
      >
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/shiftbuilder")}
            className={cn(
              "sb-interactive flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium border",
              isDark
                ? "border-white/10 text-zinc-300 hover:bg-white/5"
                : "border-black/10 text-[#3C3C43] hover:bg-black/5",
            )}
          >
            <span className="ms" style={{ fontSize: 16 }}>arrow_back</span>
            Shift Builder
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="ms text-[#B89708]" style={{ fontSize: 20 }}>settings</span>
            <span className="font-mono font-semibold text-[15px] tracking-[1.2px] truncate">OMS Settings</span>
            <span className="text-[11px] opacity-50 hidden sm:inline">·</span>
            <span className="font-mono text-[12px] opacity-70 truncate hidden sm:inline">
              {currentOperator?.username ?? "operator"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] shrink-0">
          {currentOperator && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Sign out ${currentOperator.full_name}?`)) {
                  logoutOperator();
                  router.push("/shiftbuilder");
                }
              }}
              className={cn(
                "sb-interactive px-3 py-1 rounded-full text-[10px] font-mono tracking-wider border",
                isDark
                  ? "border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                  : "border-black/10 text-[#6C6C72] hover:text-[#111] hover:bg-black/5",
              )}
            >
              SIGN OUT
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0 overflow-hidden">
        <nav
          className={cn(
            "w-[220px] shrink-0 border-r overflow-y-auto py-4 px-3",
            isDark ? "border-white/10 bg-[#0A0A0B]" : "border-black/10 bg-[#F2F2F0]",
          )}
        >
          {sections.map((section) => (
            <div key={section.id} className="mb-5 last:mb-0">
              <div
                className={cn(
                  "px-3 mb-1.5 text-[10px] font-mono tracking-[1.4px] uppercase",
                  isDark ? "text-zinc-500" : "text-[#9CA3AF]",
                )}
              >
                {section.label}
              </div>
              <div className="space-y-0.5">
                {section.tabs.map((t) => {
                  const isActive = activeTab === t.id;
                  let insufficientPerm = false;
                  if (t.id === "planner" || t.id === "engine") insufficientPerm = !canRunEngine;
                  if (t.id === "team") insufficientPerm = !canManageTeam;
                  const isDisabled = insufficientPerm;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => !isDisabled && handleTabSelect(t.id)}
                      disabled={isDisabled}
                      title={insufficientPerm ? "Insufficient privileges for this tool" : undefined}
                      className={cn(
                        "sb-list-row sb-interactive w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-[13px] font-medium tracking-[0.2px] text-left",
                        isActive
                          ? isDark
                            ? "bg-[#B89708]/18 text-[#F5D78A] shadow-sm font-semibold"
                            : "bg-[#B89708]/14 text-[#6B4E00] shadow-sm font-semibold"
                          : isDisabled
                            ? isDark
                              ? "text-zinc-600 cursor-not-allowed opacity-60"
                              : "text-[#9CA3AF] cursor-not-allowed opacity-60"
                            : isDark
                              ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                              : "text-[#2C2C2E] hover:bg-black/5 hover:text-[#111111]",
                      )}
                    >
                      <span className="ms" style={{ fontSize: 17, opacity: isActive ? 1 : 0.7 }}>
                        {t.msIcon}
                      </span>
                      <span className="flex-1 truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <main
          className={cn(
            "flex-1 min-h-0 overflow-auto p-6 text-[13.5px] leading-snug",
            isDark ? "bg-[#111113] text-[#F2F2F4]" : "bg-[#F8F8F6] text-[#1C1C1E]",
          )}
        >
          <div
            className={cn(
              isDark
                ? "[&_.bg-zinc-950]:bg-[#1C1C1E] [&_.bg-zinc-900]:bg-[#171719] [&_.text-zinc-100]:text-[#F2F2F4] [&_.text-zinc-400]:text-[#A1A1AA] [&_.border-zinc-800]:border-[#3A3A3C]"
                : "[&_.bg-zinc-950]:bg-white [&_.bg-zinc-900]:bg-[#F2F2F0] [&_.text-zinc-100]:text-[#1C1C1E] [&_.text-zinc-400]:text-[#6C6C72] [&_.border-zinc-800]:border-[#E5E5E7] [&_.text-zinc-200]:text-[#2C2C2E]",
            )}
          >
            {activeTab === "dashboard" && (
              <DashboardTab
                onDataChanged={onDataChanged}
                isDark={isDark}
                currentOperator={currentOperator}
                currentNightId={currentNightId}
                weekStart={weekStart}
                onNavigate={(tab) => handleTabSelect(tab as SettingsTab)}
                permissions={permissions}
              />
            )}
            {activeTab === "tmDefaults" && (
              <TMDefaultsTab
                onDataChanged={onDataChanged}
                isDark={isDark}
                currentOperator={currentOperator}
                weekStart={weekStart}
              />
            )}
            {activeTab === "team" &&
              (canManageTeam ? (
                <TeamTab onDataChanged={onDataChanged} isDark={isDark} />
              ) : (
                <InsufficientPermNotice feature="Team Management" isDark={isDark} />
              ))}
            {activeTab === "users" && currentOperator?.role === "sudo_admin" && (
              <UsersTab onDataChanged={onDataChanged} isDark={isDark} />
            )}
            {activeTab === "users" && currentOperator?.role !== "sudo_admin" && (
              <div className="p-8 text-center text-[#6C6C72]">Only sudo_admins can manage user privileges.</div>
            )}
            {activeTab === "tasks" && <TasksTab onDataChanged={onDataChanged} currentNightId={currentNightId} />}
            {activeTab === "reports" && <ReportsTab />}
            {activeTab === "engine" &&
              (canRunEngine ? (
                <EngineConfigTab onDataChanged={onDataChanged} />
              ) : (
                <InsufficientPermNotice feature="Engine Config" isDark={isDark} />
              ))}
            {activeTab === "planner" &&
              (canRunEngine ? (
                <BatchPlannerTab onDataChanged={onDataChanged} />
              ) : (
                <InsufficientPermNotice feature="Batch Planner" isDark={isDark} />
              ))}
            {activeTab === "defaults" && (
              <DefaultsTab
                onDataChanged={onDataChanged}
                currentNightId={currentNightId}
                weekStart={weekStart}
              />
            )}
            {activeTab === "weeklyRoster" && (
              <WeeklyRosterTab onDataChanged={onDataChanged} isDark={isDark} weekStart={weekStart} />
            )}
          </div>
        </main>
      </div>

      <footer
        className={cn(
          "border-t px-6 py-2 text-[10px] font-mono flex items-center justify-between shrink-0",
          isDark ? "border-white/10 text-zinc-500 bg-[#0A0A0B]" : "border-black/10 text-[#6C6C72] bg-[#F2F2F0]",
        )}
      >
        <span>
          OMS Settings · {currentOperator?.full_name ?? "operator"} · all writes audited
        </span>
        <span>pin-gated</span>
      </footer>
    </div>
  );
}

export default SettingsShell;