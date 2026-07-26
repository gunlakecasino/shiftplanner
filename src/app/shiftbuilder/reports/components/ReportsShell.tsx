"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Settings2 } from "lucide-react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { useConfirm } from "../../components/ConfirmDialog";
import { ReportsDashboard } from "./ReportsDashboard";
import "../reportsShell.css";

export function ReportsShell() {
  const router = useRouter();
  const { user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();
  const confirmDialog = useConfirm();
  const canAccessSudo = permissions?.canAccessSudo ?? false;

  return (
    <div className="sb-reports-page" data-theme="light">
      <header className="sb-reports-topbar">
        <div className="sb-reports-brand">
          <span className="sb-reports-brand-mark" aria-hidden="true" />
          <strong>Graves Operations Reporting</strong>
          <i aria-hidden="true" />
          <span>Operations Analytics</span>
        </div>

        <nav aria-label="Reports actions">
          <span>Reporting Services 4.2</span>
          <span className="sb-reports-env">PROD</span>
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
    </div>
  );
}
