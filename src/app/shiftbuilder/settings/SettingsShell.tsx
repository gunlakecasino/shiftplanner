"use client";

/**
 * OMS Settings — Velvet / ShiftBuilder-native backend surface.
 * Hidden entry: long-press the sheet footer version label on the builder.
 */

import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
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
  MONTH_LONG,
} from "@/lib/shiftbuilder/dateUtils";
import { shiftBuilderVersionLabel } from "../version";
import { GoldHairline } from "../sudo/SudoGlass";
import { TeamTab } from "../sudo/TeamTab";
import { ReportsTab } from "../sudo/ReportsTab";
import { AuditLogTab } from "../sudo/AuditLogTab";
import { logSettingsAudit } from "@/lib/shiftbuilder/opsAuditLog";
import { DefaultsTab } from "../sudo/DefaultsTab";
import { DashboardTab } from "../sudo/DashboardTab";
import { UsersTab } from "../sudo/UsersTab";
import { WeeklyRosterTab } from "../sudo/WeeklyRosterTab";
import {
  SETTINGS_SECTIONS,
  SETTINGS_TABS,
  type SettingsSection,
  type SettingsTab,
  resolveSettingsTab,
  sectionForTab,
  tabMeta,
  TALL_SETTINGS_TABS,
} from "./settingsConfig";
import "./settingsTheme.css";
import "./settingsShell.css";

const EngineConfigTab = dynamic(
  () => import("../sudo/EngineConfigTab").then((m) => ({ default: m.EngineConfigTab })),
  { ssr: false },
);
const BatchPlannerTab = dynamic(
  () => import("../sudo/BatchPlannerTab").then((m) => ({ default: m.BatchPlannerTab })),
  { ssr: false },
);

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

function InsufficientPermNotice({
  feature,
  isDark = false,
}: {
  feature: string;
  isDark?: boolean;
}) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center px-8 text-center">
      <div
        className={cn(
          "mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-mono tracking-[1px]",
          isDark
            ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
            : "border-amber-500/40 bg-amber-50 text-amber-800",
        )}
      >
        PRIVILEGE REQUIRED
      </div>
      <div className="mb-2 text-xl font-semibold tracking-[-0.3px]">{feature}</div>
      <p
        className={cn(
          "max-w-sm text-[13px] leading-relaxed",
          isDark ? "text-zinc-400" : "text-[var(--ios-label-tertiary)]",
        )}
      >
        Your role does not include this tool. Contact a sudo_admin if you need access.
      </p>
    </div>
  );
}

function SettingsTabPanel({
  activeTab,
  isDark,
  canRunEngine,
  canManageTeam,
  currentOperator,
  currentNightId,
  weekStart,
  permissions,
  onDataChanged,
  onNavigate,
}: {
  activeTab: SettingsTab;
  isDark: boolean;
  canRunEngine: boolean;
  canManageTeam: boolean;
  currentOperator: ReturnType<typeof useOpsAuth>["user"];
  currentNightId: string | null;
  weekStart: Date;
  permissions: ReturnType<typeof useOpsAuth>["permissions"];
  onDataChanged: (tab: SettingsTab, details?: Record<string, unknown>) => void;
  onNavigate: (tab: SettingsTab) => void;
}) {
  return (
    <div className="sb-settings-panel" data-theme={isDark ? "dark" : "light"}>
      {activeTab === "dashboard" && (
        <DashboardTab
          onDataChanged={() => onDataChanged("dashboard")}
          isDark={isDark}
          currentOperator={currentOperator}
          currentNightId={currentNightId}
          weekStart={weekStart}
          onNavigate={onNavigate}
          permissions={permissions}
        />
      )}
      {activeTab === "team" &&
        (canManageTeam ? (
          <TeamTab
            onDataChanged={() => onDataChanged("team", { area: "team_update" })}
            isDark={isDark}
          />
        ) : (
          <InsufficientPermNotice feature="Team Management" isDark={isDark} />
        ))}
      {activeTab === "users" && currentOperator?.role === "sudo_admin" && (
        <UsersTab
          onDataChanged={() => onDataChanged("users", { area: "user_update" })}
          isDark={isDark}
        />
      )}
      {activeTab === "users" && currentOperator?.role !== "sudo_admin" && (
        <div className="py-16 text-center text-[13px] text-[var(--ios-label-tertiary)]">
          Only sudo_admins can manage user privileges.
        </div>
      )}
      {activeTab === "reports" && <ReportsTab isDark={isDark} />}
      {activeTab === "auditLog" && <AuditLogTab isDark={isDark} />}
      {activeTab === "engine" &&
        (canRunEngine ? (
          <EngineConfigTab
            onDataChanged={() => onDataChanged("engine", { area: "engine_config" })}
            isDark={isDark}
          />
        ) : (
          <InsufficientPermNotice feature="Engine Config" isDark={isDark} />
        ))}
      {activeTab === "planner" &&
        (canRunEngine ? (
          <BatchPlannerTab
            onDataChanged={() => onDataChanged("planner", { area: "engine_run" })}
            isDark={isDark}
          />
        ) : (
          <InsufficientPermNotice feature="Batch Planner" isDark={isDark} />
        ))}
      {activeTab === "defaults" && (
        <DefaultsTab
          onDataChanged={() => onDataChanged("defaults", { area: "defaults_push" })}
          currentNightId={currentNightId}
          weekStart={weekStart}
          isDark={isDark}
        />
      )}
      {activeTab === "weeklyRoster" && (
        <WeeklyRosterTab
          onDataChanged={() => onDataChanged("weeklyRoster", { area: "roster_update" })}
          isDark={isDark}
          weekStart={weekStart}
        />
      )}
    </div>
  );
}

export function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();

  const canRunEngine = permissions?.canRunEngine ?? false;
  const canManageTeam = permissions?.canManageTeam ?? false;

  const [activeTab, setActiveTab] = React.useState<SettingsTab>(() =>
    resolveSettingsTab(searchParams.get("tab")),
  );
  const [activeSection, setActiveSection] = React.useState<SettingsSection>(() =>
    sectionForTab(resolveSettingsTab(searchParams.get("tab"))),
  );
  const [dataEpoch, setDataEpoch] = React.useState(0);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Keep tab state in sync with ?tab= (back/forward, deep links)
  React.useEffect(() => {
    const tab = resolveSettingsTab(searchParams.get("tab"));
    setActiveTab(tab);
    setActiveSection(sectionForTab(tab));
  }, [searchParams]);

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

  const visibleTabs = React.useMemo(
    () =>
      SETTINGS_TABS.filter(
        (t) => t.id !== "users" || currentOperator?.role === "sudo_admin",
      ),
    [currentOperator?.role],
  );

  const sectionTabs = React.useMemo(
    () => visibleTabs.filter((t) => t.section === activeSection),
    [visibleTabs, activeSection],
  );

  const activeMeta = tabMeta(activeTab);
  const sectionMeta = SETTINGS_SECTIONS.find((s) => s.id === activeSection)!;

  const handleTabSelect = React.useCallback(
    (tab: SettingsTab) => {
      if (tab !== activeTab) {
        logSettingsAudit({
          tab,
          action: "settings_nav",
          operator: currentOperator,
          nightId: currentNightId,
          details: { from: activeTab, to: tab },
        });
      }
      setActiveTab(tab);
      setActiveSection(sectionForTab(tab));
      router.replace(`/shiftbuilder/settings?tab=${tab}`, { scroll: false });
    },
    [router, activeTab, currentOperator, currentNightId],
  );

  const auditedDataChanged = React.useCallback(
    (tab: SettingsTab, details?: Record<string, unknown>) => {
      logSettingsAudit({
        tab,
        action: "settings_update",
        operator: currentOperator,
        nightId: currentNightId,
        details,
      });
      onDataChanged();
    },
    [currentOperator, currentNightId, onDataChanged],
  );

  const handleSectionSelect = React.useCallback(
    (section: SettingsSection) => {
      setActiveSection(section);
      const first = visibleTabs.find((t) => t.section === section);
      if (first) handleTabSelect(first.id);
    },
    [visibleTabs, handleTabSelect],
  );

  const isTabDisabled = React.useCallback(
    (tab: SettingsTab) => {
      if (tab === "planner" || tab === "engine") return !canRunEngine;
      if (tab === "team") return !canManageTeam;
      return false;
    },
    [canRunEngine, canManageTeam],
  );

  const formattedDate = `${MONTH_LONG[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const tabMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -4 },
        transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] as const },
      };

  return (
    <div className="sb-settings-shell sb-content-enter">
      <div className="sb-settings-grid" aria-hidden />

      <header className="sb-settings-status">
        <div className="flex items-center gap-3">
          <span className="sb-settings-status-brand">GLCR</span>
          <span className="sb-settings-status-divider" aria-hidden />
          <span>BEHIND THE CANVAS</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>{formattedDate}</span>
          <span>{timeString}</span>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-6 pb-14 pt-10">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="sb-settings-eyebrow">OMS BACKEND</p>
            <h1 className="sb-settings-hero-title">Settings</h1>
            <p className="sb-settings-hero-sub">
              Team, tasks, engine, and roster — the quiet machinery behind every grave deployment.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/shiftbuilder")}
            className="sb-settings-back-btn sb-interactive"
          >
            <ArrowLeft size={15} strokeWidth={2.25} />
            Shift Builder
          </button>
        </div>

        <nav className="sb-settings-glass-pill" aria-label="Settings sections">
          <div className="flex flex-wrap items-center gap-2">
            {SETTINGS_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  data-active={isActive ? "true" : "false"}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => handleSectionSelect(section.id)}
                  className="sb-settings-section-btn sb-interactive"
                  style={{
                    background: isActive
                      ? `${section.accent}${isDark ? "22" : "18"}`
                      : "transparent",
                    boxShadow: isActive ? `inset 0 0 0 1px ${section.accent}44` : undefined,
                  }}
                >
                  {section.label}
                </button>
              );
            })}

            <div className="sb-settings-glass-divider" aria-hidden />

            <button
              type="button"
              onClick={toggleTheme}
              className="sb-settings-theme-btn icon-btn sb-interactive"
              title={isDark ? "Light mode" : "Dark mode"}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            {currentOperator && (
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Sign out ${currentOperator.full_name}?`)) {
                    logoutOperator();
                    router.push("/shiftbuilder");
                  }
                }}
                className="sb-settings-user-btn sb-interactive"
              >
                <span className="max-w-[120px] truncate">{currentOperator.username}</span>
                <LogOut size={13} />
              </button>
            )}
          </div>
        </nav>

        <div
          className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label={`${sectionMeta.label} tools`}
        >
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const disabled = isTabDisabled(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-disabled={disabled || undefined}
                data-active={isActive ? "true" : "false"}
                disabled={disabled}
                onClick={() => !disabled && handleTabSelect(tab.id)}
                title={disabled ? "Insufficient privileges" : tab.description}
                className="sb-settings-tab-chip sb-interactive"
                style={{
                  borderColor: isActive ? `${sectionMeta.accent}66` : undefined,
                  boxShadow: isActive
                    ? `0 0 0 1px ${sectionMeta.accent}22, 0 6px 18px -12px rgba(0,0,0,0.25)`
                    : undefined,
                }}
              >
                <Icon
                  size={15}
                  strokeWidth={2.1}
                  style={{ color: isActive ? sectionMeta.accent : "var(--ios-label-tertiary)" }}
                />
                <span className="sb-settings-tab-chip-label" data-active={isActive ? "true" : "false"}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        <motion.div layout className="sb-settings-paper">
          <GoldHairline isDark={isDark} />

          <header className="sb-settings-panel-header">
            <h2 className="sb-settings-panel-title">{activeMeta.label}</h2>
          </header>

          <div
            className="sb-settings-body"
            data-tall={TALL_SETTINGS_TABS.has(activeTab) ? "true" : undefined}
            role="tabpanel"
          >
            <AnimatePresence mode="wait">
              <motion.div key={activeTab} className="sb-settings-tab-motion" {...tabMotion}>
                <SettingsTabPanel
                  activeTab={activeTab}
                  isDark={isDark}
                  canRunEngine={canRunEngine}
                  canManageTeam={canManageTeam}
                  currentOperator={currentOperator}
                  currentNightId={currentNightId}
                  weekStart={weekStart}
                  permissions={permissions}
                  onDataChanged={auditedDataChanged}
                  onNavigate={handleTabSelect}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="sb-settings-footer">
            <div className="min-w-0 truncate">
              <strong>SBS</strong>
              <span className="mx-1 opacity-60">©</span>
              <span>OMS Settings</span>
              <span className="mx-1 opacity-40">·</span>
              <strong>{currentOperator?.full_name ?? "operator"}</strong>
              <span className="mx-1.5 hidden opacity-50 sm:inline">PIN-GATED</span>
            </div>
            <div className="shrink-0 tabular-nums">{shiftBuilderVersionLabel()}</div>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}

export default SettingsShell;