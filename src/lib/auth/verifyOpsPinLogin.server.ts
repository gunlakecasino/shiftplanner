import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { isTempPinExpired, verifyOpsPin } from "./opsUserLifecycle.server";
import { resolveDisplayRole } from "./roleStorage";
import type { OpsRole } from "./opsAuthTypes";
import type { VerifyPinEdgeUser } from "./opsUser.server";

export type VerifyPinLoginFailure = {
  ok: false;
  status: 401 | 403 | 429;
  error: string;
  retryAfterSec?: number;
  requiresAdminContact?: boolean;
  failedAttempts?: number;
};

export type VerifyPinLoginSuccess = {
  ok: true;
  user: VerifyPinEdgeUser & { role: OpsRole | string };
};

export type VerifyPinLoginResult = VerifyPinLoginSuccess | VerifyPinLoginFailure;

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  role: string | null;
  is_active: boolean;
  pin_hash: string;
  permissions: Record<string, boolean> | null;
  must_change_pin: boolean | null;
  pin_issued_at: string | null;
  locked_until: string | null;
  failed_pin_attempts: number | null;
};

function isAccountLocked(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  const locked = new Date(lockedUntil).getTime();
  return !Number.isNaN(locked) && locked > Date.now();
}

function retryAfterSec(lockedUntil: string | null): number {
  if (!lockedUntil) return 0;
  const locked = new Date(lockedUntil).getTime();
  if (Number.isNaN(locked)) return 0;
  return Math.max(1, Math.ceil((locked - Date.now()) / 1000));
}

function requiresAdminContact(
  failedAttempts: number,
  lockedUntil: string | null,
): boolean {
  if (failedAttempts >= 8) return true;
  if (!lockedUntil) return false;
  return new Date(lockedUntil).getTime() > Date.UTC(2099, 0, 1);
}

function lockoutFailure(user: UserRow): VerifyPinLoginFailure {
  const attempts = user.failed_pin_attempts ?? 0;
  const admin = requiresAdminContact(attempts, user.locked_until);
  return {
    ok: false,
    status: 403,
    error: admin ? "account_locked_admin" : "account_locked",
    retryAfterSec: admin ? 0 : retryAfterSec(user.locked_until),
    failedAttempts: attempts,
    requiresAdminContact: admin,
  };
}

function toSafeUser(row: UserRow): VerifyPinLoginSuccess["user"] {
  const permissions = row.permissions ?? null;
  return {
    id: row.id,
    email: row.email ?? "",
    full_name: row.full_name ?? "",
    username: row.username ?? "",
    role: resolveDisplayRole(row.role ?? "viewer", permissions) as OpsRole,
    permissions,
    must_change_pin: Boolean(row.must_change_pin),
  };
}

async function fetchUserLockState(
  client: SupabaseClient,
  userId: string,
): Promise<Pick<UserRow, "failed_pin_attempts" | "locked_until"> | null> {
  const { data } = await client
    .from("users")
    .select("failed_pin_attempts, locked_until")
    .eq("id", userId)
    .maybeSingle();
  return data as Pick<UserRow, "failed_pin_attempts" | "locked_until"> | null;
}

/**
 * Server-native PIN login — same rules as the Supabase edge function but runs
 * on Railway with the service-role client (no edge hop, bcryptjs-compatible).
 */
export async function verifyOpsPinLogin(
  pin: string,
  lastUserId?: string,
): Promise<VerifyPinLoginResult> {
  const client = createAdminClientSafe();
  if (!client) {
    return { ok: false, status: 403, error: "server_config_unavailable" };
  }

  const { data: candidates, error: lookupErr } = await client
    .from("users")
    .select(
      "id, email, full_name, username, role, is_active, pin_hash, permissions, must_change_pin, pin_issued_at, locked_until, failed_pin_attempts",
    )
    .eq("is_active", true)
    .not("pin_hash", "is", null);

  if (lookupErr || !candidates?.length) {
    return { ok: false, status: 401, error: "Invalid credentials" };
  }

  let matched: UserRow | null = null;
  let locked: UserRow | null = null;

  for (const row of candidates as UserRow[]) {
    if (isTempPinExpired(row.pin_issued_at, Boolean(row.must_change_pin))) {
      continue;
    }

    const ok = await verifyOpsPin(pin, row.pin_hash);
    if (!ok) continue;

    if (isAccountLocked(row.locked_until)) {
      locked = row;
    } else {
      matched = row;
    }
    break;
  }

  if (matched) {
    await client.rpc("reset_pin_attempts", { p_user_id: matched.id });
    return { ok: true, user: toSafeUser(matched) };
  }

  if (locked) {
    return lockoutFailure(locked);
  }

  let attemptUserId: string | null = lastUserId?.trim() || null;
  if (!attemptUserId && (candidates as UserRow[]).length === 1) {
    attemptUserId = (candidates as UserRow[])[0].id;
  }

  if (attemptUserId) {
    await client.rpc("record_failed_pin_attempt", { p_user_id: attemptUserId });
    const lockState = await fetchUserLockState(client, attemptUserId);
    if (lockState && isAccountLocked(lockState.locked_until)) {
      return lockoutFailure({
        ...(candidates as UserRow[]).find((u) => u.id === attemptUserId) ??
          (candidates as UserRow[])[0],
        ...lockState,
      } as UserRow);
    }
  }

  return { ok: false, status: 401, error: "Invalid credentials" };
}