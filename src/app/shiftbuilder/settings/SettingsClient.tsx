"use client";

import { OpsAuthProvider, useOpsAuth } from "@/lib/auth/opsAuth";
import { OpsAuthGate } from "../components/OpsAuthGate";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { SettingsShell } from "./SettingsShell";
import "./settingsShell.css";

function SettingsGate() {
  const { permissions } = useOpsAuth();

  return (
    <OpsAuthGate loadingSublabel="Preparing settings">
      {!permissions?.canAccessSudo ? (
        <BuilderLoadingShell
          label="REDIRECTING"
          sublabel="Team operators use the deployment canvas"
        />
      ) : (
        <PostPinRouteGuard>
          <SettingsShell />
        </PostPinRouteGuard>
      )}
    </OpsAuthGate>
  );
}

export default function SettingsClient() {
  return (
    <OpsAuthProvider>
      <SettingsGate />
    </OpsAuthProvider>
  );
}