import { useState } from "react";
import { X, Plus, Lock, Trash2, Eye, ArrowLeftRight } from "lucide-react";
import { ZONE_COLORS, MATRIX_CELLS, SAMPLE_EXPOSURE, EXPOSURE_STYLE, LAST5 } from "../tokens";
import type { PlacementPadProps, Task } from "../types";
import { RichTaskEditor } from "./RichTaskEditor";

export function PlacementPad({ card, onClose }: PlacementPadProps) {
  const [tasks, setTasks] = useState<Task[]>([
    { html: "Task 1", text: "Task 1" },
    { html: "Task 2", text: "Task 2" },
    { html: "Task 3", text: "Task 3" },
  ]);
  const [addingTask, setAddingTask] = useState(false);
  const colors = ZONE_COLORS[card.zone] || ZONE_COLORS[1];
  const displayName = card.name;
  const displayZone = card.label ?? `Zone ${card.zone}`;

  return (
    <div className="flex flex-col w-[268px] shrink-0 bg-white border-l border-gray-200 shadow-xl overflow-y-auto z-30">
      {/* Header */}
      <div className="p-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded mb-1 inline-block ${colors.chip}`}>
              {displayZone.toUpperCase()}
            </span>
            <div className="text-[16px] font-bold text-gray-900 leading-tight">{displayName}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col items-center bg-amber-100 border border-amber-200 rounded-lg px-2 py-1">
              <span className="text-[8px] font-bold text-amber-600 leading-none">BRK</span>
              <span className="text-[13px] font-bold text-amber-700 leading-none">1</span>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
              <X size={13} className="text-gray-500" />
            </button>
          </div>
        </div>
        <button className="w-full text-[11px] font-semibold text-gray-500 border border-gray-300 rounded-lg py-1.5 hover:bg-gray-50 transition-colors">
          Mark unavailable
        </button>
      </div>

      {/* Tasks */}
      <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-1.5">
        {tasks.map((t, i) => (
          <div key={i} className="flex items-start justify-between gap-2 group">
            <div className="flex items-start gap-2 flex-1 min-w-0">
              <div className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0 mt-[3px]" />
              <span className="text-[11px] text-gray-700 leading-snug" dangerouslySetInnerHTML={{ __html: t.html }} />
            </div>
            <button onClick={() => setTasks((p) => p.filter((_, j) => j !== i))} className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
              <X size={11} className="text-gray-400 hover:text-red-400" />
            </button>
          </div>
        ))}
        {addingTask ? (
          <RichTaskEditor
            onSave={(html, text) => { setTasks((p) => [...p, { html, text }]); setAddingTask(false); }}
            onCancel={() => setAddingTask(false)}
          />
        ) : (
          <div className="flex items-center gap-1.5 mt-0.5">
            <button
              onClick={() => setAddingTask(true)}
              className="flex items-center justify-center gap-1.5 flex-1 border border-dashed border-gray-300 rounded-lg py-1.5 text-[11px] font-semibold text-blue-500 hover:bg-blue-50 hover:border-blue-300 transition-colors"
            >
              <Plus size={11} /> Add task
            </button>
            <button title="Assign Sweeper" className="flex items-center justify-center w-8 h-8 shrink-0 rounded-lg bg-amber-400 border border-amber-500 hover:bg-amber-500 transition-colors shadow-sm">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <line x1="3" y1="2" x2="10" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                <rect x="8.5" y="7.5" width="4" height="2" rx="0.5" transform="rotate(45 8.5 7.5)" fill="white" opacity="0.7"/>
                <path d="M8 10 Q9.5 9 12 10.5 L13.5 14 Q11 13 9.5 13.5 Q8.5 14 7.5 13.5 Z" fill="white"/>
                <line x1="9.5" y1="10.2" x2="9" y2="13.2" stroke="rgba(180,100,0,0.4)" strokeWidth="0.6" strokeLinecap="round"/>
                <line x1="11" y1="10.5" x2="10.8" y2="13.5" stroke="rgba(180,100,0,0.4)" strokeWidth="0.6" strokeLinecap="round"/>
                <line x1="12.3" y1="11.2" x2="12.5" y2="13.8" stroke="rgba(180,100,0,0.4)" strokeWidth="0.6" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Quick Insight */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="bg-green-500 rounded-xl p-3 text-white">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-green-100 uppercase tracking-widest">Best</span>
              <span className="text-[9px] font-semibold text-green-200 uppercase tracking-widest">Rotation Fit</span>
            </div>
            <span className="text-[12px] font-bold text-white">91pt</span>
          </div>
          <p className="text-[11px] font-semibold text-white leading-snug">
            {displayName.split(" ")[0]} is a strong fit — first or single exposure in the 30-night spread.
          </p>
        </div>
      </div>

      {/* Matrix */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Placement Matrix</div>
        <div className="flex items-center gap-3 text-[9px] mb-2">
          <span className="font-bold text-red-500">RR 0</span>
          <span className="text-gray-300">|</span>
          <span>Zone <strong>5</strong></span>
          <span className="text-gray-300">|</span>
          <span>Z9 <strong>19d</strong> Z9SR <strong>—</strong></span>
        </div>
        <div className="flex items-center gap-3 mb-2.5">
          {[
            { dot: "bg-green-400",  label: "1×" },
            { dot: "bg-orange-400", label: "2×" },
            { dot: "bg-red-400",    label: "3×+" },
            { dot: "bg-gray-300",   label: "not in spread" },
          ].map(({ dot, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <span className="text-[9px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1">
          {MATRIX_CELLS.map(({ id }) => {
            const exp = SAMPLE_EXPOSURE[id] ?? 0;
            return (
              <div key={id} className={`rounded-lg py-1 text-center text-[9px] font-bold cursor-pointer hover:scale-105 transition-transform ${EXPOSURE_STYLE[exp]}`}>
                {id}
              </div>
            );
          })}
        </div>
      </div>

      {/* Last 5 */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Last 5</div>
        <div className="flex items-center gap-1.5">
          {LAST5.map(({ label, color }) => (
            <div key={label} className={`flex-1 text-center py-1.5 rounded-lg border text-[9px] font-bold ${color}`}>
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Z9 / SR Exposure */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Z9 / SR Exposure</div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 flex items-center justify-between">
          <div className="text-[11px] text-gray-500 font-medium">Days since last</div>
          <div className="text-[20px] font-bold text-gray-700 leading-none">19</div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="p-3 grid grid-cols-4 gap-1.5 mt-auto">
        {[
          { label: "Lock",     icon: Lock,          style: "bg-gray-100 text-gray-600 hover:bg-gray-200" },
          { label: "Clear",    icon: Trash2,         style: "bg-red-50 text-red-500 hover:bg-red-100" },
          { label: "Coverage", icon: Eye,            style: "bg-blue-50 text-blue-600 hover:bg-blue-100" },
          { label: "Swap",     icon: ArrowLeftRight, style: "bg-purple-50 text-purple-600 hover:bg-purple-100" },
        ].map(({ label, icon: Icon, style }) => (
          <button key={label} className={`flex flex-col items-center justify-center gap-1 py-2 rounded-xl text-[9px] font-bold transition-colors ${style}`}>
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
