"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { TeamShell } from "./TeamShell";

function TeamGate() {
  const router = useRouter();
  const { permissions, isLoading } = useOpsAuth();
  // People surface: roster + special groups (canManageTeam) and the graves grid
  // (canApplySchedules). Sudo always gets in. Any one is enough to open the page —
  // individual tabs gate themselves.
  const canViewTeam =
    (permissions?.canManageTeam ?? false) ||
    (permissions?.canApplySchedules ?? false) ||
    (permissions?.canAccessSudo ?? false);

  useEffect(() => {
    if (!isLoading && !canViewTeam) {
      router.replace("/sheetbuilder");
    }
  }, [isLoading, canViewTeam, router]);

  if (!canViewTeam) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel="Team management access required"
      />
    );
  }

  return (
    <PostPinRouteGuard>
      <TeamShell />
    </PostPinRouteGuard>
  );
}

export default function TeamClient() {
  return <TeamGate />;
}
