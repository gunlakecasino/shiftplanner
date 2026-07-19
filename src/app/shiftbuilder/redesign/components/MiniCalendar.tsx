import { DAY_RAIL, CAL_OFFSET, CAL_DAYS_IN_MONTH } from "../tokens";
import type { MiniCalendarProps } from "../types";

export function MiniCalendar({ activeDate, onSelect, onClose }: MiniCalendarProps) {
  const cells: (number | null)[] = [
    ...Array(CAL_OFFSET).fill(null),
    ...Array.from({ length: CAL_DAYS_IN_MONTH }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-[#1e1e28] border border-white/10 rounded-xl shadow-2xl p-3 w-52"
      onMouseLeave={onClose}
    >
      <div className="grid grid-cols-7 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => (
          <div key={i} className="text-center text-[9px] font-semibold text-gray-500 py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (!day) return <div key={i} />;
          const railDates = DAY_RAIL.map((d) => d.date);
          const activeDayDate = DAY_RAIL[activeDate]?.date;
          const railIdx = railDates.indexOf(day);
          const isActive = day === activeDayDate;
          const isInRail = railIdx !== -1;
          const activeColor = isInRail ? DAY_RAIL[railIdx].color : undefined;
          return (
            <button
              key={i}
              onClick={() => { if (isInRail) { onSelect(railIdx); onClose(); } }}
              style={isActive && activeColor ? { backgroundColor: activeColor } : undefined}
              className={`text-[10px] font-medium h-6 w-full rounded-md transition-colors leading-none
                ${isActive ? "text-white font-bold" : isInRail ? "text-white hover:bg-white/15" : "text-gray-500 hover:bg-white/10"}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
