"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { getActiveEngineConfig, type EngineConfig } from "@/lib/shiftbuilder/engineConfig";
import type { SettingsTab } from "../settings/settingsConfig";


export interface DashboardTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
  currentOperator?: { id: string; full_name: string; username: string; role: string } | null;
  currentNightId?: string | null;
  weekStart?: Date | null;
  /** Navigate to another settings tab */
  onNavigate?: (tab: SettingsTab) => void;
  permissions?: import("@/lib/auth/opsAuth").ShiftBuilderPermissions;
}

export function DashboardTab({
  isDark = false,
  currentOperator,
  onNavigate,
}: DashboardTabProps) {
  const [engineConfig, setEngineConfig] = React.useState<EngineConfig | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getActiveEngineConfig();
        if (!cancelled) setEngineConfig(cfg);
      } catch (e) {
        console.warn("[Dashboard] Failed to load dashboard data", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const greetingName = currentOperator?.full_name?.split(" ")[0] || currentOperator?.username || "Operator";

  const handleNav = (tab: SettingsTab) => {
    onNavigate?.(tab);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className={cn("text-[11px] uppercase tracking-[2px] font-mono", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
            GOOD EVENING
          </div>
          <div className="text-3xl font-semibold tracking-[-0.6px] mt-1">
            {greetingName}
          </div>
          <div className={cn("mt-1 text-[13px]", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
            Welcome to OMS Settings — privileged operations control for GRAVE.
          </div>
        </div>

        <div className={cn("text-right text-[11px] font-mono", isDark ? "text-[#8E8E93]" : "text-[#6C6C72]")}>
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatusCard
          isDark={isDark}
          icon="tune"
          label="Engine Mode"
          loading={loading}
          value={(engineConfig?.placementMethod || "weighted").replace(/-/g, " ")}
          sub={engineConfig?.grokReasoningEffort ? `${engineConfig.grokReasoningEffort} reasoning` : "Deterministic"}
        />
        <StatusCard
          isDark={isDark}
          icon="calendar_month"
          label="Scheduling Source"
          value="Graves Default Schedule"
          sub="Fri–Thu master grid — no ADP uploads"
        />
      </div>

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
            icon="calendar_month"
            label="Graves Schedule"
            onClick={() => handleNav("gravesSchedule")}
          />
          <QuickAction
            isDark={isDark}
            icon="group"
            label="Edit Team Roster"
            onClick={() => handleNav("team")}
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
            icon="receipt_long"
            label="Audit Log"
            onClick={() => handleNav("auditLog")}
          />
        </div>
      </div>

      <div className={cn("rounded-2xl border p-5 text-[12.5px]", isDark ? "border-white/10 bg-white/3" : "border-black/8 bg-black/2")}>
        <div className="flex items-center gap-2 mb-2">
          <span className="ms text-[#B89708]" style={{ fontSize: 16 }}>info</span>
          <span className="font-medium">Settings Home</span>
        </div>
        <p className={cn("leading-relaxed", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
          Your calm command post. Use the section chips above for deep tools.
          Who works each grave night is managed in Graves Schedule — legacy ADP / TM xlsx uploads are retired.
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
  loading = false,
}: {
  isDark: boolean;
  icon: string;
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-4",
      isDark
        ? "border-white/10 bg-white/4"
        : "border-black/8 bg-white"
    )}>
      <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider mb-2">
        <span className="ms" style={{ fontSize: 15, color: isDark ? "#B89708" : "#8B6910" }}>{icon}</span>
        {label}
      </div>
      {loading ? (
        <div className="space-y-1.5" aria-busy="true">
          <div className="sb-skeleton sb-skeleton--lg w-28" />
          <div className="sb-skeleton sb-skeleton--sm w-36 opacity-70" />
        </div>
      ) : (
        <>
          <div className="text-[15px] font-semibold tracking-[-0.2px] leading-tight">{value}</div>
          {sub && <div className={cn("text-[11px] mt-0.5", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>{sub}</div>}
        </>
      )}
    </div>
  );
}

function QuickAction({
  isDark,
  icon,
  label,
  onClick,
  disabled = false,
  hint,
}: {
  isDark: boolean;
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className={cn(
        "sb-list-row sb-interactive group flex items-center gap-3 rounded-2xl border px-4 py-3 text-left",
        disabled && "cursor-not-allowed opacity-45",
        isDark
          ? "border-white/10 bg-white/4 hover:bg-white/8 hover:border-white/20"
          : "border-black/10 bg-white hover:bg-[#F8F8F6] hover:border-black/15",
      )}
    >
      <span className="ms text-[#B89708] group-hover:scale-110 transition-transform" style={{ fontSize: 20 }}>{icon}</span>
      <span className={cn("text-[13px] font-medium tracking-[-0.1px]", isDark ? "text-zinc-100" : "text-[#1C1C1E]")}>
        {label}
      </span>
    </button>
  );
}