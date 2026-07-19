import { MoreHorizontal } from "lucide-react";
import { ZONE_COLORS, ZONE_STATUS } from "../tokens";
import type { ShiftCardProps } from "../types";

export function ShiftCard({ zone, name, secondName, notes, unassigned, coverage, noChip, onClick }: ShiftCardProps) {
  const colors = ZONE_COLORS[zone] || ZONE_COLORS[1];
  const accentColor = colors.label;

  if (unassigned) {
    return (
      <div
        onClick={onClick}
        className="rounded-xl border border-gray-200 min-h-[172px] flex overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow"
        style={{ backgroundColor: `${accentColor}08` }}
      >
        <div className="w-[5px] shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />
        <div className="flex flex-col flex-1 p-3 min-w-0">
          <div className="flex items-center justify-between mb-2">
            {!noChip
              ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>ZONE {zone}</span>
              : <div />}
            <MoreHorizontal size={12} className="text-gray-300 ml-auto" />
          </div>
          {coverage && coverage.length > 0 ? (
            <div className="flex-1 flex flex-col justify-center gap-1">
              <div className="text-[8px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>Covered by</div>
              {coverage.map((c) => (
                <div key={c.label} className="flex items-baseline gap-1.5">
                  <span className="text-[10px] font-bold text-gray-500">{c.label}</span>
                  <span className="text-[15px] font-bold text-gray-400">{c.name}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <span className="text-[13px] font-semibold" style={{ color: `${accentColor}55` }}>Unassigned</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="rounded-xl border border-gray-200 min-h-[172px] flex overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition-shadow bg-white"
    >
      <div className="w-[5px] shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />
      <div className="flex flex-col flex-1 p-3 min-w-0">
        <div className="flex items-center justify-between mb-2.5">
          {!noChip
            ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${accentColor}18`, color: accentColor }}>ZONE {zone}</span>
            : <div />}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${ZONE_STATUS[zone] ?? "bg-green-400"}`} />
            <MoreHorizontal size={12} className="text-gray-400" />
          </div>
        </div>
        <div className="flex flex-col gap-0.5 mb-2">
          <div className="text-[17px] font-bold text-gray-900 leading-tight truncate">{name}</div>
          {secondName && (
            <div className="text-[13px] font-semibold text-gray-400 leading-tight truncate">{secondName}</div>
          )}
        </div>
        {notes && notes.length > 0 && (
          <div className="mt-auto flex flex-col gap-1">
            {notes.map((n, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <div className="w-1 h-1 rounded-full mt-[5px] shrink-0" style={{ backgroundColor: accentColor, opacity: 0.5 }} />
                <span className="text-[10px] text-gray-500 leading-snug truncate">{n}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
