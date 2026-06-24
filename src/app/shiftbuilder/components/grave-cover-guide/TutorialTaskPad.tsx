"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import { getZoneColor } from "@/lib/shiftbuilder/constants";
import type { TutorialSlotKey } from "./tutorialScenario";

type TutorialTaskPadProps = {
  slotKey: TutorialSlotKey;
  onAdd: (label: string) => void;
  onClose: () => void;
  suggestedLabel?: string;
};

export function TutorialTaskPad({
  slotKey,
  onAdd,
  onClose,
  suggestedLabel = "Monitor Z8 — thin",
}: TutorialTaskPadProps) {
  const [value, setValue] = React.useState(suggestedLabel);
  const accent = getZoneColor(slotKey);

  return (
    <div className="sb-guide-task-pad" onClick={(e) => e.stopPropagation()}>
      <div className="sb-guide-task-pad__card">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold tracking-[0.12em] uppercase" style={{ color: accent }}>
            {slotKey} tasks
          </p>
          <button type="button" onClick={onClose} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
            <X className="w-3 h-3 text-gray-500" />
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2">Same as live board — double-click task rows to edit.</p>
        <div className="flex gap-1">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="flex-1 text-[12px] border border-gray-200 rounded-xl px-3 py-2 outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) onAdd(value.trim());
            }}
          />
          <button
            type="button"
            onClick={() => value.trim() && onAdd(value.trim())}
            className="px-3 py-2 rounded-xl text-white text-[12px] font-semibold flex items-center gap-1"
            style={{ background: accent }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}