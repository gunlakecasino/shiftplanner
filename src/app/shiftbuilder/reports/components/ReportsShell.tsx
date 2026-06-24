"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, LogOut, Moon, Sun, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { useTheme } from "../../hooks/useTheme";
import { shiftBuilderVersionLabel } from "../../version";
import { GoldHairline } from "../../sudo/SudoGlass";
import { ReportsDashboard } from "./ReportsDashboard";
import "../../settings/settingsShell.css";
import "../../settings/settingsTheme.css";
import "../reportsShell.css";

export function ReportsShell() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const { user: currentOperator, logout: logoutOperator } = useOpsAuth();
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const formattedDate = `${now.toLocaleString("en-US", { month: "long" })} ${now.getDate()}, ${now.getFullYear()}`;
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const tabMotion = reduceMotion
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -6 },
        transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const },
      };

  return (
    <div className="sb-settings-shell sb-reports-shell sb-content-enter">
      <div className="sb-settings-grid" aria-hidden />

      <header className="sb-settings-status">
        <div className="flex items-center gap-3">
          <span className="sb-settings-status-brand">GLCR</span>
          <span className="sb-settings-status-divider" aria-hidden />
          <span>PLACEMENT ANALYTICS</span>
        </div>
        <div className="flex items-center gap-4 tabular-nums">
          <span>{formattedDate}</span>
          <span>{timeString}</span>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6 pb-14 pt-10">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="sb-settings-eyebrow">OMS INSIGHTS</p>
            <h1 className="sb-settings-hero-title">Reports</h1>
            <p className="sb-settings-hero-sub">
              Zone frequency, rotation fairness, and placement history — distilled into actionable charts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/shiftbuilder/settings?tab=reports")}
              className="sb-settings-back-btn sb-interactive"
            >
              <Settings2 size={15} strokeWidth={2.1} />
              Settings
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

        <nav className="sb-settings-glass-pill mb-5" aria-label="Reports chrome">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{
                background: "color-mix(in srgb, #4D1A8A 14%, transparent)",
                color: "#4D1A8A",
                boxShadow: "inset 0 0 0 1px color-mix(in srgb, #4D1A8A 28%, transparent)",
              }}
            >
              Placement Analytics
            </span>

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

        <motion.div layout className="sb-settings-paper">
          <GoldHairline isDark={isDark} />

          <header className="sb-settings-panel-header">
            <h2 className="sb-settings-panel-title">Rotation & Placement Dashboard</h2>
          </header>

          <div className="sb-settings-body p-0" data-tall="true" role="main">
            <AnimatePresence mode="wait">
              <motion.div key="reports-dashboard" className="sb-settings-tab-motion" {...tabMotion}>
                <div className={cn("sb-settings-panel", isDark ? "dark" : "light")} data-theme={isDark ? "dark" : "light"}>
                  <ReportsDashboard />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="sb-settings-footer">
            <div className="min-w-0 truncate">
              <strong>SBS</strong>
              <span className="mx-1 opacity-60">©</span>
              <span>OMS Reports</span>
              <span className="mx-1 opacity-40">·</span>
              <strong>{currentOperator?.full_name ?? "operator"}</strong>
            </div>
            <div className="shrink-0 tabular-nums">{shiftBuilderVersionLabel()}</div>
          </footer>
        </motion.div>
      </div>
    </div>
  );
}