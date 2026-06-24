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

  useEffect(() => {
    if (!isLoading && !permissions?.canAccessSudo) {
      router.replace("/shiftbuilder");
    }
  }, [isLoading, permissions?.canAccessSudo, router]);

  if (!permissions?.canAccessSudo) {
    return (
      <BuilderLoadingShell
        label="REDIRECTING"
        sublabel="Reports require sudo access"
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