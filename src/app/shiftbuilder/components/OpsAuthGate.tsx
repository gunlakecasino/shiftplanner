"use client";

import React from "react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { PinGate } from "./PinGate";
import { PinChangeGate } from "./PinChangeGate";
import { BuilderLoadingShell } from "./builderPrimitives";

type Props = {
  children: React.ReactNode;
  loadingLabel?: string;
  loadingSublabel?: string;
};

export function OpsAuthGate({
  children,
  loadingLabel = "LOADING OPS SESSION",
  loadingSublabel,
}: Props) {
  const { isAuthenticated, isLoading, user, pinChangeToken } = useOpsAuth();

  if (isLoading) {
    return (
      <BuilderLoadingShell
        label={loadingLabel}
        sublabel={loadingSublabel}
      />
    );
  }

  if (!isAuthenticated || !user) {
    return <PinGate />;
  }

  if (user.must_change_pin) {
    if (!pinChangeToken) {
      return <PinGate />;
    }
    return <PinChangeGate operatorName={user.full_name || user.username} />;
  }

  return <>{children}</>;
}