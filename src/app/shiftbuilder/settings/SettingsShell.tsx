"use client";

/**
 * OMS Settings — Velvet / ShiftBuilder-native backend surface.
 * Hidden entry: long-press the sheet footer version label on the builder.
 */

import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ChevronRight,
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
import { TasksTab } from "../sudo/TasksTab";
import { ReportsTab } from "../sudo/ReportsTab";
import { DefaultsTab } from "../sudo/DefaultsTab";
import { DashboardTab } from "../sudo/DashboardTab";
import { UsersTab } from "../sudo/UsersTab";
import { TMDefaultsTab } from "../sudo/TMDefaultsTab";
import { WeeklyRosterTab } from "../sudo/WeeklyRosterTab";
import {
  SETTINGS_SECTIONS,
  SETTINGS_TABS,
  type SettingsSection,
  type SettingsTab,
  resolveSettingsTab,
  sectionForTab,
  tabMeta,
} from "./settingsConfig";
import "./settingsTheme.css";

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
          isDark ? "text-zinc-400" : "text-[#6C6C72]",
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
  onDataChanged: () => void;
  onNavigate: (tab: SettingsTab) => void;
}) {
  return (
    <div className="sb-settings-panel" data-theme={isDark ? "dark" : "light"}>
      {activeTab === "dashboard" && (
        <DashboardTab
          onDataChanged={onDataChanged}
          isDark={isDark}
          currentOperator={currentOperator}
          currentNightId={currentNightId}
          weekStart={weekStart}
          onNavigate={onNavigate}
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
        <div className="py-16 text-center text-[13px] text-[#6C6C72]">
          Only sudo_admins can manage user privileges.
        </div>
      )}
      {activeTab === "tasks" && (
        <TasksTab onDataChanged={onDataChanged} currentNightId={currentNightId} isDark={isDark} />
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
      {activeTab === "weeklyRoster" && (
        <WeeklyRosterTab onDataChanged={onDataChanged} isDark={isDark} weekStart={weekStart} />
      )}
    </div>
  );
}

export function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
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
      setActiveTab(tab);
      setActiveSection(sectionForTab(tab));
      router.replace(`/shiftbuilder/settings?tab=${tab}`, { scroll: false });
    },
    [router],
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

  const substrate = isDark ? "#0F0F12" : "#F8F8F9";
  const paperBg = isDark ? "#16161A" : "#FFFFFF";
  const paperBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)";
  const muted = isDark ? "#8E8E93" : "#6B7280";

  return (
    <div
      className="sb-content-enter min-h-screen w-full"
      style={{
        background: substrate,
        color: isDark ? "#F2F2F4" : "#1C1C1E",
        fontFamily: "var(--font-atkinson, system-ui, -apple-system, sans-serif)",
      }}
    >
      {/* Floor grid — same language as PinGate / launchpad */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.028]"
        style={{
          backgroundImage: isDark
            ? "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)"
            : "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Quiet status bar */}
      <div
        className="relative z-10 flex h-11 items-center justify-between border-b px-6 text-[11px] tracking-[0.4px]"
        style={{
          borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
          color: muted,
          background: isDark ? "rgba(15,15,18,0.82)" : "rgba(248,248,249,0.82)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 10, letterSpacing: "1.5px", fontWeight: 600 }}>GLCR</span>
          <span style={{ width: 1, height: 12, background: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)" }} />
          <span>BACKEND CONFIGURATION</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>{formattedDate}</span>
          <span>{timeString}</span>
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-[1120px] px-6 pb-14 pt-10">
        {/* Hero — succinct */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: "2.8px",
                fontWeight: 600,
                color: muted,
                marginBottom: 8,
              }}
            >
              BEHIND THE CANVAS
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(36px, 4.5vw, 52px)",
                fontWeight: 800,
                letterSpacing: "-2px",
                lineHeight: 0.92,
                fontFamily: "var(--font-bricolage, var(--font-atkinson), system-ui)",
                color: isDark ? "#F2F2F4" : "#111",
              }}
            >
              Settings
            </h1>
            <p
              className="mt-2 max-w-md text-[14px] leading-snug"
              style={{ color: isDark ? "#A1A1AA" : "#4B5563" }}
            >
              Team, tasks, engine, and roster — the quiet machinery behind every grave deployment.
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push("/shiftbuilder")}
            className="sb-interactive inline-flex items-center gap-2 self-start rounded-2xl border px-4 py-2.5 text-[13px] font-semibold sm:self-auto"
            style={{
              borderColor: paperBorder,
              background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
              color: isDark ? "#E5E5E7" : "#1C1C1E",
              boxShadow: isDark
                ? "inset 0 1px 0 rgba(255,255,255,0.05)"
                : "0 4px 14px -8px rgba(0,0,0,0.12)",
            }}
          >
            <ArrowLeft size={15} strokeWidth={2.25} />
            Shift Builder
          </button>
        </div>

        {/* Sticky glass control cluster */}
        <div
          className="sticky top-3 z-30 mb-5 rounded-full border px-3 py-2"
          style={{
            background: isDark ? "rgba(9,9,11,0.94)" : "rgba(249,247,244,0.94)",
            backdropFilter: "blur(22px)",
            WebkitBackdropFilter: "blur(22px)",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.075)",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -10px rgba(0,0,0,0.14)",
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {SETTINGS_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => handleSectionSelect(section.id)}
                  className="sb-interactive rounded-full px-3.5 py-1.5 text-[12px] font-semibold tracking-[-0.01em] transition-colors"
                  style={{
                    background: isActive
                      ? `${section.accent}${isDark ? "22" : "18"}`
                      : "transparent",
                    color: isActive
                      ? isDark
                        ? "#F2F2F4"
                        : "#111"
                      : muted,
                    boxShadow: isActive ? `inset 0 0 0 1px ${section.accent}44` : undefined,
                  }}
                >
                  {section.label}
                </button>
              );
            })}

            <div className="mx-1 hidden h-5 w-px sm:block" style={{ background: paperBorder }} />

            <button
              type="button"
              onClick={toggleTheme}
              className="icon-btn sb-interactive ml-auto flex h-8 w-8 items-center justify-center rounded-full"
              title={isDark ? "Light mode" : "Dark mode"}
              style={{ color: muted }}
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
                className="sb-interactive flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium"
                style={{
                  borderColor: paperBorder,
                  color: muted,
                }}
              >
                <span className="max-w-[120px] truncate">{currentOperator.username}</span>
                <LogOut size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Section tab chips */}
        <div className="mb-5 flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const disabled = isTabDisabled(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && handleTabSelect(tab.id)}
                title={disabled ? "Insufficient privileges" : tab.description}
                className={cn(
                  "sb-interactive flex shrink-0 items-center gap-2 rounded-2xl border px-4 py-2.5 text-left transition-all",
                  disabled && "cursor-not-allowed opacity-45",
                )}
                style={{
                  background: isActive ? paperBg : isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.65)",
                  borderColor: isActive ? `${sectionMeta.accent}66` : paperBorder,
                  boxShadow: isActive
                    ? `0 0 0 1px ${sectionMeta.accent}22, 0 6px 18px -12px rgba(0,0,0,0.25)`
                    : undefined,
                }}
              >
                <Icon
                  size={15}
                  strokeWidth={2.1}
                  style={{ color: isActive ? sectionMeta.accent : muted }}
                />
                <span
                  className="text-[13px] font-semibold tracking-[-0.02em]"
                  style={{ color: isActive ? (isDark ? "#F2F2F4" : "#111") : muted }}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Paper artboard */}
        <motion.div
          layout
          className="overflow-hidden rounded-[20px] border"
          style={{
            background: paperBg,
            borderColor: paperBorder,
            boxShadow: isDark
              ? "0 24px 60px -28px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)"
              : "0 20px 50px -24px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.9)",
          }}
        >
          <GoldHairline isDark={isDark} />

          {/* Panel header */}
          <div
            className="flex items-center justify-between gap-4 border-b px-6 py-4"
            style={{ borderColor: paperBorder }}
          >
            <div className="min-w-0">
              <div
                className="text-[10px] font-mono uppercase tracking-[1.6px]"
                style={{ color: sectionMeta.accent }}
              >
                {sectionMeta.label}
              </div>
              <div className="mt-0.5 flex items-center gap-2">
                <h2
                  className="truncate text-[18px] font-bold tracking-[-0.4px]"
                  style={{ fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
                >
                  {activeMeta.label}
                </h2>
                <ChevronRight size={14} style={{ color: muted, flexShrink: 0 }} />
              </div>
              <p className="mt-1 text-[12px]" style={{ color: muted }}>
                {activeMeta.description}
              </p>
            </div>
            <div
              className="hidden shrink-0 rounded-full px-3 py-1 text-[10px] font-mono tracking-wider sm:block"
              style={{
                background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                color: muted,
              }}
            >
              PIN-GATED · AUDITED
            </div>
          </div>

          {/* Tab body */}
          <div className="min-h-[min(68vh,720px)] px-6 py-5 text-[13.5px] leading-snug">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              >
                <SettingsTabPanel
                  activeTab={activeTab}
                  isDark={isDark}
                  canRunEngine={canRunEngine}
                  canManageTeam={canManageTeam}
                  currentOperator={currentOperator}
                  currentNightId={currentNightId}
                  weekStart={weekStart}
                  permissions={permissions}
                  onDataChanged={onDataChanged}
                  onNavigate={handleTabSelect}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Sheet footer */}
          <div
            className="flex items-center justify-between gap-3 border-t px-6 py-2.5 text-[9pt] leading-none tracking-[0.1px]"
            style={{
              borderColor: paperBorder,
              color: muted,
              fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
            }}
          >
            <div className="min-w-0 truncate">
              <span className="font-bold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
                SBS
              </span>
              <span className="mx-1 opacity-60">©</span>
              <span>OMS Settings</span>
              <span className="mx-1 opacity-40">—</span>
              <span className="font-semibold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
                {currentOperator?.full_name ?? "operator"}
              </span>
            </div>
            <div className="shrink-0 tabular-nums">{shiftBuilderVersionLabel()}</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default SettingsShell;