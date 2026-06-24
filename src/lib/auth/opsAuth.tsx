// v1.0 Release-Ready — UI frozen June 24 2026
"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { logOpsAudit, operatorDisplayName } from "@/lib/shiftbuilder/opsAuditLog";
import {
  getEffectivePermissions,
  getPermissionsForRole,
  mergePermissions,
} from "./permissions";
import { humanizeLoginError } from "./loginErrors";
import { notifyOpsSessionChanged } from "./opsSessionQueryCache";
import { resolveDisplayRole } from "./roleStorage";

export type { OpsRole, OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";
import type { OpsRole, OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";

export { getEffectivePermissions, getPermissionsForRole, mergePermissions };

/** Keep server idle cookie sliding while the tab stays open. */
const SESSION_REFRESH_MS = 45_000;

interface OpsAuthContextValue {
  user: OpsUser | null;
  isAuthenticated: boolean;
  /** True only during initial /api/auth/session hydrate. */
  isLoading: boolean;
  /** True while POST /api/auth/verify-pin is in flight — does not unmount PinGate. */
  isLoggingIn: boolean;
  pinChangeToken: string | null;

  login: (pin: string) => Promise<{
    success: boolean;
    error?: string;
    user?: OpsUser;
    requiresPinChange?: boolean;
  }>;
  logout: () => Promise<void>;
  completePinChange: (user: OpsUser) => void;
  refreshSession: () => Promise<boolean>;
  hasRole: (...roles: OpsRole[]) => boolean;
  requireFreshAuth: (maxAgeMinutes?: number) => boolean;
  permissions: ShiftBuilderPermissions;
}

const OpsAuthContext = createContext<OpsAuthContextValue | null>(null);

/** Legacy key — cleared on boot; sessions now live in httpOnly cookies. */
const LEGACY_STORAGE_KEY = "oms_ops_auth_v1";
/** Last successful PIN login on this device — attributes wrong-PIN attempts when PIN-only. */
const LAST_OPS_USER_KEY = "oms_last_ops_user_id";

function readLastOpsUserId(): string | undefined {
  try {
    const id = localStorage.getItem(LAST_OPS_USER_KEY)?.trim();
    return id || undefined;
  } catch {
    return undefined;
  }
}

function rememberLastOpsUserId(userId: string): void {
  try {
    localStorage.setItem(LAST_OPS_USER_KEY, userId);
  } catch {
    /* ignore */
  }
}

function mapApiUser(raw: Record<string, unknown>): OpsUser {
  const permissions = (raw.permissions as Partial<ShiftBuilderPermissions> | null) ?? null;
  const storedRole = String(raw.role ?? "viewer");
  return {
    id: String(raw.id),
    email: String(raw.email ?? ""),
    full_name: String(raw.full_name ?? ""),
    username: String(raw.username ?? ""),
    role: resolveDisplayRole(storedRole, permissions) as OpsRole,
    permissions,
    must_change_pin: Boolean(raw.must_change_pin),
  };
}

function permissionsChanged(a: OpsUser, b: OpsUser): boolean {
  if (a.role !== b.role) return true;
  const aPerms = JSON.stringify(a.permissions ?? null);
  const bPerms = JSON.stringify(b.permissions ?? null);
  return aPerms !== bPerms;
}

async function fetchSessionState(): Promise<{
  ok: boolean;
  authenticated: boolean;
  user?: OpsUser;
}> {
  const res = await fetch("/api/auth/session", { credentials: "same-origin" });
  if (!res.ok) {
    return { ok: false, authenticated: false };
  }

  const json = await res.json().catch(() => ({}));
  if (!json.authenticated || !json.user) {
    return { ok: true, authenticated: false };
  }

  return {
    ok: true,
    authenticated: true,
    user: mapApiUser(json.user),
  };
}

export function OpsAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OpsUser | null>(null);
  const [pinChangeToken, setPinChangeToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const userRef = useRef<OpsUser | null>(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const applySessionUser = useCallback((nextUser: OpsUser | null) => {
    const prev = userRef.current;
    userRef.current = nextUser;
    if (!nextUser) {
      setUser(null);
      setPinChangeToken(null);
      notifyOpsSessionChanged();
      return;
    }
    const identityChanged =
      !prev ||
      prev.id !== nextUser.id ||
      permissionsChanged(prev, nextUser) ||
      prev.must_change_pin !== nextUser.must_change_pin;
    if (identityChanged) {
      setUser(nextUser);
      notifyOpsSessionChanged();
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (pinChangeToken || refreshInFlightRef.current) return !!userRef.current;

    refreshInFlightRef.current = true;
    try {
      const state = await fetchSessionState();
      if (!state.ok) {
        return !!userRef.current;
      }
      if (!state.authenticated || !state.user) {
        if (userRef.current) {
          applySessionUser(null);
        }
        return false;
      }
      applySessionUser(state.user);
      return true;
    } catch (e) {
      console.warn("[opsAuth] session refresh failed", e);
      return !!userRef.current;
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [pinChangeToken, applySessionUser]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        const state = await fetchSessionState();
        if (!cancelled && state.authenticated && state.user) {
          setUser(state.user);
        }
      } catch (e) {
        console.warn("[opsAuth] session hydrate failed", e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!user || pinChangeToken) return;

    const interval = window.setInterval(() => {
      void refreshSession();
    }, SESSION_REFRESH_MS);

    const onFocus = () => {
      void refreshSession();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void refreshSession();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [user, pinChangeToken, refreshSession]);

  const login = useCallback(async (pin: string) => {
    setIsLoggingIn(true);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin, lastUserId: readLastOpsUserId() }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success || !json.user) {
        return {
          success: false,
          error: humanizeLoginError(json.error, res.status, {
            retryAfterSec: json.retryAfterSec,
            requiresAdminContact: json.requiresAdminContact,
            failedAttempts: json.failedAttempts,
          }),
        };
      }

      const safeUser = mapApiUser(json.user);
      const requiresPinChange = !!json.requiresPinChange;
      rememberLastOpsUserId(safeUser.id);

      if (requiresPinChange) {
        applySessionUser(safeUser);
        setPinChangeToken(json.pinChangeToken ?? null);
        return {
          success: true,
          user: safeUser,
          requiresPinChange,
        };
      }

      applySessionUser(safeUser);
      void refreshSession();

      logOpsAudit({
        action: "session_start",
        operatorName: operatorDisplayName(safeUser),
        opsUserId: safeUser.id,
        payload: { role: safeUser.role, source: "pin_gate" },
      });

      return {
        success: true,
        user: safeUser,
        requiresPinChange: false,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: humanizeLoginError(
          err instanceof Error ? err.message : "Failed to reach server",
        ),
      };
    } finally {
      setIsLoggingIn(false);
    }
  }, [applySessionUser, refreshSession]);

  const completePinChange = useCallback((updated: OpsUser) => {
    const safeUser: OpsUser = { ...updated, must_change_pin: false };
    applySessionUser(safeUser);
    setPinChangeToken(null);
    logOpsAudit({
      action: "session_start",
      operatorName: operatorDisplayName(safeUser),
      opsUserId: safeUser.id,
      payload: { role: safeUser.role, source: "pin_gate_after_change" },
    });
    void refreshSession();
  }, [applySessionUser, refreshSession]);

  const logout = useCallback(async () => {
    if (user) {
      logOpsAudit({
        action: "session_end",
        operatorName: operatorDisplayName(user),
        opsUserId: user.id,
        payload: { role: user.role, source: "logout" },
      });
    }
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* ignore */
    }
    setUser(null);
    setPinChangeToken(null);
    notifyOpsSessionChanged();
  }, [user]);

  const hasRole = useCallback(
    (...roles: OpsRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user],
  );

  const requireFreshAuth = useCallback(() => {
    return !!user && !user.must_change_pin;
  }, [user]);

  const permissions: ShiftBuilderPermissions = React.useMemo(() => {
    if (!user) return getPermissionsForRole("utility_ops_super");
    return getEffectivePermissions(user);
  }, [user]);

  const value: OpsAuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    isLoggingIn,
    pinChangeToken,
    login,
    completePinChange,
    logout,
    refreshSession,
    hasRole,
    requireFreshAuth,
    permissions,
  };

  return <OpsAuthContext.Provider value={value}>{children}</OpsAuthContext.Provider>;
}

export function useOpsAuth() {
  const ctx = useContext(OpsAuthContext);
  if (!ctx) {
    throw new Error("useOpsAuth must be used inside an OpsAuthProvider");
  }
  return ctx;
}

export function useCurrentOperator() {
  const { user } = useOpsAuth();
  return user;
}

export function usePermissions(): ShiftBuilderPermissions {
  const { permissions } = useOpsAuth();
  if (!permissions) {
    return getPermissionsForRole("utility_ops_super");
  }
  return permissions;
}