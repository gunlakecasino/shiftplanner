"use client";

import { OpsAuthProvider, useOpsAuth } from "@/lib/auth/opsAuth";
import { PinGate } from "../components/PinGate";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { SettingsShell } from "./SettingsShell";

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-xl font-semibold tracking-tight">Access denied</div>
        <p className="max-w-md text-[14px] text-[#6C6C72] leading-relaxed">
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