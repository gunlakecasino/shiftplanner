import { useState } from "react";
import { Printer, Download, Eye, FileText, X } from "lucide-react";
import { DAY_RAIL } from "../tokens";
import type { PrintCommandCenterProps, DayPrintState } from "../types";
import { Toggle } from "./Toggle";

export function PrintCommandCenter({ activeDay, onClose }: PrintCommandCenterProps) {
  const [dayStates, setDayStates] = useState<DayPrintState[]>(
    DAY_RAIL.map((_, i) => ({ deploy: i === activeDay, breaks: i === activeDay }))
  );
  const [floorSheet, setFloorSheet] = useState(false);

  const toggle = (i: number, key: keyof DayPrintState) =>
    setDayStates((p) => p.map((d, j) => j === i ? { ...d, [key]: !d[key] } : d));

  const setAll = (key: keyof DayPrintState) =>
    setDayStates((p) => p.map((d) => ({ ...d, [key]: true })));

  const clear = () => setDayStates(DAY_RAIL.map(() => ({ deploy: false, breaks: false })));

  const deployCount = dayStates.filter((d) => d.deploy).length;
  const breaksCount = dayStates.filter((d) => d.breaks).length;
  const sheetCount  = deployCount + breaksCount + (floorSheet ? 1 : 0);
  const rangeLabel  = `${DAY_RAIL[0].abbr} ${DAY_RAIL[0].date} – ${DAY_RAIL[DAY_RAIL.length - 1].abbr} ${DAY_RAIL[DAY_RAIL.length - 1].date} · July 2026`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-[680px] bg-white rounded-2xl shadow-[0_32px_80px_rgba(0,0,0,0.22)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#EFF6FF] flex items-center justify-center shrink-0">
              <Printer size={16} className="text-blue-500" />
            </div>
            <div>
              <div className="text-[14px] font-bold text-gray-900 leading-tight">Print & Export</div>
              <div className="text-[11px] text-gray-400">{rangeLabel}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sheetCount > 0 && (
              <span className="text-[11px] font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-full">
                {sheetCount} sheet{sheetCount !== 1 ? "s" : ""}
              </span>
            )}
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
              <X size={13} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* Nights */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Nights</span>
            <div className="flex items-center gap-1">
              {(["deploy", "breaks"] as const).map((k) => (
                <button key={k} onClick={() => setAll(k)}
                  className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-md transition-colors capitalize">
                  All {k}
                </button>
              ))}
              <button onClick={clear} className="text-[10px] font-semibold text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md transition-colors ml-0.5">
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-9 gap-1.5">
            {DAY_RAIL.map((day, i) => {
              const ds = dayStates[i];
              const isActive = i === activeDay;
              const bothOn = ds.deploy && ds.breaks;
              return (
                <div
                  key={i}
                  className="rounded-xl overflow-hidden border transition-all"
                  style={{
                    borderColor: (ds.deploy || ds.breaks) ? day.color : "#f0f0f4",
                    boxShadow: isActive ? `0 0 0 2px ${day.color}40` : undefined,
                  }}
                >
                  <button
                    onClick={() => setDayStates((p) => p.map((d, j) => j === i ? { deploy: !bothOn, breaks: !bothOn } : d))}
                    className="w-full flex flex-col items-center py-3 transition-colors"
                    style={{ backgroundColor: bothOn ? day.color : ds.deploy || ds.breaks ? `${day.color}18` : "#fafafa" }}
                  >
                    {isActive && (
                      <span className="text-[6px] font-bold uppercase tracking-widest leading-none mb-0.5"
                        style={{ color: bothOn ? "rgba(255,255,255,0.7)" : day.color }}>Tonight</span>
                    )}
                    <span className="text-[8px] font-semibold leading-none mb-0.5"
                      style={{ color: bothOn ? "rgba(255,255,255,0.6)" : "#9ca3af" }}>{day.abbr}</span>
                    <span className="text-[17px] font-bold leading-none"
                      style={{ color: bothOn ? "#fff" : "#111827" }}>{day.date}</span>
                  </button>
                  <div className="border-t" style={{ borderColor: (ds.deploy || ds.breaks) ? `${day.color}30` : "#f3f4f6" }}>
                    {(["deploy", "breaks"] as const).map((key, ki) => (
                      <button
                        key={key}
                        onClick={() => toggle(i, key)}
                        className={`w-full flex items-center justify-between px-1.5 py-1.5 hover:bg-gray-50 transition-colors ${ki === 0 ? "" : "border-t border-gray-100"}`}
                      >
                        <span className="text-[8.5px] font-semibold capitalize leading-none"
                          style={{ color: ds[key] ? day.color : "#9ca3af" }}>{key}</span>
                        <div
                          className="w-3 h-3 rounded-full border-[1.5px] flex items-center justify-center transition-all shrink-0"
                          style={ds[key] ? { backgroundColor: day.color, borderColor: day.color } : { borderColor: "#d1d5db" }}
                        >
                          {ds[key] && (
                            <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                              <path d="M1 3L2.3 4.5L5 1.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Floor Sheet */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5">
            <FileText size={13} className="text-gray-400" />
            <div>
              <span className="text-[11px] font-semibold text-gray-700">Floor Sheet</span>
              <span className="text-[10px] text-gray-400 ml-1.5">Full zone layout · 1 page</span>
            </div>
          </div>
          <Toggle on={floorSheet} color="#7c3aed" onChange={() => setFloorSheet((o) => !o)} />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/70">
          <div className="flex items-center gap-4 text-[10px] text-gray-400">
            {sheetCount > 0
              ? <span className="text-[12px] font-semibold text-gray-600">{sheetCount} sheet{sheetCount !== 1 ? "s" : ""} · ~{sheetCount * 2}s</span>
              : <span className="text-gray-400 italic text-[11px]">No sheets selected</span>
            }
            <span>Print <kbd className="bg-white border border-gray-200 text-gray-500 px-1 py-px rounded text-[9px] font-mono shadow-sm">⌘↵</kbd></span>
            <span>Export <kbd className="bg-white border border-gray-200 text-gray-500 px-1 py-px rounded text-[9px] font-mono shadow-sm">⌘⇧↵</kbd></span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors">
              <Download size={12} /> Export PDF
            </button>
            <button className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 border border-gray-200 bg-white hover:bg-gray-50 px-3 py-2 rounded-xl transition-colors">
              <Eye size={12} /> Preview
            </button>
            <button
              disabled={sheetCount === 0}
              className="flex items-center gap-1.5 text-[12px] font-bold text-white px-4 py-2 rounded-xl transition-all"
              style={{ backgroundColor: sheetCount > 0 ? "#2563EB" : "#d1d5db", cursor: sheetCount > 0 ? "pointer" : "not-allowed" }}
            >
              <Printer size={13} />
              Print{sheetCount > 0 ? ` ${sheetCount}` : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
