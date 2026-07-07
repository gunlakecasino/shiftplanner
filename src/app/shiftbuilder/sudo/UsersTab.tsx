"use client";

/**
 * Users Tab — operator lifecycle: create, role, granular permissions, temporary PINs.
 * Only visible to sudo_admin (enforced in SettingsShell).
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  createUser,
  deactivateUser,
  issueTemporaryPin,
  listAllUsers,
  reactivateUser,
  updateUserProfile,
  type SudoUser,
} from "@/lib/shiftbuilder/adminUsersClient";
import type { OpsRole, ShiftBuilderPermissions } from "@/lib/auth/opsAuth";
import {
  roleLabel,
  roleOptionsForUser,
  sanitizePermissionOverrides,
} from "@/lib/auth/permissionCatalog";
import { PermissionMatrix } from "../components/PermissionMatrix";
import { AdminPinConfirmModal } from "../components/AdminPinConfirmModal";
import { useToast } from "@/app/shiftbuilder/hooks/useToast";
import { useConfirm } from "../components/ConfirmDialog";
import { SudoTabLoading } from "./SudoGlass";
import { logSettingsAudit } from "@/lib/shiftbuilder/opsAuditLog";
import { useOpsAuth } from "@/lib/auth/opsAuth";
interface UsersTabProps {
  onDataChanged?: () => void;
  isDark?: boolean;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function TemporaryPinModal({
  open,
  operatorName,
  temporaryPin,
  context,
  onClose,
  isDark,
}: {
  open: boolean;
  operatorName: string;
  temporaryPin: string;
  context: "create" | "reset";
  onClose: () => void;
  isDark?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(temporaryPin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "w-full max-w-md rounded-2xl border p-6 shadow-2xl",
          isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10",
        )}
      >
        <div className="text-lg font-semibold mb-1">
          {context === "create" ? "User created" : "Temporary PIN issued"}
        </div>
        <p className={cn("text-[13px] mb-4", isDark ? "text-zinc-400" : "text-[#6C6C72]")}>
          Give this <strong>one-time</strong> 6-digit PIN to {operatorName}. They must use it at the ShiftBuilder login screen, then choose a personal PIN.
        </p>

        <div
          className={cn(
            "rounded-xl border px-4 py-5 text-center font-mono text-4xl tracking-[14px]",
            isDark ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300" : "border-emerald-600/30 bg-emerald-50 text-emerald-900",
          )}
        >
          {temporaryPin}
        </div>

        <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-3 leading-relaxed">
          This PIN is shown once. It is not stored in plaintext. If lost, use &quot;Reset PIN&quot; on the user profile.
        </p>

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={() => void copy()}
            className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
          >
            {copied ? "Copied" : "Copy PIN"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-[#B89708] text-white text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function UsersTab({ onDataChanged, isDark = false }: UsersTabProps) {
  const { user: currentOperator } = useOpsAuth();
  const [users, setUsers] = React.useState<SudoUser[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selectedUser, setSelectedUser] = React.useState<SudoUser | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [issuingPin, setIssuingPin] = React.useState(false);
  const { showToast } = useToast();
  const confirmDialog = useConfirm();

  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newUser, setNewUser] = React.useState({
    full_name: "",
    username: "",
    email: "",
    role: "viewer" as OpsRole,
    permissions: null as Partial<ShiftBuilderPermissions> | null,
  });

  const [pinReveal, setPinReveal] = React.useState<{
    operatorName: string;
    temporaryPin: string;
    context: "create" | "reset";
  } | null>(null);

  const [selectedUserBaselineRole, setSelectedUserBaselineRole] = React.useState<string | null>(
    null,
  );

  const [adminPinPrompt, setAdminPinPrompt] = React.useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: (pin: string) => Promise<void>;
  } | null>(null);
  const [adminPinBusy, setAdminPinBusy] = React.useState(false);
  const [adminPinError, setAdminPinError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listAllUsers();
      setUsers(rows);
    } catch (e) {
      console.error(e);
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q),
    );
  }, [users, search]);

  const openUser = (u: SudoUser) => {
    setSelectedUser({ ...u });
    setSelectedUserBaselineRole(u.role);
  };

  const closeDrawer = () => {
    setSelectedUser(null);
    setSelectedUserBaselineRole(null);
  };

  const audit = (details: Record<string, unknown>) => {
    logSettingsAudit({
      tab: "users",
      action: "user_update",
      operator: currentOperator,
      details,
    });
  };

  const persistUserProfile = async (adminPin?: string) => {
    if (!selectedUser) return;
    setSaving(true);
    setAdminPinError(null);
    try {
      await updateUserProfile(
        selectedUser.id,
        {
          role: selectedUser.role,
          permissions: sanitizePermissionOverrides(selectedUser.permissions),
        },
        adminPin ? { adminPin } : undefined,
      );
      await refresh();
      onDataChanged?.();
      audit({
        event: "profile_update",
        targetUserId: selectedUser.id,
        role: selectedUser.role,
      });
      showToast(`Saved privileges for ${selectedUser.full_name || selectedUser.username}`, "success");
      setAdminPinPrompt(null);
      closeDrawer();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (adminPinPrompt) {
        setAdminPinError(msg);
      } else {
        showToast(`Failed to save: ${msg}`, "error");
      }
    } finally {
      setSaving(false);
      setAdminPinBusy(false);
    }
  };

  const saveUser = async () => {
    if (!selectedUser) return;
    const roleChanging =
      selectedUserBaselineRole !== null && selectedUser.role !== selectedUserBaselineRole;

    if (roleChanging) {
      setAdminPinError(null);
      setAdminPinPrompt({
        title: "Confirm role change",
        description: `Re-enter your sudo_admin PIN to change ${selectedUser.full_name}'s role from ${roleLabel(selectedUserBaselineRole!)} to ${roleLabel(selectedUser.role)}.`,
        confirmLabel: "Save role change",
        onConfirm: async (pin) => {
          setAdminPinBusy(true);
          await persistUserProfile(pin);
        },
      });
      return;
    }

    await persistUserProfile();
  };

  const handleIssueTempPin = (user: SudoUser) => {
    setAdminPinError(null);
    setAdminPinPrompt({
      title: "Issue temporary PIN",
      description: `Re-enter your sudo_admin PIN to issue a new temporary PIN for ${user.full_name}. Their current PIN will stop working until they choose a personal one.`,
      confirmLabel: "Issue PIN",
      onConfirm: async (adminPin) => {
        setAdminPinBusy(true);
        setIssuingPin(true);
        try {
          const temporaryPin = await issueTemporaryPin(user.id, adminPin);
          await refresh();
          onDataChanged?.();
          audit({ event: "pin_reset", targetUserId: user.id });
          setAdminPinPrompt(null);
          setPinReveal({
            operatorName: user.full_name || user.username,
            temporaryPin,
            context: "reset",
          });
          if (selectedUser?.id === user.id) {
            setSelectedUser((prev) =>
              prev
                ? { ...prev, must_change_pin: true, pin_issued_at: new Date().toISOString() }
                : prev,
            );
          }
        } catch (e: unknown) {
          setAdminPinError(e instanceof Error ? e.message : String(e));
        } finally {
          setIssuingPin(false);
          setAdminPinBusy(false);
        }
      },
    });
  };

  const handleCreateUser = async () => {
    if (!newUser.full_name.trim() || !newUser.username.trim()) {
      showToast("Full name and username are required.", "error");
      return;
    }

    setCreating(true);
    const displayName = newUser.full_name.trim();
    const createdUsername = newUser.username.trim();
    const createdRole = newUser.role;
    try {
      const result = await createUser({
        full_name: displayName,
        username: createdUsername,
        email: newUser.email.trim() || null,
        role: createdRole,
        permissions: sanitizePermissionOverrides(newUser.permissions),
      });

      await refresh();
      onDataChanged?.();
      audit({
        event: "user_create",
        targetUserId: result.userId,
        role: createdRole,
      });

      setShowCreateModal(false);
      setNewUser({
        full_name: "",
        username: "",
        email: "",
        role: "viewer",
        permissions: null,
      });

      setPinReveal({
        operatorName: displayName,
        temporaryPin: result.temporaryPin,
        context: "create",
      });
    } catch (e: unknown) {
      showToast(`Failed to create user: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (user: SudoUser) => {
    const ok = await confirmDialog(
      "They will no longer be able to log in.",
      { title: `Deactivate ${user.full_name}?`, confirmLabel: "Deactivate", tone: "danger" },
    );
    if (!ok) return;
    try {
      await deactivateUser(user.id);
      await refresh();
      onDataChanged?.();
      audit({ event: "deactivate", targetUserId: user.id });
      if (selectedUser?.id === user.id) {
        setSelectedUser((prev) => (prev ? { ...prev, is_active: false } : prev));
      }
      showToast(`${user.full_name || user.username} deactivated`, "success");
    } catch (e: unknown) {
      showToast(`Failed to deactivate: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  const handleReactivate = async (user: SudoUser) => {
    try {
      await reactivateUser(user.id);
      await refresh();
      onDataChanged?.();
      audit({ event: "reactivate", targetUserId: user.id });
      if (selectedUser?.id === user.id) {
        setSelectedUser((prev) => (prev ? { ...prev, is_active: true } : prev));
      }
      showToast(`${user.full_name || user.username} reactivated`, "success");
    } catch (e: unknown) {
      showToast(`Failed to reactivate: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-[15px]">Users &amp; Privileges</h2>
          <p className="text-[12px] text-[#6C6C72] dark:text-[#8E8E93]">
            Add operators, assign roles, set per-feature access, and reset PINs.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#B89708] text-white hover:bg-[#A07F07]"
          >
            + Add User
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs px-3 py-1.5 rounded-lg border hover:bg-black/5 dark:hover:bg-white/5"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-black/10 dark:border-white/10">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, username, or role…"
          className="w-full px-3 py-2 rounded-xl border text-sm bg-white dark:bg-[#111113] border-black/10 dark:border-white/10"
        />
      </div>

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
                  "sb-list-row w-full text-left flex items-center justify-between px-4 py-3 rounded-2xl border cursor-pointer gap-3",
                  isDark ? "border-white/10 hover:bg-white/5" : "border-black/10 hover:bg-black/5",
                )}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.full_name}</div>
                  <div className="text-xs text-[#6C6C72] dark:text-[#8E8E93] font-mono truncate">
                    {u.username} · {roleLabel(u.role)}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                  <span
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full font-medium tracking-wide",
                      u.role === "sudo_admin"
                        ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                        : "bg-sky-500/10 text-sky-700 dark:text-sky-300",
                    )}
                  >
                    {roleLabel(u.role)}
                  </span>
                  {u.must_change_pin && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                      Temp PIN
                    </span>
                  )}
                  <span className="text-xs px-2 py-0.5 rounded bg-black/5 dark:bg-white/5">
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-[#6C6C72]">No users match your search.</div>
            )}
          </div>
        )}
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 z-[10020] flex justify-end bg-black/30 backdrop-blur-sm"
          onClick={closeDrawer}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full max-w-[540px] h-full flex flex-col border-l",
              isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10",
            )}
          >
            <div className="flex-1 overflow-auto p-6">
            <div className="flex justify-between items-start mb-6 gap-3">
              <div>
                <div className="font-semibold text-lg">{selectedUser.full_name}</div>
                <div className="text-sm text-[#6C6C72]">
                  @{selectedUser.username} · {roleLabel(selectedUser.role)}
                </div>
              </div>
              <button type="button" onClick={closeDrawer} className="text-xl leading-none px-2">
                ×
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6 text-[11px]">
              <div className={cn("rounded-xl border px-3 py-2", isDark ? "border-white/10" : "border-black/10")}>
                <div className="text-[#8E8E93] uppercase tracking-wide">PIN issued</div>
                <div className="font-mono mt-0.5">{formatWhen(selectedUser.pin_issued_at)}</div>
              </div>
              <div className={cn("rounded-xl border px-3 py-2", isDark ? "border-white/10" : "border-black/10")}>
                <div className="text-[#8E8E93] uppercase tracking-wide">Last PIN change</div>
                <div className="font-mono mt-0.5">{formatWhen(selectedUser.last_pin_change_at)}</div>
              </div>
            </div>

            {selectedUser.must_change_pin && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                Waiting for operator to replace temporary PIN on first login.
              </div>
            )}

            <div className="space-y-6">
              <div>
                <label className="text-xs uppercase tracking-wider text-[#6C6C72] mb-1 block">
                  Base role
                </label>
                <select
                  value={selectedUser.role}
                  onChange={(e) =>
                    setSelectedUser({ ...selectedUser, role: e.target.value })
                  }
                  className="w-full border rounded-xl px-3 py-2 text-sm bg-transparent"
                >
                  {roleOptionsForUser(selectedUser.role).map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-[#6C6C72] mt-1">
                  {roleOptionsForUser(selectedUser.role).find((r) => r.value === selectedUser.role)?.description}
                </p>
              </div>

              <PermissionMatrix
                role={selectedUser.role as OpsRole}
                overrides={selectedUser.permissions as Partial<ShiftBuilderPermissions> | null}
                onChange={(permissions) =>
                  setSelectedUser({ ...selectedUser, permissions })
                }
                isDark={isDark}
              />
            </div>

              <p className="text-[10px] text-[#6C6C72] mt-6 text-center">
                Permission overrides apply within about a minute via live session refresh.
              </p>
            </div>

            <div
              className={cn(
                "shrink-0 border-t px-4 py-3 flex flex-col gap-2.5",
                isDark ? "border-white/10 bg-[#111113]" : "border-black/10 bg-white",
              )}
            >
              <button
                type="button"
                onClick={() => void saveUser()}
                disabled={saving}
                className="w-full py-2.5 rounded-xl bg-[#B89708] text-white font-medium disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save role & privileges"}
              </button>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => void handleIssueTempPin(selectedUser)}
                  disabled={issuingPin || !selectedUser.is_active}
                  className="flex-1 py-2.5 rounded-xl border font-medium text-sm hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50"
                >
                  {issuingPin ? "Issuing…" : "Reset PIN"}
                </button>

                {selectedUser.is_active ? (
                  <button
                    type="button"
                    onClick={() => void handleDeactivate(selectedUser)}
                    className="flex-1 py-2.5 rounded-xl border border-red-500/30 text-red-600 text-sm font-medium hover:bg-red-500/5"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleReactivate(selectedUser)}
                    className="flex-1 py-2.5 rounded-xl border border-emerald-500/30 text-emerald-600 text-sm font-medium hover:bg-emerald-500/5"
                  >
                    Reactivate
                  </button>
                )}
              </div>

              {!selectedUser.is_active && (
                <p className="text-[11px] text-amber-700 dark:text-amber-400 text-center">
                  Reactivate this account to reset its PIN.
                </p>
              )}

              <button type="button" onClick={closeDrawer} className="w-full py-2 rounded-xl border text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div
          className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-full max-w-lg max-h-[90vh] overflow-auto rounded-2xl border p-6",
              isDark ? "bg-[#111113] border-white/10" : "bg-white border-black/10",
            )}
          >
            <h3 className="text-lg font-semibold mb-1">Add operator</h3>
            <p className="text-[12px] text-[#6C6C72] mb-4">
              A random 6-digit temporary PIN will be generated. The operator must set a personal PIN on first login.
            </p>

            <div className="space-y-3 mb-5">
              <input
                type="text"
                placeholder="Full name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-transparent"
              />
              <input
                type="text"
                placeholder="Username (unique)"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-transparent"
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm bg-transparent"
              />
              <select
                value={newUser.role}
                onChange={(e) =>
                  setNewUser({ ...newUser, role: e.target.value as OpsRole, permissions: null })
                }
                className="w-full border rounded-xl px-3 py-2 text-sm bg-transparent"
              >
                {roleOptionsForUser(newUser.role).map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <PermissionMatrix
              role={newUser.role}
              overrides={newUser.permissions}
              onChange={(permissions) => setNewUser({ ...newUser, permissions })}
              isDark={isDark}
              compact
            />

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => void handleCreateUser()}
                disabled={creating}
                className="flex-1 py-2.5 rounded-xl bg-[#B89708] text-white font-medium disabled:opacity-60"
              >
                {creating ? "Creating…" : "Create & reveal PIN"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-6 rounded-xl border"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <TemporaryPinModal
        open={!!pinReveal}
        operatorName={pinReveal?.operatorName ?? ""}
        temporaryPin={pinReveal?.temporaryPin ?? ""}
        context={pinReveal?.context ?? "create"}
        onClose={() => setPinReveal(null)}
        isDark={isDark}
      />

      <AdminPinConfirmModal
        open={!!adminPinPrompt}
        title={adminPinPrompt?.title ?? ""}
        description={adminPinPrompt?.description ?? ""}
        confirmLabel={adminPinPrompt?.confirmLabel}
        busy={adminPinBusy || saving || issuingPin}
        error={adminPinError}
        onConfirm={async (pin) => {
          if (!adminPinPrompt) return;
          await adminPinPrompt.onConfirm(pin);
        }}
        onCancel={() => {
          if (adminPinBusy || saving || issuingPin) return;
          setAdminPinPrompt(null);
          setAdminPinError(null);
        }}
        isDark={isDark}
      />
    </div>
  );
}