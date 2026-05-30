"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

export type OpsRole =
  | "sudo_admin"
  | "admin"
  | "ops_director"
  | "ops_manager"
  | "ops_super"
  | "graves_ops_super"
  | "days_ops_super"
  | "swings_ops_super"
  | "utility_ops_super";

/**
 * Granular permission model for the ShiftBuilder.
 * This replaces the previous "all or nothing /today vs full app" approach.
 */
export interface ShiftBuilderPermissions {
  /** Can the user make changes to assignments on the board? */
  canEditAssignments: boolean;

  /** Can the user lock/unlock individual slots? */
  canLockUnlock: boolean;

  /** Can the user apply schedules from the Schedules tab? */
  canApplySchedules: boolean;

  /** Can the user publish/unpublish weeks or days? */
  canPublish: boolean;

  /** Can the user see draft (unpublished) schedules? */
  canSeeDraftData: boolean;

  /** Can the user open the full Sudo panel? */
  canAccessSudo: boolean;

  /** Can the user run the engine / batch planner? */
  canRunEngine: boolean;

  /** Can the user manage the team roster (Team tab)? */
  canManageTeam: boolean;
}

export interface OpsUser {
  id: string;
  email: string;
  full_name: string;
  username: string;
  role: OpsRole;
  /** Per-user permission overrides. When present, these merge with (and can override) role defaults. */
  permissions?: Partial<ShiftBuilderPermissions> | null;
}

interface OpsAuthContextValue {
  user: OpsUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** PIN-only login. The 6-digit PIN uniquely identifies the operator. */
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  hasRole: (...roles: OpsRole[]) => boolean;

  /** For Sudo or other high-privilege actions — callers can force a fresh PIN check. */
  requireFreshAuth: (maxAgeMinutes?: number) => boolean;

  /** The current user's fine-grained permissions inside ShiftBuilder */
  permissions: ShiftBuilderPermissions;
}

const OpsAuthContext = createContext<OpsAuthContextValue | null>(null);

const STORAGE_KEY = "oms_ops_auth_v1";
const MAX_SESSION_AGE_MS = 1000 * 60 * 60 * 18; // 18 hours — reasonable for internal ops tool

interface StoredAuth {
  user: OpsUser;
  authenticatedAt: string;
}

function getFunctionUrl(): string {
  // Derive from the public Supabase URL (works for both local + prod).
  // In production this becomes https://iazgrcainbokkdqunkok.functions.supabase.co/verify-pin
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    // Fallback for extreme edge cases during local dev without env
    return "https://iazgrcainbokkdqunkok.functions.supabase.co/verify-pin";
  }
  try {
    const u = new URL(supabaseUrl);
    return `${u.protocol}//${u.host.replace(".supabase.co", ".functions.supabase.co")}/verify-pin`;
  } catch {
    return "https://iazgrcainbokkdqunkok.functions.supabase.co/verify-pin";
  }
}

export function OpsAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OpsUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredAuth = JSON.parse(raw);
        const authedAt = new Date(stored.authenticatedAt).getTime();
        if (Date.now() - authedAt < MAX_SESSION_AGE_MS && stored.user) {
          setUser(stored.user);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.warn("[opsAuth] failed to hydrate", e);
      localStorage.removeItem(STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const persist = useCallback((u: OpsUser) => {
    const payload: StoredAuth = {
      user: u,
      authenticatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, []);

  const login = useCallback(async (pin: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(getFunctionUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      let json: any = {};
      let rawText = "";

      try {
        rawText = await res.text();
        json = rawText ? JSON.parse(rawText) : {};
      } catch {
        json = { error: rawText || "Non-JSON response" };
      }

      if (!res.ok || !json.success || !json.user) {
        const detailedError = json.error || json.message || "Unknown server error";
        console.warn("[opsAuth] login rejected", {
          status: res.status,
          statusText: res.statusText,
          body: json,
          raw: rawText,
        });

        return {
          success: false,
          error: `${detailedError} (HTTP ${res.status})`,
        };
      }

      const safeUser: OpsUser = {
        id: json.user.id,
        email: json.user.email,
        full_name: json.user.full_name,
        username: json.user.username,
        role: json.user.role,
        permissions: json.user.permissions ?? null,
      };

      setUser(safeUser);
      persist(safeUser);
      return { success: true };
    } catch (err: any) {
      console.error("[opsAuth] login network error", err);
      return {
        success: false,
        error: `Network error: ${err?.message || "Failed to reach server"}`,
      };
    } finally {
      setIsLoading(false);
    }
  }, [persist]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const hasRole = useCallback(
    (...roles: OpsRole[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const requireFreshAuth = useCallback((maxAgeMinutes = 30) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const stored: StoredAuth = JSON.parse(raw);
      const ageMs = Date.now() - new Date(stored.authenticatedAt).getTime();
      return ageMs < maxAgeMinutes * 60 * 1000;
    } catch {
      return false;
    }
  }, []);

  // Compute granular permissions: role defaults + per-user overrides from DB
  const permissions: ShiftBuilderPermissions = React.useMemo(() => {
    if (!user) {
      return getPermissionsForRole("utility_ops_super");
    }
    const base = getPermissionsForRole(user.role);
    let effective = mergePermissions(base, user.permissions);

    // Special current policy: Only graves_ops_super + sudo_admin can see unpublished data
    // (everyone can still see published schedules)
    if (!["sudo_admin", "graves_ops_super"].includes(user.role)) {
      effective = { ...effective, canSeeDraftData: false };
    }

    return effective;
  }, [user]);

  const value: OpsAuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasRole,
    requireFreshAuth,
    permissions,
  };

  return <OpsAuthContext.Provider value={value}>{children}</OpsAuthContext.Provider>;
}

/** Role-based permission matrix (base defaults) */
export function getPermissionsForRole(role: OpsRole): ShiftBuilderPermissions {
  switch (role) {
    case "sudo_admin":
    case "admin":
    case "ops_director":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: true,
        canPublish: true,
        canSeeDraftData: true,
        canAccessSudo: true,
        canRunEngine: true,
        canManageTeam: true,
      };

    case "ops_manager":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: true,
        canPublish: true,
        canSeeDraftData: true,
        canAccessSudo: true,
        canRunEngine: true,
        canManageTeam: true,
      };

    case "graves_ops_super":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,   // overridden individually in Users tab if needed
        canAccessSudo: false,
        canRunEngine: false,
        canManageTeam: false,
      };

    case "days_ops_super":
    case "swings_ops_super":
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canRunEngine: false,
        canManageTeam: false,
      };

    case "utility_ops_super":
    case "ops_super":
    default:
      return {
        canEditAssignments: true,
        canLockUnlock: true,
        canApplySchedules: false,
        canPublish: false,
        canSeeDraftData: false,
        canAccessSudo: false,
        canRunEngine: false,
        canManageTeam: false,
      };
  }
}

/** Deep merge user overrides on top of role defaults (with basic sanitization) */
export function mergePermissions(
  base: ShiftBuilderPermissions,
  overrides?: Partial<ShiftBuilderPermissions> | null
): ShiftBuilderPermissions {
  if (!overrides) return { ...base };

  const sanitized: Partial<ShiftBuilderPermissions> = {};

  // Only take known keys and coerce to correct types
  if (typeof overrides.canEditAssignments === "boolean") sanitized.canEditAssignments = overrides.canEditAssignments;
  if (typeof overrides.canLockUnlock === "boolean") sanitized.canLockUnlock = overrides.canLockUnlock;
  if (typeof overrides.canApplySchedules === "boolean") sanitized.canApplySchedules = overrides.canApplySchedules;
  if (typeof overrides.canPublish === "boolean") sanitized.canPublish = overrides.canPublish;
  if (typeof overrides.canSeeDraftData === "boolean") sanitized.canSeeDraftData = overrides.canSeeDraftData;
  if (typeof overrides.canAccessSudo === "boolean") sanitized.canAccessSudo = overrides.canAccessSudo;
  if (typeof overrides.canRunEngine === "boolean") sanitized.canRunEngine = overrides.canRunEngine;
  if (typeof overrides.canManageTeam === "boolean") sanitized.canManageTeam = overrides.canManageTeam;

  return {
    ...base,
    ...sanitized,
  };
}

export function useOpsAuth() {
  const ctx = useContext(OpsAuthContext);
  if (!ctx) {
    throw new Error("useOpsAuth must be used inside an OpsAuthProvider");
  }
  return ctx;
}

/** Convenience helper for components that just need the current operator (or null). */
export function useCurrentOperator() {
  const { user } = useOpsAuth();
  return user;
}

/**
 * Hook for fine-grained permissions inside the ShiftBuilder.
 * Use this instead of raw role checks for most UI decisions.
 */
export function usePermissions(): ShiftBuilderPermissions {
  const { permissions } = useOpsAuth();
  // Always return a fully valid permissions object as a safety net
  if (!permissions) {
    return getPermissionsForRole("utility_ops_super");
  }
  return permissions;
}


