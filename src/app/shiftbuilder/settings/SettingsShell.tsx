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
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { useConfirm } from "../components/ConfirmDialog";
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
import { GoldHairline, SudoTabLoading } from "../sudo/SudoGlass";
import { AuditLogTab } from "../sudo/AuditLogTab";
import { logSettingsAudit } from "@/lib/shiftbuilder/opsAuditLog";
import { DefaultsTab } from "../sudo/DefaultsTab";
import { UsersTab } from "../sudo/UsersTab";
import {
  SETTINGS_SECTIONS,
  SETTINGS_TABS,
  TEAM_REDIRECT_TABS,
  type SettingsSection,
  type SettingsTab,
  resolveSettingsTab,
  sectionForTab,
  tabMeta,
  TALL_SETTINGS_TABS,
} from "./settingsConfig";
import "./settingsTheme.css";
import "./settingsShell.css";

// `dynamic()` with no `loading` renders nothing at all while the chunk is
// being fetched/compiled — a real, silent multi-second blank gap in dev
// (Turbopack compiles the route on first visit) that has nothing to do with
// either tab's own internal data-loading state, since the component hasn't
// even mounted yet. Give both a fallback so the tab never looks broken.
function SettingsDynamicTabFallback({ label }: { label: string }) {
  return (
    <div className="h-full flex items-center justify-center py-16">
      <SudoTabLoading>{label}</SudoTabLoading>
    </div>
  );
}

const EngineConfigTab = dynamic(
  () => import("../sudo/EngineConfigTab").then((m) => ({ default: m.EngineConfigTab })),
  { ssr: false, loading: () => <SettingsDynamicTabFallback label="Loading engine config" /> },
);
const BatchPlannerTab = dynamic(
  () => import("../sudo/BatchPlannerTab").then((m) => ({ default: m.BatchPlannerTab })),
  { ssr: false, loading: () => <SettingsDynamicTabFallback label="Loading batch planner" /> },
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
  currentOperator,
  currentNightId,
  weekStart,
  onDataChanged,
}: {
  activeTab: SettingsTab;
  isDark: boolean;
  canRunEngine: boolean;
  currentOperator: ReturnType<typeof useOpsAuth>["user"];
  currentNightId: string | null;
  weekStart: Date;
  onDataChanged: (tab: SettingsTab, details?: Record<string, unknown>) => void;
}) {
  return (
    <div className="sb-settings-panel" data-theme={isDark ? "dark" : "light"}>
      {activeTab === "defaults" && (
        <DefaultsTab
          onDataChanged={() => onDataChanged("defaults", { area: "defaults_push" })}
          currentNightId={currentNightId}
          weekStart={weekStart}
          isDark={isDark}
        />
      )}
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
      {activeTab === "auditLog" && <AuditLogTab isDark={isDark} />}
    </div>
  );
}

export function SettingsShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();
  const confirmDialog = useConfirm();

  const canRunEngine = permissions?.canRunEngine ?? false;

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

  // People + schedule tools moved to /team — bounce any legacy deep link there.
  React.useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw && raw in TEAM_REDIRECT_TABS) {
      router.replace(`/shiftbuilder/team?tab=${TEAM_REDIRECT_TABS[raw]}`);
    }
  }, [searchParams, router]);

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
      return false;
    },
    [canRunEngine],
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
              Card defaults, engine, and access — the quiet machinery behind every grave deployment.
              People &amp; schedule live on the Team page.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/shiftbuilder/team")}
              className="sb-settings-back-btn sb-interactive"
            >
              <Users size={15} strokeWidth={2.25} />
              Team
            </button>
            <button
              type="button"
              onClick={() => router.push("/shiftbuilder")}
              className="sb-settings-back-btn sb-interactive"
            >
              <ArrowLeft size={15} strokeWidth={2.25} />
              Shift Builder
            </button>
          </div>
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
                onClick={async () => {
                  if (await confirmDialog(`Sign out ${currentOperator.full_name}?`, { confirmLabel: "Sign out" })) {
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
            {/* No `mode="wait"` — it defers mounting the new tab's content until
                the previous tab's exit animation fully resolves, and if that
                exit is ever delayed (slow tab content, main-thread contention),
                the new tab's pill/URL update instantly while its content stays
                stuck showing the old tab indefinitely. Default (concurrent)
                mode lets the new tab mount immediately alongside the old one
                fading out, so content can never lag behind the active-tab
                state it's supposed to reflect. */}
            <AnimatePresence>
              <motion.div key={activeTab} className="sb-settings-tab-motion" {...tabMotion}>
                <SettingsTabPanel
                  activeTab={activeTab}
                  isDark={isDark}
                  canRunEngine={canRunEngine}
                  currentOperator={currentOperator}
                  currentNightId={currentNightId}
                  weekStart={weekStart}
                  onDataChanged={auditedDataChanged}
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