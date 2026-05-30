"use client";

/**
 * SudoWindow — the privileged admin surface (elegant centered glass modal edition).
 *
 * Trigger: typing `sudo` in the Command Palette or the "Open Sudo" item in the profile dropdown.
 * Layout: Beautiful centered glass modal (not a slide-in). Contains a refined vertical tab rail
 *          on the left + content pane. Inner surfaces (Team edit drawer etc.) are also centered
 *          premium glass modals.
 *
 * Aesthetic: Follows the app isDark setting using the official Velvet glass system.
 *            Only privilege cue = subtle brushed-gold hairline at the very top.
 *            Extremely calm, high-contrast, and elegant on both light and dark.
 *
 * All writes are audited. Operator identity + sign-out live in the header.
 */

import React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { SchedulesTab } from "./SchedulesTab";
import { TeamTab } from "./TeamTab";
import { EngineConfigTab } from "./EngineConfigTab";
import { TasksTab } from "./TasksTab";
import { ReportsTab } from "./ReportsTab";
import { BatchPlannerTab } from "./BatchPlannerTab";
import { DefaultsTab } from "./DefaultsTab";
import { DashboardTab } from "./DashboardTab";
import { UsersTab } from "./UsersTab";
import {
  GlassSurface,
  GoldHairline,
  SudoTabButton,
  SudoBanner,
} from "./SudoGlass";

type SudoTab = "dashboard" | "schedules" | "team" | "users" | "tasks" | "reports" | "engine" | "planner" | "defaults" | "sql" | "edge" | "logs";

const TABS: Array<{
  id: SudoTab;
  label: string;
  msIcon: string;
  status: "ready" | "coming-soon";
}> = [
  { id: "dashboard", label: "Dashboard",      msIcon: "dashboard",     status: "ready" },
  { id: "schedules", label: "Schedules",     msIcon: "table_chart",   status: "ready" },
  { id: "team",      label: "Team",          msIcon: "group",         status: "ready" },
  { id: "users",     label: "Users",         msIcon: "manage_accounts", status: "ready" },
  { id: "tasks",     label: "Tasks",         msIcon: "checklist",     status: "ready" },
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
  /** Fired whenever a sudo action mutates per-night data the main view
   *  cares about (schedule Apply / Unapply / Delete). Parent should
   *  bump its load epoch to refresh roster + night_tm_status state. */
  onDataChanged?: () => void;
  currentNightId?: string | null;   // passed down so TasksTab / DefaultsTab can offer push-today
  /** Friday that starts the current GRAVE week — used by DefaultsTab push-to-week. */
  weekStart?: Date | null;
  /** The authenticated operator who opened Sudo (from PIN gate). */
  currentOperator?: { id: string; full_name: string; username: string; role: string } | null;
  /** Called when the operator explicitly signs out from inside Sudo. */
  onSignOut?: () => void;
  /** Follows the app theme so Sudo can render the correct light or dark glass variant. */
  isDark?: boolean;
  /** Granular permissions from the new system */
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

  // Permission-aware tab availability (prevents navigation to surfaces the operator cannot use)
  const canRunEngine = permissions?.canRunEngine ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;
  const canPublish = permissions?.canPublish ?? false;
  const canAccessSudo = permissions?.canAccessSudo ?? false;

  // Close on Escape (matches FloatingNav profile + previous behavior).
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

  const content = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 sm:p-6" aria-modal="true" role="dialog">
      {/* Elegant soft backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-2xl"
        onClick={onClose}
      />

      {/* Elegant centered glass modal — not a slide-in */}
      <GlassSurface
        isDark={isDark}
        elevated
        className="relative w-full max-w-[min(1480px,96vw)] max-h-[94vh] flex flex-col overflow-hidden rounded-3xl shadow-2xl"
      >
        {/* Subtle texture */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            opacity: isDark ? 0.022 : 0.035,
            backgroundImage:
              "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        {/* Brushed gold hairline — the only privilege signal */}
        <GoldHairline isDark={isDark} />

        {/* Top header bar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-black/10 dark:border-white/10 bg-black/4 dark:bg-white/4">
          <div className="flex items-center gap-3">
            <span className="ms text-[#B89708]" style={{ fontSize: 20 }}>shield</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono font-semibold text-[15px] tracking-[1.8px] text-[#111] dark:text-zinc-100">
                SUDO
              </span>
              <span className="text-[#6C6C72] dark:text-zinc-500 text-[11px]">·</span>
              <span className="font-mono text-[12px] text-[#3C3C43] dark:text-zinc-400">
                {currentOperator ? currentOperator.username : "operator"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-[#6C6C72] dark:text-zinc-500 font-mono tracking-wider hidden sm:inline">esc to close</span>

            {currentOperator && onSignOut && (
              <button
                onClick={() => {
                  if (confirm(`Sign out ${currentOperator.full_name}?`)) {
                    onSignOut();
                    onClose();
                  }
                }}
                className="px-3 py-1 rounded-full text-[10px] font-mono tracking-wider border border-black/10 dark:border-white/10 text-[#3C3C43] dark:text-zinc-400 hover:text-[#111] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors active:scale-[0.985]"
              >
                SIGN OUT
              </button>
            )}

            <button
              onClick={onClose}
              className="text-[#6C6C72] dark:text-zinc-400 hover:text-[#111] dark:hover:text-zinc-100 rounded-full p-2 transition-colors -mr-1"
              aria-label="Close sudo"
            >
              <span className="ms" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>
        </div>

        {/* Main area: vertical tab rail + content */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Vertical tab rail — elegant + highly legible */}
          <nav className={cn(
            "w-[212px] shrink-0 border-r py-4 px-3 space-y-1",
            isDark 
              ? "border-white/10 bg-[#0A0A0B]" 
              : "border-black/10 bg-[#F2F2F0]"
          )}>
            {TABS.filter(t => t.id !== "users" || currentOperator?.role === "sudo_admin").map((t) => {
              const isActive = activeTab === t.id;
              const isComingSoon = t.status === "coming-soon";

              // Dynamic permission gating for high-impact tabs
              let insufficientPerm = false;
              if (t.id === "planner" || t.id === "engine") insufficientPerm = !canRunEngine;
              if (t.id === "team") insufficientPerm = !canManageTeam;
              // users already filtered above (sudo_admin only)
              // schedules publish actions are gated inside the tab via props

              const isDisabled = isComingSoon || insufficientPerm;
              return (
                <button
                  key={t.id}
                  onClick={() => !isDisabled && setActiveTab(t.id)}
                  disabled={isDisabled}
                  title={insufficientPerm ? "Insufficient privileges for this tool" : undefined}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-2xl text-[13px] font-medium tracking-[0.2px] transition-all text-left",
                    isActive
                      ? isDark
                        ? "bg-[#B89708]/18 text-[#F5D78A] shadow-sm font-semibold"
                        : "bg-[#B89708]/14 text-[#6B4E00] shadow-sm font-semibold"
                      : isComingSoon || insufficientPerm
                      ? isDark
                        ? "text-zinc-600 cursor-not-allowed opacity-60"
                        : "text-[#9CA3AF] cursor-not-allowed opacity-60"
                      : isDark
                      ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      : "text-[#2C2C2E] hover:bg-black/5 hover:text-[#111111] font-medium"
                  )}
                >
                  <span className="ms" style={{ fontSize: 17, opacity: isActive ? 1 : 0.7 }}>{t.msIcon}</span>
                  <span className="flex-1 truncate">{t.label}</span>
                  {isComingSoon && <span className="text-[9px] opacity-50">soon</span>}
                </button>
              );
            })}
          </nav>

          {/* Content pane — strong contrast, elevated paper surface */}
          <div 
            className={cn(
              "flex-1 min-h-0 overflow-auto p-6 text-[13.5px] leading-snug",
              isDark 
                ? "bg-[#111113] text-[#F2F2F4]" 
                : "bg-[#F8F8F6] text-[#1C1C1E]"
            )}
            style={{ 
              color: isDark ? '#F2F2F4' : '#1C1C1E'
            }}
          >
            {/* Strong legibility wrapper — overrides many legacy dark zinc classes from the tabs */}
            <div className={cn(
              isDark 
                ? "[&_.bg-zinc-950]:bg-[#1C1C1E] [&_.bg-zinc-900]:bg-[#171719] [&_.text-zinc-100]:text-[#F2F2F4] [&_.text-zinc-400]:text-[#A1A1AA] [&_.border-zinc-800]:border-[#3A3A3C]"
                : "[&_.bg-zinc-950]:bg-white [&_.bg-zinc-900]:bg-[#F2F2F0] [&_.text-zinc-100]:text-[#1C1C1E] [&_.text-zinc-400]:text-[#6C6C72] [&_.border-zinc-800]:border-[#E5E5E7] [&_.text-zinc-200]:text-[#2C2C2E]"
            )}>
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
            {activeTab === "schedules" && (
              <SchedulesTab 
                onDataChanged={onDataChanged} 
                isDark={isDark} 
                canSeeDraftData={permissions?.canSeeDraftData ?? false}
                canPublish={permissions?.canPublish ?? false}
                canApplySchedules={permissions?.canApplySchedules ?? false}
              />
            )}
            {activeTab === "team"      && <TeamTab onDataChanged={onDataChanged} isDark={isDark} />}
            {activeTab === "users"     && currentOperator?.role === "sudo_admin" && <UsersTab onDataChanged={onDataChanged} isDark={isDark} />}
            {activeTab === "users"     && currentOperator?.role !== "sudo_admin" && (
              <div className="p-8 text-center text-[#6C6C72]">Only sudo_admins can manage user privileges.</div>
            )}
            {activeTab === "tasks"     && <TasksTab onDataChanged={onDataChanged} currentNightId={currentNightId} />}
            {activeTab === "reports"   && <ReportsTab />}
            {activeTab === "engine"    && (canRunEngine ? <EngineConfigTab onDataChanged={onDataChanged} /> : <InsufficientPermNotice feature="Engine Config" isDark={isDark} />)}
            {activeTab === "planner"   && (canRunEngine ? <BatchPlannerTab onDataChanged={onDataChanged} /> : <InsufficientPermNotice feature="Batch Planner" isDark={isDark} />)}
            {activeTab === "team"      && (canManageTeam ? <TeamTab onDataChanged={onDataChanged} isDark={isDark} /> : <InsufficientPermNotice feature="Team Management" isDark={isDark} />)}
            {activeTab === "defaults"  && <DefaultsTab onDataChanged={onDataChanged} currentNightId={currentNightId} weekStart={weekStart} />}
            {activeTab === "sql"       && <ComingSoonPanel feature="SQL Runner" isDark={isDark} />}
            {activeTab === "edge"      && <ComingSoonPanel feature="Edge Functions" isDark={isDark} />}
            {activeTab === "logs"      && <ComingSoonPanel feature="Logs" isDark={isDark} />}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-black/10 dark:border-white/10 bg-black/4 dark:bg-white/4 px-6 py-2 text-[10px] text-[#6C6C72] dark:text-zinc-500 font-mono flex items-center justify-between">
          <span>
            SUDO · {currentOperator ? currentOperator.full_name : "operator"} · all writes audited
          </span>
          <span>v1 · pin-gated</span>
        </div>
      </GlassSurface>
    </div>
  );

  return createPortal(content, document.body);
}

function ComingSoonPanel({ feature, isDark = false }: { feature: string; isDark?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono tracking-[1px] mb-4 border",
        isDark ? "bg-white/5 border-white/10 text-zinc-400" : "bg-black/5 border-black/10 text-[#6C6C72]"
      )}>
        COMING SOON
      </div>
      <div className="text-xl font-semibold tracking-[-0.3px] mb-2">{feature}</div>
      <div className={cn("max-w-sm text-[13px] leading-snug", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
        This surface is scheduled for a later pass. The current priority is the tabs that directly affect the live deployment sheet, breaks, and engine behavior.
      </div>
    </div>
  );
}

function InsufficientPermNotice({ feature, isDark = false }: { feature: string; isDark?: boolean }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <div className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-mono tracking-[1px] mb-4 border border-amber-500/40",
        isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700"
      )}>
        PRIVILEGE REQUIRED
      </div>
      <div className="text-xl font-semibold tracking-[-0.3px] mb-2">{feature}</div>
      <div className={cn("max-w-sm text-[13px] leading-snug", isDark ? "text-zinc-400" : "text-[#5A5A5F]")}>
        Your current role or overrides do not grant access to this tool. Contact a sudo_admin to request the necessary privilege.
      </div>
    </div>
  );
}
