"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { logOpsAudit, operatorDisplayName } from "@/lib/shiftbuilder/opsAuditLog";
import {
  getEffectivePermissions,
  getPermissionsForRole,
  mergePermissions,
} from "./permissions";

export type { OpsRole, OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";
import type { OpsRole, OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";

export { getEffectivePermissions, getPermissionsForRole, mergePermissions };

const SESSION_REFRESH_MS = 60_000;

interface OpsAuthContextValue {
  user: OpsUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  pinChangeToken: string | null;

  login: (pin: string) => Promise<{
    success: boolean;
    error?: string;
    user?: OpsUser;
    requiresPinChange?: boolean;
  }>;
  logout: () => Promise<void>;
  completePinChange: (user: OpsUser) => void;
  refreshSession: () => Promise<void>;
  hasRole: (...roles: OpsRole[]) => boolean;
  requireFreshAuth: (maxAgeMinutes?: number) => boolean;
  permissions: ShiftBuilderPermissions;
}

const OpsAuthContext = createContext<OpsAuthContextValue | null>(null);

/** Legacy key — cleared on boot; sessions now live in httpOnly cookies. */
const LEGACY_STORAGE_KEY = "oms_ops_auth_v1";

function mapApiUser(raw: Record<string, unknown>): OpsUser {
  return {
    id: String(raw.id),
    email: String(raw.email ?? ""),
    full_name: String(raw.full_name ?? ""),
    username: String(raw.username ?? ""),
    role: raw.role as OpsRole,
    permissions: (raw.permissions as Partial<ShiftBuilderPermissions> | null) ?? null,
    must_change_pin: Boolean(raw.must_change_pin),
  };
}

function permissionsChanged(a: OpsUser, b: OpsUser): boolean {
  if (a.role !== b.role) return true;
  const aPerms = JSON.stringify(a.permissions ?? null);
  const bPerms = JSON.stringify(b.permissions ?? null);
  return aPerms !== bPerms;
}

export function OpsAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OpsUser | null>(null);
  const [pinChangeToken, setPinChangeToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const userRef = useRef<OpsUser | null>(null);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const refreshSession = useCallback(async () => {
    if (pinChangeToken) return;

    try {
      const res = await fetch("/api/auth/session", { credentials: "same-origin" });
      if (!res.ok) {
        if (userRef.current) {
          setUser(null);
          setPinChangeToken(null);
        }
        return;
      }

      const json = await res.json();
      if (!json.authenticated || !json.user) {
        if (userRef.current) {
          setUser(null);
          setPinChangeToken(null);
        }
        return;
      }

      const nextUser = mapApiUser(json.user);
      const prev = userRef.current;
      if (!prev || permissionsChanged(prev, nextUser) || prev.must_change_pin !== nextUser.must_change_pin) {
        setUser(nextUser);
      }
    } catch (e) {
      console.warn("[opsAuth] session refresh failed", e);
    }
  }, [pinChangeToken]);

  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/session", { credentials: "same-origin" });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json.authenticated && json.user) {
          setUser(mapApiUser(json.user));
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
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ pin }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success || !json.user) {
        return {
          success: false,
          error: json.error || `Invalid credentials (HTTP ${res.status})`,
        };
      }

      const safeUser = mapApiUser(json.user);
      setUser(safeUser);

      const requiresPinChange = !!json.requiresPinChange;
      if (requiresPinChange) {
        setPinChangeToken(json.pinChangeToken ?? null);
      } else {
        setPinChangeToken(null);
        logOpsAudit({
          action: "session_start",
          operatorName: operatorDisplayName(safeUser),
          opsUserId: safeUser.id,
          payload: { role: safeUser.role, source: "pin_gate" },
        });
      }

      return {
        success: true,
        user: safeUser,
        requiresPinChange,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Network error: ${err instanceof Error ? err.message : "Failed to reach server"}`,
      };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const completePinChange = useCallback((updated: OpsUser) => {
    const safeUser: OpsUser = { ...updated, must_change_pin: false };
    setUser(safeUser);
    setPinChangeToken(null);
    logOpsAudit({
      action: "session_start",
      operatorName: operatorDisplayName(safeUser),
      opsUserId: safeUser.id,
      payload: { role: safeUser.role, source: "pin_gate_after_change" },
    });
  }, []);

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