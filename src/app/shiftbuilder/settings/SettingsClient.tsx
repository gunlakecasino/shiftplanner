"use client";

import { OpsAuthProvider, useOpsAuth } from "@/lib/auth/opsAuth";
import { PinGate } from "../components/PinGate";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { SettingsShell } from "./SettingsShell";
import "./settingsShell.css";

function SettingsGate() {
  const { isAuthenticated, isLoading, permissions } = useOpsAuth();

  if (isLoading) {
    return (
      <BuilderLoadingShell
        label="LOADING OPS SESSION"
        sublabel="Preparing settings"
      />
    );
  }

  if (!isAuthenticated) {
    return <PinGate />;
  }

  if (!permissions?.canAccessSudo) {
    return (
      <div
        className="sb-settings-shell sb-content-enter flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center"
      >
        <div className="text-[10px] font-mono uppercase tracking-[2px] text-[var(--ios-label-tertiary)]">
          Backend configuration
        </div>
        <div
          className="text-2xl font-bold tracking-[-0.5px] text-[var(--ios-label)]"
          style={{ fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
        >
          Access denied
        </div>
        <p className="max-w-md text-[14px] leading-relaxed text-[var(--ios-label-secondary)]">
          Your operator account does not have permission to open OMS Settings.
          Contact a sudo_admin if you need backend configuration access.
        </p>
      </div>
    );
  }

  return <SettingsShell />;
}

export default function SettingsClient() {
  return (
    <OpsAuthProvider>
      <SettingsGate />
    </OpsAuthProvider>
  );
}