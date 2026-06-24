"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PostPinRouteGuard } from "../components/PostPinRouteGuard";
import { BuilderLoadingShell } from "../components/builderPrimitives";
import { ReportsShell } from "./components/ReportsShell";

function ReportsGate() {
  const router = useRouter();
  const { permissions, isLoading } = useOpsAuth();
  const canViewReports =
    (permissions?.canAccessReports ?? false) || (permissions?.canAccessSudo ?? false);

  useEffect(() => {
    if (!isLoading && !canViewReports) {
      router.replace("/shiftbuilder");
    }
  }, [isLoading, canViewReports, router]);

  if (!canViewReports) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel="Reports access required"
      />
    );
  }

  return (
    <PostPinRouteGuard>
      <ReportsShell />
    </PostPinRouteGuard>
  );
}

export default function ReportsClient() {
  return <ReportsGate />;
}