"use client";

import React from "react";
import { useOpsAuth } from "@/lib/auth/opsAuth";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
};

/**
 * Defers mounting ShiftBuilderClient until PIN auth completes.
 *
 * Fixes empty cards on first login: the client no longer hydrates useShiftData
 * against pre-auth 401/empty night-core responses (hydratedAssignmentsDayRef
 * would otherwise block re-hydration after login).
 *
 * key={user.id} forces a clean remount on operator switch.
 */
export function ShiftBuilderAuthenticatedShell({ children }: Props) {
  const { isLoading, isAuthenticated, user } = useOpsAuth();

  const authedReady =
    !isLoading && isAuthenticated && !!user && !user.must_change_pin;

  if (!authedReady) {
    return null;
  }

  return (
    <div key={user.id} className={cn("sb-shiftbuilder-authed", "sb-content-enter")}>
      {children}
    </div>
  );
}

export default ShiftBuilderAuthenticatedShell;