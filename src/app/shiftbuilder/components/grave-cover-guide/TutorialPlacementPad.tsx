"use client";

import React from "react";
import { X } from "lucide-react";
import { ZONE_DEFS, getZoneColor } from "@/lib/shiftbuilder/constants";
import { getSlotMeta } from "../MarkerPad";
import type { TutorialAssignment, TutorialSlotKey } from "./tutorialScenario";

type PadMode = "default" | "assign" | "coverage";

type TutorialPlacementPadProps = {
  slotKey: TutorialSlotKey;
  assignment: TutorialAssignment | null;
  mode: PadMode;
  pickerOptions: Array<{ tmId: string; tmName: string; subtitle?: string }>;
  highlightMark?: boolean;
  highlightAssign?: boolean;
  highlightCoverage?: boolean;
  highlightPickerTmId?: string;
  onClose: () => void;
  onMarkUnavailable: () => void;
  onAssignTap: () => void;
  onSwapTap: () => void;
  onCoverageTap: () => void;
  onCoveragePick: (target: TutorialSlotKey) => void;
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
  highlightCoverage = false,
  highlightPickerTmId,
  onClose,
  onMarkUnavailable,
  onAssignTap,
  onSwapTap,
  onCoverageTap,
  onCoveragePick,
  onClear,
  onPickTm,
}: TutorialPlacementPadProps) {
  const { label, accent } = getSlotMeta(slotKey);
  const refinedName = assignment?.tmName || "Unassigned";
  const showPicker = mode === "assign";
  const showCoverage = mode === "coverage";

  return (
    <div className="placement-pad no-print sb-guide-placement-pad" onClick={(e) => e.stopPropagation()}>
      <div className="w-full bg-white rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.05)] flex flex-col min-h-0 max-h-[min(420px,70vh)]">
        <div className="px-4 pt-4 pb-3 shrink-0">
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
                <p className="text-[9px] font-bold tracking-[0.14em] uppercase mb-px" style={{ color: accent }}>
                  {label}
                </p>
                <h2 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{refinedName}</h2>
              </div>
            </div>
            <button type="button" onClick={onClose} className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center" aria-label="Close">
              <X className="w-3 h-3 text-gray-500" />
            </button>
          </div>

          {assignment?.tmName && !showCoverage && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={onMarkUnavailable}
                className={`text-[10px] font-semibold px-3 py-1 rounded-lg border border-yellow-300 text-yellow-600 bg-yellow-50 hover:bg-yellow-100 ${
                  highlightMark ? "sb-guide-target sb-guide-target--pulse" : ""
                }`}
              >
                Mark unavailable
              </button>
            </div>
          )}
        </div>

        <div className="h-px bg-gray-100 shrink-0" />

        <div className="px-4 py-3 flex flex-col min-h-0 flex-1 overflow-y-auto">
          {!assignment?.tmName && !showPicker && !showCoverage && (
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
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold tracking-[0.12em] uppercase text-gray-400">Pick team member</p>
              <div className="sb-tm-picker-scroll flex flex-col gap-1">
                {pickerOptions.map((tm) => (
                  <button
                    key={tm.tmId}
                    type="button"
                    onClick={() => onPickTm(tm.tmId, tm.tmName)}
                    className={`flex items-center gap-2.5 w-full text-left px-3 py-2.5 rounded-2xl border border-gray-100 bg-white hover:border-[#007AFF]/30 ${
                      highlightPickerTmId === tm.tmId ? "sb-guide-target sb-guide-target--pulse" : ""
                    }`}
                  >
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: accent }}>
                      {tm.tmName.charAt(0)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-gray-900 truncate">{tm.tmName}</span>
                      {tm.subtitle ? <span className="block text-[10px] text-gray-400 truncate">{tm.subtitle}</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {showCoverage && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-neutral-700">Add coverage</span>
                <button type="button" onClick={onClose} className="text-neutral-400 text-xs">✕</button>
              </div>
              <div className="text-[8px] font-bold tracking-[0.8px] uppercase text-neutral-500">Zones</div>
              <div className="grid grid-cols-5 gap-1">
                {ZONE_DEFS.map((z) => {
                  const zc = getZoneColor(z.key);
                  const disabled = z.key === slotKey;
                  return (
                    <button
                      key={z.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => onCoveragePick(z.key as TutorialSlotKey)}
                      className={`h-[22px] rounded-md border text-center text-[9px] font-semibold disabled:opacity-30 ${
                        highlightCoverage && z.key === "Z8" ? "sb-guide-target sb-guide-target--pulse" : ""
                      }`}
                      style={{ borderColor: zc + (disabled ? "22" : "66"), color: disabled ? "#aaa" : zc }}
                    >
                      {z.key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!showPicker && !showCoverage && (
          <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-white shrink-0">
            <div className="grid grid-cols-4 gap-1">
              {[
                { label: "Lock", onClick: () => {} },
                { label: "Clear", onClick: onClear, danger: true },
                {
                  label: "Coverage",
                  onClick: onCoverageTap,
                  highlight: highlightCoverage,
                },
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
                  } ${b.highlight ? "sb-guide-target sb-guide-target--pulse" : ""}`}
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