import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { sanitizePermissionOverrides } from "@/lib/auth/permissionCatalog";
import { countActiveSudoAdmins, requireSudoAdmin } from "@/lib/auth/requireSudoAdmin.server";
import { verifyAdminPin } from "@/lib/auth/verifyAdminPin.server";
import {
  createOpsUserWithPin,
  issueOpsTemporaryPin,
} from "@/lib/auth/opsUserLifecycle.server";
import { resolveDisplayRole, resolveStoredUserRole } from "@/lib/auth/roleStorage";
import { logOpsAuditServer } from "@/lib/shiftbuilder/opsAuditLog.server";

const USER_SELECT =
  "id, email, full_name, username, role, is_active, permissions, must_change_pin, pin_issued_at, last_pin_change_at, created_at, updated_at";

function mapUser(row: Record<string, unknown>) {
  const storedRole = String(row.role ?? "viewer");
  const permissions = (row.permissions as Record<string, unknown> | null) ?? null;
  return {
    id: String(row.id),
    email: (row.email as string | null) ?? null,
    full_name: String(row.full_name ?? ""),
    username: String(row.username ?? ""),
    role: resolveDisplayRole(storedRole, permissions),
    is_active: Boolean(row.is_active),
    permissions,
    must_change_pin: Boolean(row.must_change_pin),
    pin_issued_at: (row.pin_issued_at as string | null) ?? null,
    last_pin_change_at: (row.last_pin_change_at as string | null) ?? null,
    created_at: (row.created_at as string | null) ?? null,
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function requireAdminPinConfirm(
  actorId: string,
  adminPin: unknown,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const pin = typeof adminPin === "string" ? adminPin.trim() : "";
  if (!pin || !/^\d{6}$/.test(pin)) {
    return { ok: false, status: 400, error: "adminPin (6 digits) is required for this action" };
  }

  const valid = await verifyAdminPin(actorId, pin);
  if (!valid) {
    return { ok: false, status: 403, error: "Admin PIN is incorrect" };
  }

  return { ok: true };
}

async function auditAdmin(actorId: string, actorName: string, details: Record<string, unknown>) {
  try {
    await logOpsAuditServer({
      action: "user_update",
      operatorName: actorName,
      opsUserId: actorId,
      payload: { source: "admin_users_api", ...details },
    });
  } catch (e) {
    console.warn("[admin/users] audit insert failed", e);
  }
}

export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = await requireSudoAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const client = createAdminClientSafe();
  if (!client) {
    return NextResponse.json({ users: [] });
  }

  const { data, error } = await client
    .from("users")
    .select(USER_SELECT)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[admin/users] list failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    users: (data ?? []).map((row) => mapUser(row as Record<string, unknown>)),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const auth = await requireSudoAdmin(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const rateKey = `admin-users:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 40);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  const client = createAdminClientSafe();
  if (!client) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const actor = auth.actor;

  try {
    if (action === "create") {
      const full_name = String(body.full_name ?? "").trim();
      const username = String(body.username ?? "").trim();
      const email = body.email ? String(body.email).trim() : null;
      const requestedRole = String(body.role ?? "viewer").trim();
      const stored = resolveStoredUserRole(
        requestedRole,
        body.permissions as Record<string, boolean> | null,
      );

      if (!full_name || !username) {
        return NextResponse.json({ error: "full_name and username are required" }, { status: 400 });
      }

      let userId: string;
      let temporaryPin: string;
      try {
        const created = await createOpsUserWithPin(client, {
          full_name,
          username,
          email,
          role: stored.role,
          permissions: stored.permissions,
          must_change_pin: true,
        });
        userId = created.userId;
        temporaryPin = created.temporaryPin;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "User creation failed";
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      const { data: userRow } = await client
        .from("users")
        .select(USER_SELECT)
        .eq("id", userId)
        .maybeSingle();

      await auditAdmin(actor.id, actor.full_name || actor.username, {
        event: "user_create",
        targetUserId: userId,
        role: requestedRole,
      });

      return NextResponse.json({
        success: true,
        userId,
        temporaryPin,
        user: userRow ? mapUser(userRow as Record<string, unknown>) : null,
      });
    }

    if (action === "update") {
      const userId = String(body.userId ?? "").trim();
      if (!userId) {
        return NextResponse.json({ error: "userId is required" }, { status: 400 });
      }

      const { data: target } = await client
        .from("users")
        .select("id, role, is_active, permissions")
        .eq("id", userId)
        .maybeSingle();

      if (!target) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const currentDisplayRole = resolveDisplayRole(
        String(target.role),
        target.permissions as Record<string, unknown> | null,
      );
      const requestedDisplayRole =
        body.role !== undefined ? String(body.role) : currentDisplayRole;
      const stored = resolveStoredUserRole(
        requestedDisplayRole,
        body.permissions as Record<string, boolean> | null,
      );
      const nextRole = stored.role;
      const roleChanging =
        body.role !== undefined && requestedDisplayRole !== currentDisplayRole;

      if (roleChanging) {
        const pinCheck = await requireAdminPinConfirm(actor.id, body.adminPin);
        if (!pinCheck.ok) {
          return NextResponse.json({ error: pinCheck.error }, { status: pinCheck.status });
        }
      }

      if (nextRole === "sudo_admin" && target.role !== "sudo_admin") {
        // Only existing sudo_admins can create new sudo_admins (actor already verified)
      }

      if (target.role === "sudo_admin" && nextRole !== "sudo_admin") {
        const remaining = await countActiveSudoAdmins(userId);
        if (remaining < 1) {
          return NextResponse.json(
            { error: "Cannot remove the last active sudo_admin" },
            { status: 400 },
          );
        }
      }

      if (userId === actor.id && nextRole !== "sudo_admin") {
        return NextResponse.json(
          { error: "You cannot demote your own sudo_admin account" },
          { status: 400 },
        );
      }

      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.role !== undefined) {
        patch.role = stored.role;
        patch.permissions = stored.permissions;
      } else if (body.permissions !== undefined) {
        patch.permissions = sanitizePermissionOverrides(
          body.permissions as Record<string, boolean> | null,
        );
      }

      const { error } = await client.from("users").update(patch).eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      const { data: userRow } = await client
        .from("users")
        .select(USER_SELECT)
        .eq("id", userId)
        .maybeSingle();

      await auditAdmin(actor.id, actor.full_name || actor.username, {
        event: "profile_update",
        targetUserId: userId,
        role: nextRole,
      });

      return NextResponse.json({
        success: true,
        user: userRow ? mapUser(userRow as Record<string, unknown>) : null,
      });
    }

    if (action === "deactivate") {
      const userId = String(body.userId ?? "").trim();
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      if (userId === actor.id) {
        return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 });
      }

      const { data: target } = await client
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (target?.role === "sudo_admin") {
        const remaining = await countActiveSudoAdmins(userId);
        if (remaining < 1) {
          return NextResponse.json(
            { error: "Cannot deactivate the last active sudo_admin" },
            { status: 400 },
          );
        }
      }

      const { error } = await client
        .from("users")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await auditAdmin(actor.id, actor.full_name || actor.username, {
        event: "deactivate",
        targetUserId: userId,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "reactivate") {
      const userId = String(body.userId ?? "").trim();
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const { error } = await client
        .from("users")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });

      await auditAdmin(actor.id, actor.full_name || actor.username, {
        event: "reactivate",
        targetUserId: userId,
      });

      return NextResponse.json({ success: true });
    }

    if (action === "issue_temp_pin") {
      const userId = String(body.userId ?? "").trim();
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

      const pinCheck = await requireAdminPinConfirm(actor.id, body.adminPin);
      if (!pinCheck.ok) {
        return NextResponse.json({ error: pinCheck.error }, { status: pinCheck.status });
      }

      let temporaryPin: string;
      try {
        temporaryPin = await issueOpsTemporaryPin(client, userId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "PIN reset failed";
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      await auditAdmin(actor.id, actor.full_name || actor.username, {
        event: "pin_reset",
        targetUserId: userId,
      });

      return NextResponse.json({ success: true, temporaryPin });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[admin/users] POST failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}