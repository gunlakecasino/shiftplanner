"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { SettingsShell } from "./SettingsShell";
import "./settingsShell.css";

function SettingsGate() {
  const router = useRouter();
  const { permissions, isLoading } = useOpsAuth();

  useEffect(() => {
    if (!isLoading && !permissions?.canAccessSudo) {
      router.replace("/sheetbuilder");
    }
  }, [isLoading, permissions?.canAccessSudo, router]);

  if (!permissions?.canAccessSudo) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel="Team operators use the deployment canvas"
      />
    );
  }

  return (
    <PostPinRouteGuard>
      <SettingsShell />
    </PostPinRouteGuard>
  );
}

export default function SettingsClient() {
  return <SettingsGate />;
}
