"use client";

import React, { useRef, useEffect } from "react";
import type { AuxRole } from "@/lib/shiftbuilder/placement";

const ROLE_OPTIONS: Array<{ role: Exclude<AuxRole, "blank">; label: string }> = [
  { role: "z9sr", label: "Z9 SR" },
  { role: "admin", label: "Admin" },
  { role: "trash", label: "Trash" },
  { role: "support", label: "Support" },
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
}

const AuxRolePicker: React.FC<AuxRolePickerProps> = ({
  onSelect,
  onCustomLabel,
  onClearRole,
  showClearRole = false,
  onClose,
  className = "",
  initialCustomLabel = "",
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

  if (mode === "custom") {
    return (
      <div
        data-aux-role-picker
        className={`sb-aux-role-picker flex flex-col gap-1.5 rounded-[4px] border border-[#E5E7EB] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] p-2 shadow-lg min-w-[148px] ${className}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={stopKeyBubble}
        onKeyDownCapture={stopKeyBubble}
      >
        <span
          className="text-[8px] font-bold uppercase tracking-[1px] text-[#6B7280] dark:text-[#9CA3AF]"
          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
        >
          Custom label
        </span>
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
          className="w-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.3px] rounded-[3px] border border-[#E5E7EB] dark:border-[#3A3A3C] bg-[#FAFAFA] dark:bg-[#2C2C2E] text-[#1C1C1E] dark:text-[#F2F2F4] outline-none focus:border-[#007AFF]"
          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
        />
        <div className="flex gap-1">
          <button
            type="button"
            disabled={!customDraft.trim()}
            className="flex-1 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.4px] rounded-[2px] bg-[#1C1C1E] text-white disabled:opacity-40"
            onClick={applyCustom}
          >
            Apply
          </button>
          <button
            type="button"
            className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.4px] rounded-[2px] hover:bg-[#F3F4F6] dark:hover:bg-[#2C2C2E] text-[#6B7280] dark:text-[#9CA3AF]"
            onClick={() => {
              setMode("roles");
              setCustomDraft(initialCustomLabel);
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-aux-role-picker
      className={`sb-aux-role-picker flex flex-col gap-1 rounded-[4px] border border-[#E5E7EB] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] p-1 shadow-lg ${className}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={stopKeyBubble}
      onKeyDownCapture={stopKeyBubble}
    >
      <div className="flex flex-row flex-wrap gap-1 max-w-[200px]">
        {ROLE_OPTIONS.map(({ role, label }) => (
          <button
            key={role}
            type="button"
            className="text-left px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.4px] rounded-[2px] hover:bg-[#F3F4F6] dark:hover:bg-[#2C2C2E] text-[#374151] dark:text-[#E5E7EB] whitespace-nowrap"
            onClick={() => {
              onSelect(role);
              onClose?.();
            }}
          >
            {label}
          </button>
        ))}
        {onCustomLabel ? (
          <button
            type="button"
            className="text-left px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.4px] rounded-[2px] hover:bg-[#F3F4F6] dark:hover:bg-[#2C2C2E] text-[#007AFF] dark:text-[#0A84FF] whitespace-nowrap border border-dashed border-[#007AFF44]"
            onClick={() => {
              setCustomDraft(initialCustomLabel);
              setMode("custom");
            }}
          >
            Custom
          </button>
        ) : null}
      </div>
      {showClearRole && onClearRole ? (
        <button
          type="button"
          className="mt-0.5 w-full text-left px-2 py-1 text-[9px] font-bold uppercase tracking-[0.4px] rounded-[2px] hover:bg-[#FEE2E2] dark:hover:bg-[#3A2020] text-[#DC2626] dark:text-[#F87171] border-t border-[#E5E7EB] dark:border-[#3A3A3C] pt-1.5"
          onClick={() => {
            onClearRole();
            onClose?.();
          }}
        >
          Clear role
        </button>
      ) : null}
    </div>
  );
};

export default AuxRolePicker;