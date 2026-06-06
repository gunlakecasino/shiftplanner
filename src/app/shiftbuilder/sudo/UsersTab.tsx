"use client";

/**
 * Users Tab — Granular per-operator privilege management inside Sudo.
 *
 * This replaces the old coarse role-only model + separate /today page.
 * sudo_admin users can now give very specific access to each person.
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  listAllUsers,
  updateUserPermissions,
  updateUserRole,
  createUser,
  deactivateUser,
  reactivateUser,
  type SudoUser,
} from "@/lib/shiftbuilder/sudoActions";

import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuth";
import { getPermissionsForRole, mergePermissions } from "@/lib/auth/opsAuth";
import { useToast } from "@/app/shiftbuilder/hooks/useToast";
import { SudoTabLoading } from "./SudoGlass";

interface UsersTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
}

const PERMISSION_LABELS: Array<{
  key: keyof ShiftBuilderPermissions;
  label: string;
  group: string;
  description: string;
}> = [
  { key: "canSeeDraftData", label: "View Unpublished / Draft Schedules", group: "Viewing", description: "Can see schedules that have not been published yet" },
  { key: "canEditAssignments", label: "Edit Assignments", group: "Editing", description: "Can drag & drop TMs on the board" },
  { key: "canLockUnlock", label: "Lock / Unlock Slots", group: "Editing", description: "Can lock individual positions from further changes" },
  { key: "canApplySchedules", label: "Apply Schedules", group: "Schedules", description: "Can apply uploaded ADP schedules to the live board" },
  { key: "canPublish", label: "Publish / Unpublish Weeks & Days", group: "Schedules", description: "Can mark schedules as officially published (and lock them)" },
  { key: "canRunEngine", label: "Run Engine / Batch Planner", group: "Advanced", description: "Can trigger the scheduling engine" },
  { key: "canManageTeam", label: "Manage Team Roster", group: "Advanced", description: "Can create/edit TMs in the Team tab" },
  { key: "canAccessSudo", label: "Access Sudo Panel", group: "Administrative", description: "Can open the full Sudo administrative area" },
];

export function UsersTab({ onDataChanged, isDark = false }: UsersTabProps) {
  const [users, setUsers] = React.useState<SudoUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<SudoUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { showToast } = useToast();

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [newUser, setNewUser] = React.useState({
    full_name: "",
    username: "",
    email: "",
    role: "utility_ops_super",
    pin: "",
    confirmPin: "",
  });
  const [creating, setCreating] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllUsers();
      setUsers(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.full_name.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  const openUser = (u: SudoUser) => {
    setSelectedUser({ ...u });
  };

  // Compute what the user will actually have (role defaults + their overrides)
  const effectivePermissions = React.useMemo(() => {
    if (!selectedUser) return null;
    const base = getPermissionsForRole(selectedUser.role as any);
    return mergePermissions(base, selectedUser.permissions);
  }, [selectedUser]);

  const getEffectiveValue = (key: keyof ShiftBuilderPermissions) => {
    if (!effectivePermissions) return undefined;
    return effectivePermissions[key];
  };

  const closeDrawer = () => setSelectedUser(null);

  const saveUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await updateUserPermissions(selectedUser.id, selectedUser.permissions ?? null);
      await updateUserRole(selectedUser.id, selectedUser.role);
      await refresh();
      onDataChanged?.();
      showToast(`Permissions updated for ${selectedUser.full_name || selectedUser.username}`, "success");
      closeDrawer();
    } catch (e: any) {
      showToast("Failed to save privileges: " + (e?.message || e), "error");
    } finally {
      setSaving(false);
    }
  };

  const updatePermission = (key: keyof ShiftBuilderPermissions, value: any) => {
    if (!selectedUser) return;

    const base = getPermissionsForRole(selectedUser.role as any);
    const current = { ...(selectedUser.permissions ?? {}) };

    // If the value matches the role default, remove the override key entirely
    if (value === base[key]) {
      delete current[key];
    } else {
      current[key] = value;
    }

    setSelectedUser({
      ...selectedUser,
      permissions: Object.keys(current).length > 0 ? current : null,
    });
  };

  const resetToRoleDefaults = () => {
    if (!selectedUser) return;
    setSelectedUser({
      ...selectedUser,
      permissions: null, // null = inherit from role
    });
  };

  const handleCreateUser = async () => {
    if (!newUser.full_name || !newUser.username || !newUser.pin) {
      showToast("Full name, username, and PIN are required.", "error");
      return;
    }
    if (newUser.pin !== newUser.confirmPin) {
      showToast("PINs do not match.", "error");
      return;
    }
    if (newUser.pin.length < 4) {
      showToast("PIN must be at least 4 digits.", "error");
      return;
    }

    setCreating(true);
    try {
      await createUser({
        full_name: newUser.full_name,
        username: newUser.username,
        email: newUser.email || null,
        role: newUser.role,
        pin: newUser.pin,
      });

      // Refresh list
      await refresh();
      onDataChanged?.();

      // Reset form and close modal
      setNewUser({ full_name: "", username: "", email: "", role: "utility_ops_super", pin: "", confirmPin: "" });
      setShowCreateModal(false);

      showToast("User created. You can now edit their privileges in the drawer.", "success");
    } catch (e: any) {
      showToast("Failed to create user: " + (e.message || e), "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (user: SudoUser) => {
    if (!confirm(`Deactivate user ${user.full_name}? They will no longer be able to log in.`)) return;

    try {
      await deactivateUser(user.id);
      await refresh();
      onDataChanged?.();
      showToast(`${user.full_name || user.username} deactivated`, "success");
    } catch (e: any) {
      showToast("Failed to deactivate: " + (e.message || e), "error");
    }
  };

  const handleReactivate = async (user: SudoUser) => {
    try {
      await reactivateUser(user.id);
      await refresh();
      onDataChanged?.();
      showToast(`${user.full_name || user.username} reactivated`, "success");
    } catch (e: any) {
      showToast("Failed to reactivate: " + (e.message || e), "error");
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-[15px]">Users &amp; Privileges</h2>
          <p className="text-[12px] text-[#6C6C72] dark:text-[#8E8E93]">
            Granular control over what each operator can see and do.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#B89708] text-white hover:bg-[#A07F07]"
          >
            + Add User
          </button>
          <button
            onClick={refresh}
            className="text-xs px-3 py-1.5 rounded-lg border hover:bg-black/5 dark:hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3 border-b border-black/10 dark:border-white/10">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, username, or role…"
          className="w-full px-3 py-2 rounded-xl border text-sm bg-white dark:bg-[#111113] border-black/10 dark:border-white/10"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="p-8 flex justify-center">
            <SudoTabLoading>Loading users</SudoTabLoading>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((u) => (
              <div
                key={u.id}
                role="button"
                tabIndex={0}
                onClick={() => openUser(u)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openUser(u);
                  }
                }}
                className={cn(
                  "sb-list-row w-full text-left flex items-center justify-between px-4 py-3 rounded-2xl border cursor-pointer",
                  isDark
                    ? "border-white/10 hover:bg-white/5"
                    : "border-black/10 hover:bg-black/5"
                )}
              >
                <div>
                  <div className="font-medium">{u.full_name}</div>
                  <div className="text-xs text-[#6C6C72] dark:text-[#8E8E93] font-mono">
                    {u.username} · {u.role}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/5">
                    {u.is_active ? "Active" : "Inactive"}
                  </div>

                  {u.is_active ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeactivate(u);
                      }}
                      className="text-xs px-2 py-0.5 rounded border border-red-500/30 text-red-500 hover:bg-red-500/10"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReactivate(u);
                      }}
                      className="text-xs px-2 py-0.5 rounded border border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-[#6C6C72]">No users match your search.</div>
            )}
          </div>
        )}
      </div>

      {/* Edit Drawer */}
      {selectedUser && (
        <div className="fixed inset-0 z-[10020] flex justify-end bg-black/30 backdrop-blur-sm" onClick={closeDrawer}>
          <div
            onClick={e => e.stopPropagation()}
            className={cn(
              "w-full max-w-[520px] h-full overflow-auto border-l p-6",
              isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10"
            )}
          >
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="font-semibold text-lg">{selectedUser.full_name}</div>
                <div className="text-sm text-[#6C6C72]">{selectedUser.username} · {selectedUser.role}</div>
              </div>
              <button onClick={closeDrawer} className="text-xl">×</button>
            </div>

            <div className="space-y-6">
              {/* Role (coarse) */}
              <div>
                <label className="text-xs uppercase tracking-wider text-[#6C6C72] mb-1 block">Base Role</label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => setSelectedUser({ ...selectedUser, role: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                >
                  {["sudo_admin", "admin", "ops_director", "ops_manager", "graves_ops_super", "days_ops_super", "swings_ops_super", "utility_ops_super"].map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[#6C6C72] mt-1">Changing the role updates the default permission template.</p>
              </div>

              {/* Granular Permissions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium">Individual Privileges</div>
                    <div className="text-[10px] text-[#6C6C72] dark:text-[#8E8E93]">
                      Toggles create overrides on top of the role defaults
                    </div>
                  </div>
                  <button
                    onClick={resetToRoleDefaults}
                    className="text-xs text-[#B89708] hover:underline"
                  >
                    Reset to Role Defaults
                  </button>
                </div>

                {PERMISSION_LABELS.map((p) => {
                  const overrideValue = selectedUser.permissions?.[p.key as keyof ShiftBuilderPermissions];
                  const isOverridden = overrideValue !== undefined && overrideValue !== null;
                  const effectiveValue = getEffectiveValue(p.key as keyof ShiftBuilderPermissions);
                  const baseValue = getPermissionsForRole(selectedUser.role as any)[p.key];

                  return (
                    <div key={p.key} className="py-3 border-b last:border-b-0 border-black/10 dark:border-white/10">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 pr-4">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {p.label}
                            {isOverridden && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">OVERRIDE</span>
                            )}
                          </div>
                          <div className="text-xs text-[#6C6C72] dark:text-[#8E8E93]">{p.description}</div>
                          <div className="text-[10px] mt-0.5 text-[#8E8E93]">
                            Base from role: <span className="font-mono">{String(baseValue)}</span>
                            {isOverridden && <> → Effective: <span className="font-mono font-medium">{String(effectiveValue)}</span></>}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={!!(isOverridden ? overrideValue : effectiveValue)}
                            onChange={(e) => updatePermission(p.key, e.target.checked)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button
                onClick={saveUser}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-[#B89708] text-white font-medium disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              <button onClick={closeDrawer} className="px-6 rounded-xl border">
                Cancel
              </button>
            </div>

            <p className="text-[10px] text-[#6C6C72] mt-4 text-center">
              Changes take effect on next login or page refresh for that operator.
            </p>

            <div className="mt-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-700 dark:text-amber-400">
              Note: Per current policy, only sudo_admin and graves_ops_super roles can view unpublished schedules by default.
              You can still grant the override here — the global rule takes precedence for safety.
            </div>

            {selectedUser && !["sudo_admin", "graves_ops_super"].includes(selectedUser.role) && selectedUser.permissions?.canSeeDraftData && (
              <div className="mt-2 p-2 rounded bg-red-500/10 text-red-600 text-[10px]">
                Warning: This role is hard-clamped to never see unpublished data, regardless of this override.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowCreateModal(false)}>
          <div
            onClick={e => e.stopPropagation()}
            className={cn(
              "w-full max-w-md rounded-2xl border p-6",
              isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10"
            )}
          >
            <h3 className="text-lg font-semibold mb-4">Add New User</h3>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="text"
                placeholder="Username (for login)"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              >
                {["sudo_admin", "admin", "ops_director", "ops_manager", "graves_ops_super", "days_ops_super", "swings_ops_super", "utility_ops_super"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <input
                type="password"
                placeholder="Temporary PIN"
                value={newUser.pin}
                onChange={(e) => setNewUser({ ...newUser, pin: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
              <input
                type="password"
                placeholder="Confirm PIN"
                value={newUser.confirmPin}
                onChange={(e) => setNewUser({ ...newUser, confirmPin: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm"
              />
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreateUser}
                disabled={creating}
                className="flex-1 py-2.5 rounded-xl bg-[#B89708] text-white font-medium disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create User"}
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewUser({ full_name: "", username: "", email: "", role: "utility_ops_super", pin: "", confirmPin: "" });
                }}
                className="px-6 rounded-xl border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


