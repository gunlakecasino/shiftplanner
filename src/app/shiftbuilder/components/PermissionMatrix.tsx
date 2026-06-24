"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { OpsRole, ShiftBuilderPermissions } from "@/lib/auth/opsAuth";
import { getPermissionsForRole, mergePermissions } from "@/lib/auth/opsAuth";
import {
  PERMISSION_CATALOG,
  type PermissionKey,
} from "@/lib/auth/permissionCatalog";

type Props = {
  role: OpsRole;
  overrides: Partial<ShiftBuilderPermissions> | null;
  onChange: (overrides: Partial<ShiftBuilderPermissions> | null) => void;
  isDark?: boolean;
  compact?: boolean;
};

export function PermissionMatrix({
  role,
  overrides,
  onChange,
  isDark = false,
  compact = false,
}: Props) {
  const base = getPermissionsForRole(role);

  const effective = React.useMemo(
    () => mergePermissions(base, overrides),
    [base, overrides],
  );

  const setOverride = (key: PermissionKey, value: boolean) => {
    const next = { ...(overrides ?? {}) };
    if (value === base[key]) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(Object.keys(next).length > 0 ? next : null);
  };

  const resetToRoleDefaults = () => onChange(null);

  const groups = React.useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const def of PERMISSION_CATALOG) {
      if (!map.has(def.group)) map.set(def.group, []);
      map.get(def.group)!.push(def);
    }
    return [...map.entries()];
  }, []);

  const draftClamped =
    !["sudo_admin", "graves_ops_super"].includes(role) &&
    (overrides?.canSeeDraftData === true || effective.canSeeDraftData);

  const publishedOnlyLocked = role === "viewer" || role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-sm">Privileges</div>
          <div className={cn("text-[10px]", isDark ? "text-zinc-500" : "text-[var(--ios-label-tertiary)]")}>
            Toggles override the base role template
          </div>
        </div>
        <button
          type="button"
          onClick={resetToRoleDefaults}
          className="text-xs text-[#B89708] hover:underline shrink-0"
        >
          Reset to role defaults
        </button>
      </div>

      {groups.map(([group, defs]) => (
        <div key={group}>
          <div
            className={cn(
              "mb-2 text-[10px] font-semibold uppercase tracking-widest",
              isDark ? "text-zinc-500" : "text-[var(--ios-label-tertiary)]",
            )}
          >
            {group}
          </div>
          <div className="space-y-1">
            {defs.map((p) => {
              const overrideValue = overrides?.[p.key];
              const isOverridden = overrideValue !== undefined;
              const checked = isOverridden ? !!overrideValue : !!effective[p.key];
              const baseValue = base[p.key];
              const isLocked =
                (p.key === "canEditPublishedOnly" && publishedOnlyLocked) ||
                (p.key === "canSeeDraftData" && draftClamped);

              return (
                <label
                  key={p.key}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                    isLocked ? "cursor-not-allowed opacity-80" : "cursor-pointer",
                    isDark
                      ? "border-white/10 hover:bg-white/5"
                      : "border-black/8 hover:bg-black/[0.02]",
                    compact && "py-2",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 shrink-0"
                    checked={checked}
                    disabled={isLocked}
                    onChange={(e) => setOverride(p.key, e.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {p.label}
                      {isOverridden && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          OVERRIDE
                        </span>
                      )}
                    </div>
                    {!compact && (
                      <div className={cn("text-xs mt-0.5", isDark ? "text-zinc-500" : "text-[#6C6C72]")}>
                        {p.description}
                      </div>
                    )}
                    <div className="text-[10px] mt-0.5 text-[#8E8E93] font-mono">
                      Role default: {String(baseValue)}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      ))}

      {draftClamped && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Draft visibility is hard-clamped off for this role at login — the override is stored but will not grant unpublished access.
        </div>
      )}

      {publishedOnlyLocked && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-2 text-[11px] text-sky-900 dark:text-sky-200">
          Published-nights-only is required for the Viewer role — disabling it would grant draft access at the API layer.
        </div>
      )}
    </div>
  );
}