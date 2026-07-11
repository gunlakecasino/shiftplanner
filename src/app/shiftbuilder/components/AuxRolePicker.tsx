"use client";

import React, { useRef, useEffect } from "react";
import type { AuxRole } from "@/lib/shiftbuilder/placement";
import {
  AUX_ROLE_ICONS,
  AUX_ROLE_COLORS,
  AUX_ROLE_SHORT_CODE,
} from "@/lib/shiftbuilder/constants";

type RoleOption = {
  role: Exclude<AuxRole, "blank">;
  label: string;
  hint: string;
  code: string;
};

/** Grouped menu — permanent core first, then floor runs, then people roles. */
const ROLE_GROUPS: Array<{ id: string; title: string; options: RoleOption[] }> = [
  {
    id: "core",
    title: "Always on board",
    options: [
      { role: "admin", label: "Admin", hint: "Floor admin", code: "ADMIN" },
      { role: "z9sr", label: "Z9 Smoking Room", hint: "Zone 9 SR", code: "Z9SR" },
    ],
  },
  {
    id: "floor",
    title: "Floor runs (1 or 2)",
    options: [
      { role: "oasis", label: "Oasis", hint: "Oasis 1 or 2", code: "OAS" },
      { role: "trash", label: "Trash", hint: "Trash 1 or 2", code: "TSH" },
      { role: "support", label: "Support", hint: "Support 1 or 2", code: "SUP" },
    ],
  },
  {
    id: "people",
    title: "People & coverage",
    options: [
      { role: "job_coach", label: "Job Coach", hint: "One per night", code: "JC" },
      { role: "step_up", label: "Step Up", hint: "One per night", code: "STEP" },
    ],
  },
];

export interface AuxRolePickerProps {
  onSelect: (role: Exclude<AuxRole, "blank">) => void;
  /** Blank-role shell with operator-entered header text (role stays blank). */
  onCustomLabel?: (label: string) => void;
  /** Reset role + label back to unset "Set role" shell. */
  onClearRole?: () => void;
  showClearRole?: boolean;
  onClose?: () => void;
  className?: string;
  initialCustomLabel?: string;
  /** Highlight the card's current role in the menu. */
  currentRole?: AuxRole;
}

const AuxRolePicker: React.FC<AuxRolePickerProps> = ({
  onSelect,
  onCustomLabel,
  onClearRole,
  showClearRole = false,
  onClose,
  className = "",
  initialCustomLabel = "",
  currentRole,
}) => {
  const [mode, setMode] = React.useState<"roles" | "custom">("roles");
  const [customDraft, setCustomDraft] = React.useState(initialCustomLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "custom") inputRef.current?.focus();
  }, [mode]);

  const applyCustom = () => {
    const trimmed = customDraft.trim();
    if (!trimmed || !onCustomLabel) return;
    onCustomLabel(trimmed);
    onClose?.();
  };

  const stopKeyBubble = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  const fontUi = {
    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
  } as const;

  if (mode === "custom") {
    return (
      <div
        data-aux-role-picker
        className={`sb-aux-role-picker w-[220px] rounded-xl border border-[#E5E7EB] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] p-3 shadow-2xl shadow-black/15 ${className}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={stopKeyBubble}
        onKeyDownCapture={stopKeyBubble}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280] dark:text-[#9CA3AF]"
            style={fontUi}
          >
            Custom label
          </span>
          <button
            type="button"
            className="text-[10px] font-semibold text-[#007AFF] dark:text-[#0A84FF]"
            onClick={() => {
              setMode("roles");
              setCustomDraft(initialCustomLabel);
            }}
          >
            ← Roles
          </button>
        </div>
        <p className="mb-2 text-[10px] leading-snug text-[#9CA3AF]" style={fontUi}>
          Free-form header (e.g. COFFEE RUN). Prefer a named role when it matches.
        </p>
        <input
          ref={inputRef}
          type="text"
          value={customDraft}
          data-aux-label-input
          onChange={(e) => setCustomDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              applyCustom();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setMode("roles");
              setCustomDraft(initialCustomLabel);
            }
          }}
          onKeyDownCapture={stopKeyBubble}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          placeholder="e.g. COFFEE RUN"
          className="mb-2 w-full rounded-lg border border-[#E5E7EB] dark:border-[#3A3A3C] bg-[#FAFAFA] dark:bg-[#2C2C2E] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.3px] text-[#1C1C1E] dark:text-[#F2F2F4] outline-none focus:border-[#007AFF]"
          style={fontUi}
        />
        <button
          type="button"
          disabled={!customDraft.trim()}
          className="w-full rounded-lg bg-[#1C1C1E] dark:bg-[#F2F2F4] px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.4px] text-white dark:text-[#1C1C1E] disabled:opacity-40"
          onClick={applyCustom}
        >
          Apply custom label
        </button>
      </div>
    );
  }

  return (
    <div
      data-aux-role-picker
      role="menu"
      aria-label="Choose aux role"
      className={`sb-aux-role-picker w-[240px] max-h-[min(70vh,420px)] overflow-y-auto rounded-xl border border-[#E5E7EB] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] shadow-2xl shadow-black/15 ${className}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={stopKeyBubble}
      onKeyDownCapture={stopKeyBubble}
    >
      <div className="sticky top-0 z-[1] border-b border-[#F3F4F6] dark:border-[#2C2C2E] bg-white/95 dark:bg-[#1C1C1E]/95 px-3 py-2 backdrop-blur-sm">
        <p
          className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#6B7280] dark:text-[#9CA3AF]"
          style={fontUi}
        >
          Set aux role
        </p>
        <p className="text-[10px] text-[#9CA3AF] leading-snug mt-0.5" style={fontUi}>
          Pick a role for this card. Step Up & Job Coach are here under People.
        </p>
      </div>

      <div className="flex flex-col gap-2 p-2">
        {ROLE_GROUPS.map((group) => (
          <div key={group.id}>
            <div
              className="px-1.5 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[#9CA3AF]"
              style={fontUi}
            >
              {group.title}
            </div>
            <div className="flex flex-col gap-0.5">
              {group.options.map((opt) => {
                const selected = currentRole === opt.role;
                const icon = AUX_ROLE_ICONS[opt.role] ?? "✦";
                const accent = AUX_ROLE_COLORS[opt.role] ?? "#6B7280";
                const code = AUX_ROLE_SHORT_CODE[opt.role] ?? opt.code;
                return (
                  <button
                    key={opt.role}
                    type="button"
                    role="menuitem"
                    aria-current={selected ? "true" : undefined}
                    title={`${opt.label} (${code}) — ${opt.hint}`}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      selected
                        ? "bg-[#007AFF14] ring-1 ring-[#007AFF44]"
                        : "hover:bg-[#F3F4F6] dark:hover:bg-[#2C2C2E]"
                    }`}
                    onClick={() => {
                      onSelect(opt.role);
                      onClose?.();
                    }}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] font-bold"
                      style={{
                        backgroundColor: `${accent}22`,
                        color: accent,
                      }}
                      aria-hidden
                    >
                      {icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className="block text-[12px] font-bold text-[#1C1C1E] dark:text-[#F2F2F4] leading-tight"
                        style={fontUi}
                      >
                        {opt.label}
                      </span>
                      <span
                        className="block text-[10px] text-[#9CA3AF] leading-tight"
                        style={fontUi}
                      >
                        {opt.hint}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-md bg-[#F3F4F6] dark:bg-[#2C2C2E] px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wide text-[#6B7280] dark:text-[#9CA3AF]"
                      style={fontUi}
                    >
                      {code}
                    </span>
                    {selected ? (
                      <span className="text-[11px] text-[#007AFF]" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[#F3F4F6] dark:border-[#2C2C2E] p-2 flex flex-col gap-0.5">
        {onCustomLabel ? (
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#007AFF55] px-2 py-1.5 text-left text-[11px] font-bold text-[#007AFF] dark:text-[#0A84FF] hover:bg-[#007AFF0A]"
            style={fontUi}
            onClick={() => {
              setCustomDraft(initialCustomLabel);
              setMode("custom");
            }}
          >
            <span className="text-[14px] leading-none">✎</span>
            <span>
              Custom label…
              <span className="block text-[9px] font-medium opacity-70 normal-case tracking-normal">
                Only if no role above fits
              </span>
            </span>
          </button>
        ) : null}
        {showClearRole && onClearRole ? (
          <button
            type="button"
            role="menuitem"
            className="mt-0.5 w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-bold text-[#DC2626] dark:text-[#F87171] hover:bg-[#FEE2E2] dark:hover:bg-[#3A2020]"
            style={fontUi}
            onClick={() => {
              onClearRole();
              onClose?.();
            }}
          >
            Clear role
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default AuxRolePicker;
