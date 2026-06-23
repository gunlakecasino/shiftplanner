/** Browser → session-gated /api/admin/users proxy (Settings → Users tab). */

export interface SudoUser {
  id: string;
  email: string | null;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
  permissions: Record<string, any> | null;
  must_change_pin?: boolean;
  pin_issued_at?: string | null;
  last_pin_change_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateUserInput {
  full_name: string;
  username: string;
  email?: string | null;
  role?: string;
  permissions?: Record<string, any> | null;
}

export interface CreateUserResult {
  userId: string;
  temporaryPin: string;
  user: SudoUser | null;
}

async function adminUsersPost(body: Record<string, unknown>) {
  const res = await fetch("/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error || `Request failed (HTTP ${res.status})`);
  }
  return json;
}

export async function listAllUsers(): Promise<SudoUser[]> {
  const res = await fetch("/api/admin/users", { credentials: "same-origin" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `listAllUsers failed (HTTP ${res.status})`);
  return (json.users ?? []) as SudoUser[];
}

export async function updateUserPermissions(
  userId: string,
  permissions: Record<string, any> | null,
): Promise<SudoUser | null> {
  const json = await adminUsersPost({ action: "update", userId, permissions });
  return (json.user as SudoUser) ?? null;
}

export async function updateUserRole(userId: string, role: string): Promise<SudoUser | null> {
  const json = await adminUsersPost({ action: "update", userId, role });
  return (json.user as SudoUser) ?? null;
}

export async function updateUserProfile(
  userId: string,
  patch: { role?: string; permissions?: Record<string, any> | null },
  options?: { adminPin?: string },
): Promise<SudoUser | null> {
  const json = await adminUsersPost({
    action: "update",
    userId,
    ...patch,
    ...(options?.adminPin ? { adminPin: options.adminPin } : {}),
  });
  return (json.user as SudoUser) ?? null;
}

export async function createUser(input: CreateUserInput): Promise<CreateUserResult> {
  const json = await adminUsersPost({
    action: "create",
    full_name: input.full_name,
    username: input.username,
    email: input.email || null,
    role: input.role || "viewer",
    permissions: input.permissions ?? null,
  });

  return {
    userId: json.userId as string,
    temporaryPin: json.temporaryPin as string,
    user: (json.user as SudoUser) ?? null,
  };
}

export async function issueTemporaryPin(userId: string, adminPin: string): Promise<string> {
  const json = await adminUsersPost({ action: "issue_temp_pin", userId, adminPin });
  return json.temporaryPin as string;
}

export async function deactivateUser(userId: string): Promise<void> {
  await adminUsersPost({ action: "deactivate", userId });
}

export async function reactivateUser(userId: string): Promise<void> {
  await adminUsersPost({ action: "reactivate", userId });
}