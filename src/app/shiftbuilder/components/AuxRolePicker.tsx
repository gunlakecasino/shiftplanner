"use client";

import React from "react";
import type { AuxRole } from "@/lib/shiftbuilder/placement";
const ROLE_OPTIONS: Array<{ role: Exclude<AuxRole, "blank">; label: string }> = [
  { role: "z9sr", label: "Z9 SR" },
  { role: "admin", label: "Admin" },
  { role: "trash", label: "Trash" },
  { role: "support", label: "Support" },
];

export interface AuxRolePickerProps {
  onSelect: (role: Exclude<AuxRole, "blank">) => void;
  onClose?: () => void;
  className?: string;
}

const AuxRolePicker: React.FC<AuxRolePickerProps> = ({
  onSelect,
  onClose,
  className = "",
}) => {
  return (
    <div
      className={`sb-aux-role-picker flex flex-col gap-0.5 rounded-[4px] border border-[#E5E7EB] dark:border-[#3A3A3C] bg-white dark:bg-[#1C1C1E] p-1 shadow-lg min-w-[120px] ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {ROLE_OPTIONS.map(({ role, label }) => (
        <button
          key={role}
          type="button"
          className="text-left px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.4px] rounded-[2px] hover:bg-[#F3F4F6] dark:hover:bg-[#2C2C2E] text-[#374151] dark:text-[#E5E7EB]"
          onClick={() => {
            onSelect(role);
            onClose?.();
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default AuxRolePicker;