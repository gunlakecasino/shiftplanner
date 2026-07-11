import { NextRequest } from "next/server";
import { readSessionUserId } from "./opsSession.server";
import { getEffectivePermissions } from "./permissions";
import { loadOpsUserById } from "./opsUser.server";
import type { OpsUser, ShiftBuilderPermissions } from "./opsAuthTypes";
import {
  hasOpsPermission,
  type PermissionKey,
} from "./auditActionPermission";

export type OpsSessionActor = {
  user: OpsUser;
  permissions: ShiftBuilderPermissions;
  operatorName: string;
};

export type OpsSessionResult =
  | { ok: true; actor: OpsSessionActor }
  | { ok: false; status: number; error: string };

export function operatorNameFromUser(user: Pick<OpsUser, "full_name" | "username">): string {
  return user.full_name?.trim() || user.username?.trim() || "Operator";
}

/** Wrap a standard Request as NextRequest for cookie/session reads. */
export function asNextRequest(request: Request): NextRequest {
  return request instanceof NextRequest
    ? request
    : new NextRequest(request.url, { method: request.method, headers: request.headers });
}

/** Load the signed-in operator from httpOnly cookie + fresh DB row. */
export async function requireOpsSession(request: NextRequest | Request): Promise<OpsSessionResult> {
  const nextReq = asNextRequest(request);
  const userId = readSessionUserId(nextReq);
  if (!userId) {
    return { ok: false, status: 401, error: "Not authenticated — sign in required" };
  }

  const user = await loadOpsUserById(userId);
  if (!user) {
    return { ok: false, status: 401, error: "Session invalid or account inactive" };
  }

  if (user.must_change_pin) {
    return { ok: false, status: 403, error: "Complete PIN setup before continuing" };
  }

  const permissions = getEffectivePermissions(user);

  return {
    ok: true,
    actor: {
      user,
      permissions,
      operatorName: operatorNameFromUser(user),
    },
  };
}

/** Require an authenticated session with a specific permission bit. */
export async function requireOpsPermission(
  request: NextRequest | Request,
  permission: PermissionKey | "authenticated",
): Promise<OpsSessionResult> {
  const session = await requireOpsSession(request);
  if (!session.ok) return session;

  if (!hasOpsPermission(session.actor.permissions, permission)) {
    return { ok: false, status: 403, error: `Missing permission: ${permission}` };
  }

  return session;
}

/** Require an authenticated session with at least one of the given permission bits. */
export async function requireOpsAnyPermission(
  request: NextRequest | Request,
  keys: PermissionKey[],
): Promise<OpsSessionResult> {
  const session = await requireOpsSession(request);
  if (!session.ok) return session;

  const allowed = keys.some((key) => hasOpsPermission(session.actor.permissions, key));
  if (!allowed) {
    return { ok: false, status: 403, error: "Insufficient permissions" };
  }

  return session;
}

/**
 * Build a synthetic NextRequest from the server-action cookie jar so
 * `"use server"` functions can reuse the Request-based session helpers.
 * `cookies()` is not a valid argument to requireOpsSession directly.
 */
export async function nextRequestFromCookies(
  path = "/ops-server-action",
): Promise<NextRequest> {
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const cookieHeader = jar
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  return new NextRequest(`http://local${path}`, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

/** Session gate for Next.js server actions (no Request in the action signature). */
export async function requireOpsSessionFromCookies(): Promise<OpsSessionResult> {
  return requireOpsSession(await nextRequestFromCookies());
}

/** Permission gate for Next.js server actions. */
export async function requireOpsPermissionFromCookies(
  permission: PermissionKey | "authenticated",
): Promise<OpsSessionResult> {
  return requireOpsPermission(await nextRequestFromCookies(), permission);
}

/** Any-of permission gate for Next.js server actions. */
export async function requireOpsAnyPermissionFromCookies(
  keys: PermissionKey[],
): Promise<OpsSessionResult> {
  return requireOpsAnyPermission(await nextRequestFromCookies(), keys);
}