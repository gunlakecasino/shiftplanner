"use client";

/**
 * SudoWindow — legacy privileged admin modal (superseded by /shiftbuilder/settings for most ops).
 */

import React from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

import { TeamTab } from "./TeamTab";
import { ReportsTab } from "./ReportsTab";
import { DefaultsTab } from "./DefaultsTab";

const EngineConfigTab = dynamic(
  () => import("./EngineConfigTab").then((m) => ({ default: m.EngineConfigTab })),
  { ssr: false }
);
const BatchPlannerTab = dynamic(
  () => import("./BatchPlannerTab").then((m) => ({ default: m.BatchPlannerTab })),
  { ssr: false }
);
import { DashboardTab } from "./DashboardTab";
import { UsersTab } from "./UsersTab";
import {
  GlassSurface,
  GoldHairline,
  SudoTabButton,
  SudoBanner,
} from "./SudoGlass";

type SudoTab = "dashboard" | "team" | "users" | "reports" | "engine" | "planner" | "defaults" | "sql" | "edge" | "logs";

const TABS: Array<{
  id: SudoTab;
  label: string;
  msIcon: string;
  status: "ready" | "coming-soon";
}> = [
  { id: "dashboard", label: "Dashboard",      msIcon: "dashboard",     status: "ready" },
  { id: "team",      label: "Team",          msIcon: "group",         status: "ready" },
  { id: "users",     label: "Users",         msIcon: "manage_accounts", status: "ready" },
  { id: "reports",   label: "Reports",       msIcon: "bar_chart",     status: "ready" },
  { id: "engine",    label: "Engine Config", msIcon: "tune",          status: "ready" },
  { id: "planner",   label: "Batch Planner", msIcon: "bolt",          status: "ready" },
  { id: "defaults",  label: "Card Defaults", msIcon: "layers",        status: "ready" },
  { id: "sql",       label: "SQL Runner",    msIcon: "database",      status: "coming-soon" },
  { id: "edge",      label: "Edge Functions",msIcon: "code",          status: "coming-soon" },
  { id: "logs",      label: "Logs",          msIcon: "receipt_long",  status: "coming-soon" },
];

export interface SudoWindowProps {
  open: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
  currentNightId?: string | null;
  weekStart?: Date | null;
  currentOperator?: { id: string; full_name: string; username: string; role: string } | null;
  onSignOut?: () => void;
  isDark?: boolean;
  permissions?: import("@/lib/auth/opsAuth").ShiftBuilderPermissions;
}

export function SudoWindow({
  open,
  onClose,
  onDataChanged,
  currentNightId,
  weekStart,
  currentOperator,
  onSignOut,
  isDark = false,
  permissions,
}: SudoWindowProps) {
  const [activeTab, setActiveTab] = React.useState<SudoTab>("dashboard");

  const canRunEngine = permissions?.canRunEngine ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const visibleTabs = TABS.filter((t) => {
    if (t.id === "users" && currentOperator?.role !== "sudo_admin") return false;
    return true;
  });

  const isTabDisabled = (tab: SudoTab) => {
    if (tab === "planner" || tab === "engine") return !canRunEngine;
    if (tab === "team") return !canManageTeam;
    return false;
  };

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <GlassSurface
        className={cn(
          "relative z-10 w-full max-w-[1100px] max-h-[90vh] flex flex-col overflow-hidden rounded-3xl shadow-2xl",
          isDark ? "text-[#F2F2F4]" : "text-[#1C1C1E]"
        )}
      >
        <GoldHairline isDark={isDark} />
        <div className="flex flex-1 min-h-0">
          <nav className="w-[200px] shrink-0 border-r border-black/10 dark:border-white/10 p-3 space-y-1 overflow-y-auto">
            {visibleTabs.map((tab) => {
              const disabled = isTabDisabled(tab.id) || tab.status === "coming-soon";
              return (
                <SudoTabButton
                  key={tab.id}
                  active={activeTab === tab.id}
                  comingSoon={disabled}
                  onClick={() => {
                    if (!disabled) setActiveTab(tab.id);
                  }}
                  icon={tab.msIcon}
                  label={tab.label}
                  isDark={isDark}
                />
              );
            })}
          </nav>
          <div className="flex-1 min-w-0 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-hidden">
              {activeTab === "dashboard" && (
                <DashboardTab
                  onDataChanged={onDataChanged}
                  isDark={isDark}
                  currentOperator={currentOperator}
                  currentNightId={currentNightId}
                  weekStart={weekStart}
                  onNavigate={(tab) => setActiveTab(tab as SudoTab)}
                  permissions={permissions}
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
              {activeTab === "reports" && <ReportsTab isDark={isDark} />}
              {activeTab === "engine" &&
                (canRunEngine ? (
                  <EngineConfigTab onDataChanged={onDataChanged} isDark={isDark} />
                ) : (
                  <InsufficientPermNotice feature="Engine Config" isDark={isDark} />
                ))}
              {activeTab === "planner" &&
                (canRunEngine ? (
                  <BatchPlannerTab onDataChanged={onDataChanged} isDark={isDark} />
                ) : (
                  <InsufficientPermNotice feature="Batch Planner" isDark={isDark} />
                ))}
              {activeTab === "defaults" && (
                <DefaultsTab
                  onDataChanged={onDataChanged}
                  currentNightId={currentNightId}
                  weekStart={weekStart}
                  isDark={isDark}
                />
              )}
              {activeTab === "sql" && <ComingSoonPanel feature="SQL Runner" isDark={isDark} />}
              {activeTab === "edge" && <ComingSoonPanel feature="Edge Functions" isDark={isDark} />}
              {activeTab === "logs" && <ComingSoonPanel feature="Logs" isDark={isDark} />}
            </div>
          </div>
        </div>
        <div className="border-t border-black/10 dark:border-white/10 bg-black/4 dark:bg-white/4 px-6 py-2 text-[10px] text-[#6C6C72] dark:text-zinc-500 font-mono flex items-center justify-between">
          <span>
            SUDO · {currentOperator ? currentOperator.full_name : "operator"} · all writes audited
          </span>
          {canAccessSudo && currentOperator && onSignOut && (
            <button type="button" onClick={onSignOut} className="hover:underline">
              Sign out
            </button>
          )}
        </div>
      </GlassSurface>
    </div>,
    document.body
  );
}

function InsufficientPermNotice({ feature, isDark = false }: { feature: string; isDark?: boolean }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-8 text-center">
      <SudoBanner kind="warn" isDark={isDark}>PRIVILEGE REQUIRED</SudoBanner>
      <div className="mt-4 text-xl font-semibold">{feature}</div>
      <p className={cn("mt-2 max-w-sm text-[13px]", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
        Your role does not include this tool.
      </p>
    </div>
  );
}

function ComingSoonPanel({ feature, isDark = false }: { feature: string; isDark?: boolean }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-8 text-center">
      <div className={cn("text-[13px] font-medium", isDark ? "text-zinc-300" : "text-[#1C1C1E]")}>{feature}</div>
      <p className={cn("mt-2 text-[12px]", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>Coming soon.</p>
    </div>
  );
}