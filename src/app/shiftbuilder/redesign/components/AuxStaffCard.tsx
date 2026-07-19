import { MoreHorizontal } from "lucide-react";
import type { AuxStaffCardProps } from "../types";

export function AuxStaffCard({ name, role, color }: AuxStaffCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold"
            style={{ backgroundColor: color }}
          >
            {name[0]}
          </div>
          <span className="text-xs font-semibold text-gray-800">{name}</span>
        </div>
        <MoreHorizontal size={11} className="text-gray-400" />
      </div>
      {role ? (
        <div className="text-[10px] text-gray-500">{role}</div>
      ) : (
        <div className="text-[10px] text-gray-300 italic">— Set role</div>
      )}
    </div>
  );
}
