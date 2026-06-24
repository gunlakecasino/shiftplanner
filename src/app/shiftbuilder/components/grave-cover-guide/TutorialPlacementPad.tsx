"use client";

import React from "react";
import { X } from "lucide-react";
import { getSlotMeta } from "../MarkerPad";
import type { TutorialAssignment, TutorialSlotKey } from "./tutorialScenario";

type PadMode = "default" | "assign";

type TutorialPlacementPadProps = {
  slotKey: TutorialSlotKey;
  assignment: TutorialAssignment | null;
  mode: PadMode;
  pickerOptions: Array<{ tmId: string; tmName: string; subtitle?: string }>;
  highlightMark?: boolean;
  highlightAssign?: boolean;
  highlightPickerTmId?: string;
  onClose: () => void;
  onMarkUnavailable: () => void;
  onAssignTap: () => void;
  onSwapTap: () => void;
  onClear: () => void;
  onPickTm: (tmId: string, tmName: string) => void;
};

export function TutorialPlacementPad({
  slotKey,
  assignment,
  mode,
  pickerOptions,
  highlightMark = false,
  highlightAssign = false,
  highlightPickerTmId,
  onClose,
  onMarkUnavailable,
  onAssignTap,
  onSwapTap,
  onClear,
  onPickTm,
}: TutorialPlacementPadProps) {
  const { label, accent } = getSlotMeta(slotKey);
  const refinedName = assignment?.tmName || "Unassigned";
  const showPicker = mode === "assign";

  return (
    <div
      className="placement-pad no-print sb-guide-placement-pad"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="w-full bg-white rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.05)] flex flex-col min-h-0">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: assignment?.tmName ? accent : "#9CA3AF" }}
              >
                <span className="text-white text-[17px] font-semibold leading-none select-none">
                  {refinedName.charAt(0)}
                </span>
              </div>
              <div className="min-w-0">
                <p
                  className="text-[9px] font-bold tracking-[0.14em] uppercase mb-px"
                  style={{ color: accent }}
                >
                  {label}
                </p>
                <h2 className="text-[18px] font-bold text-gray-900 leading-tight truncate">
                  {refinedName}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
              aria-label="Close"
            >
              <X className="w-3 h-3 text-gray-500" />
            </button>
          </div>

          {assignment?.tmName && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={onMarkUnavailable}
                className={`text-[10px] font-semibold px-3 py-1 rounded-lg border border-yellow-300 text-yellow-600 bg-yellow-50 hover:bg-yellow-100 active:scale-95 transition-all ${
                  highlightMark ? "sb-guide-target sb-guide-target--pulse" : ""
                }`}
              >
                Mark unavailable
              </button>
            </div>
          )}
        </div>

        <div className="h-px bg-gray-100" />

        <div className="px-4 py-3 flex flex-col min-h-0 flex-1">
          {!assignment?.tmName && !showPicker && (
            <div className="py-2">
              <button
                type="button"
                onClick={onAssignTap}
                className={`w-full rounded-2xl py-3 text-[13px] font-semibold text-white ${
                  highlightAssign ? "sb-guide-target sb-guide-target--pulse" : ""
                }`}
                style={{ background: accent }}
              >
                Assign team member
              </button>
            </div>
          )}

          {showPicker && (
            <div className="flex flex-col gap-1.5 min-h-0">
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-400">
                Pick team member
              </p>
              <div className="sb-tm-picker-scroll flex flex-col gap-1 max-h-[220px] overflow-y-auto">
                {pickerOptions.map((tm) => (
                  <button
                    key={tm.tmId}
                    type="button"
                    onClick={() => onPickTm(tm.tmId, tm.tmName)}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-2xl border border-gray-100 bg-white hover:border-[#007AFF]/30 hover:bg-[#007AFF]/[0.03] ${
                      highlightPickerTmId === tm.tmId ? "sb-guide-target sb-guide-target--pulse" : ""
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ background: accent }}
                    >
                      {tm.tmName.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">
                        {tm.tmName}
                      </span>
                      {tm.subtitle ? (
                        <span className="block text-[10px] text-gray-400 truncate">{tm.subtitle}</span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {!showPicker && (
          <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-white">
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "Lock", onClick: () => {} },
                { label: "Clear", onClick: onClear, danger: true },
                { label: "Coverage", onClick: () => {} },
                { label: "Swap", onClick: onSwapTap },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={b.onClick}
                  className={`py-2 rounded-2xl text-[11px] font-semibold ${
                    b.danger
                      ? "text-[#FF3B30] bg-[#FFF0F0] border border-[#FFD5D5]"
                      : "text-gray-800 bg-white border border-gray-200"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}