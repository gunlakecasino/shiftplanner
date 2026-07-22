"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Moon, Settings2, Sun } from "lucide-react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { currentShiftDate } from "@/lib/shiftbuilder/dateUtils";
import { useConfirm } from "../../components/ConfirmDialog";
import { useTheme } from "../../hooks/useTheme";
import { shiftBuilderVersionLabel } from "../../version";
import { ReportsDashboard } from "./ReportsDashboard";
import "../reportsShell.css";

export function ReportsShell() {
  const router = useRouter();
  const { isDark, toggleTheme } = useTheme();
  const { user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();
  const confirmDialog = useConfirm();
  const canAccessSudo = permissions?.canAccessSudo ?? false;
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const shiftDate = currentShiftDate(now);
  const formattedDate = shiftDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeString = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="sb-reports-page" data-theme={isDark ? "dark" : "light"}>
      <header className="sb-reports-topbar">
        <div className="sb-reports-brand">
          <span>GLCR</span>
          <strong>Reports</strong>
          <em>{formattedDate} · {timeString}</em>
        </div>

        <nav aria-label="Reports actions">
          {canAccessSudo ? (
            <button
              type="button"
              onClick={() => router.push("/sheetbuilder/settings?tab=reports")}
              title="Settings"
            >
              <Settings2 size={16} />
              Settings
            </button>
          ) : null}
          <button type="button" onClick={() => router.push("/sheetbuilder")} title="SheetBuilder">
            <ArrowLeft size={16} />
            Builder
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? "Light mode" : "Dark mode"}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {currentOperator ? (
            <button
              type="button"
              onClick={async () => {
                if (
                  await confirmDialog(`Sign out ${currentOperator.full_name}?`, {
                    confirmLabel: "Sign out",
                  })
                ) {
                  logoutOperator();
                  router.push("/shiftbuilder/reports");
                }
              }}
              title="Sign out"
            >
              <span>{currentOperator.username}</span>
              <LogOut size={14} />
            </button>
          ) : null}
        </nav>
      </header>

      <main className="sb-reports-page-body">
        <ReportsDashboard />
      </main>

      <footer className="sb-reports-footer">
        <span>{currentOperator?.full_name ?? "operator"}</span>
        <span>{shiftBuilderVersionLabel()}</span>
      </footer>
    </div>
  );
}
