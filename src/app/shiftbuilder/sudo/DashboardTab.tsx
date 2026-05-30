"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getActiveEngineConfig, type EngineConfig } from "@/lib/shiftbuilder/engineConfig";
import { listSchedules, setWeekPublished, type ScheduleRecord } from "@/lib/shiftbuilder/sudoActions";

export interface DashboardTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
  currentOperator?: { id: string; full_name: string; username: string; role: string } | null;
  currentNightId?: string | null;
  weekStart?: Date | null;
  /** Allows the dashboard to navigate the operator to other Sudo tabs */
  onNavigate?: (tab: string) => void;
  /** Granular permissions — used to gate "Ready to Publish" widget etc. */
  permissions?: import("@/lib/auth/opsAuth").ShiftBuilderPermissions;
}

export function DashboardTab({
  isDark = false,
  currentOperator,
  onNavigate,
  onDataChanged,
  permissions,
}: DashboardTabProps) {
  const canPublish = permissions?.canPublish ?? false;
  const [engineConfig, setEngineConfig] = React.useState<EngineConfig | null>(null);
  const [unpublished, setUnpublished] = React.useState<ScheduleRecord[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, schedules] = await Promise.all([
          getActiveEngineConfig(),
          listSchedules(),
        ]);
        if (!cancelled) {
          setEngineConfig(cfg);
          const drafts = schedules.filter(s => s.status !== "published");
          setUnpublished(drafts);
        }
      } catch (e) {
        console.warn("[Dashboard] Failed to load dashboard data", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const greetingName = currentOperator?.full_name?.split(" ")[0] || currentOperator?.username || "Operator";

  const handleNav = (tab: string) => {
    onNavigate?.(tab);
  };

  const handleQuickPublish = async (schedule: ScheduleRecord) => {
    try {
      await setWeekPublished(schedule.weekId, true);
      // Refresh local list
      const fresh = await listSchedules();
      const drafts = fresh.filter(s => s.status !== "published");
      setUnpublished(drafts);
      onDataChanged?.();
    } catch (e: any) {
      alert("Failed to publish: " + (e?.message || e));
    }
  };

  return (
    <div className="space-y-6">
      {/* Greeting + Context */}
      <div className="flex items-start justify-between">
        <div>
          <div className={cn("text-[11px] uppercase tracking-[2px] font-mono", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
            GOOD EVENING
          </div>
          <div className="text-3xl font-semibold tracking-[-0.6px] mt-1">
            {greetingName}
          </div>
          <div className={cn("mt-1 text-[13px]", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
            Welcome to Sudo — privileged operations control for GRAVE.
          </div>
        </div>

        <div className={cn("text-right text-[11px] font-mono", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Quick Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatusCard
          isDark={isDark}
          icon="schedule"
          label="Current Week"
          value="GRAVE Week 23"
          sub="Fri 30 May – Thu 5 Jun"
        />
        <StatusCard
          isDark={isDark}
          icon="tune"
          label="Engine Mode"
          value={loading ? "Loading…" : (engineConfig?.placementMethod || "weighted").replace(/-/g, " ")}
          sub={loading ? "" : (engineConfig?.grokReasoningEffort ? `${engineConfig.grokReasoningEffort} reasoning` : "Deterministic")}
        />
        <StatusCard
          isDark={isDark}
          icon="verified"
          label="Last Applied"
          value="Yesterday 02:14"
          sub="TMS Week Ending 5-28"
        />
      </div>

      {/* Quick Actions */}
      <div>
        <div className={cn("text-[10px] uppercase tracking-[1.5px] font-mono mb-2", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
          QUICK ACTIONS
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <QuickAction
            isDark={isDark}
            icon="bolt"
            label="Run Batch Planner"
            onClick={() => handleNav("planner")}
          />
          <QuickAction
            isDark={isDark}
            icon="layers"
            label="Manage Card Defaults"
            onClick={() => handleNav("defaults")}
          />
          <QuickAction
            isDark={isDark}
            icon="group"
            label="Edit Team Roster"
            onClick={() => handleNav("team")}
          />
          <QuickAction
            isDark={isDark}
            icon="table_chart"
            label="Upload & Apply ADP"
            onClick={() => handleNav("schedules")}
          />
          <QuickAction
            isDark={isDark}
            icon="tune"
            label="Engine Config"
            onClick={() => handleNav("engine")}
          />
          <QuickAction
            isDark={isDark}
            icon="bar_chart"
            label="View Reports"
            onClick={() => handleNav("reports")}
          />
          <QuickAction
            isDark={isDark}
            icon="checklist"
            label="Task Catalog"
            onClick={() => handleNav("tasks")}
          />
          <QuickAction
            isDark={isDark}
            icon="receipt_long"
            label="Audit Logs"
            onClick={() => handleNav("logs")}
          />
        </div>
      </div>

      {/* Publish Widget - Weeks ready to be published (only for operators with canPublish) */}
      {(unpublished.length > 0 && canPublish) && (
        <div>
          <div className={cn("text-[10px] uppercase tracking-[1.5px] font-mono mb-2 flex items-center justify-between", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
            <span>READY TO PUBLISH</span>
            <span>{unpublished.length} week{unpublished.length > 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {unpublished.slice(0, 4).map((sch) => (
              <div
                key={sch.weekId}
                className={cn(
                  "flex items-center justify-between rounded-2xl border px-4 py-3",
                  isDark ? "border-white/10 bg-white/4" : "border-black/10 bg-white"
                )}
              >
                <div>
                  <div className={cn("font-medium text-[13px]", isDark ? "text-zinc-100" : "text-[#1C1C1E]")}>
                    {sch.weekLabel || sch.weekEnding}
                  </div>
                  <div className="text-[11px] text-[#6C6C72] font-mono truncate max-w-[220px]">
                    {sch.schedulePath}
                  </div>
                </div>
                <button
                  onClick={() => handleQuickPublish(sch)}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium active:scale-[0.985] transition-all"
                >
                  Publish
                </button>
              </div>
            ))}
            {unpublished.length > 4 && (
              <button
                onClick={() => handleNav("schedules")}
                className={cn(
                  "flex items-center justify-center rounded-2xl border text-sm font-medium",
                  isDark ? "border-white/10 hover:bg-white/5" : "border-black/10 hover:bg-[#F8F8F6]"
                )}
              >
                View all {unpublished.length} in Schedules →
              </button>
            )}
          </div>
        </div>
      )}

      {/* System Notes / Future Widgets */}
      <div className={cn("rounded-2xl border p-5 text-[12.5px]", isDark ? "border-white/10 bg-white/3" : "border-black/8 bg-black/2")}>
        <div className="flex items-center gap-2 mb-2">
          <span className="ms text-[#B89708]" style={{ fontSize: 16 }}>info</span>
          <span className="font-medium">Sudo Home</span>
        </div>
        <p className={cn("leading-relaxed", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
          This dashboard is your calm command post. Use the left rail for deep tools. 
          All changes here are audited and immediately available to the live floor.
        </p>
      </div>
    </div>
  );
}

function StatusCard({
  isDark,
  icon,
  label,
  value,
  sub,
}: {
  isDark: boolean;
  icon: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 transition-all",
      isDark 
        ? "border-white/10 bg-white/4" 
        : "border-black/8 bg-white"
    )}>
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider mb-2">
        <span className="ms" style={{ fontSize: 15, color: isDark ? "#B89708" : "#8B6910" }}>{icon}</span>
        {label}
      </div>
      <div className="text-[15px] font-semibold tracking-[-0.2px] leading-tight">{value}</div>
      {sub && <div className={cn("text-[11px] mt-0.5", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>{sub}</div>}
    </div>
  );
}

function QuickAction({
  isDark,
  icon,
  label,
  onClick,
}: {
  isDark: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-all active:scale-[0.985]",
        isDark
          ? "border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20"
          : "border-black/10 bg-white hover:bg-[#F8F8F6] hover:border-black/15"
      )}
    >
      <span className="ms text-[#B89708] group-hover:scale-110 transition-transform" style={{ fontSize: 20 }}>{icon}</span>
      <span className={cn("text-[13px] font-medium tracking-[-0.1px]", isDark ? "text-zinc-100" : "text-[#1C1C1E]")}>
        {label}
      </span>
    </button>
  );
}
