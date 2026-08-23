import type { MouseEvent } from "react";
import { ZONE_COLORS } from "../tokens";
import type { ShiftCardProps } from "../types";

export function ShiftCard({ zone, label, name, secondName, notes, unassigned, coverage, projectPills, nameMeta, taskContent, footer, noChip, onClick }: ShiftCardProps) {
  const colors = ZONE_COLORS[zone] || ZONE_COLORS[1];
  const accentColor = colors.label;
  const cardLabel = label ?? `ZONE ${zone}`;
  const hasTasks = Boolean(taskContent || (notes && notes.length > 0));
  const handleCardClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("[data-card-task-zone], [data-task-host]")) return;
    onClick?.();
  };

  const slotTitle = !noChip ? (
    <span
      className="sb-canvas-slot-label text-[10px] font-semibold uppercase tracking-[0.04em] leading-snug"
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", color: accentColor }}
    >
      {cardLabel}
    </span>
  ) : (
    <div />
  );

  const taskBlock = hasTasks ? (
    <div className="sb-desk-card-tasks mt-1 min-w-0 min-h-0 flex-1 flex flex-col gap-1 overflow-hidden">
      {taskContent ?? notes?.map((note, index) => (
        <div key={`${note}-${index}`} className="flex items-start gap-1 min-w-0">
          <span
            className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: accentColor, opacity: 0.85 }}
          />
          <span className="text-[9px] leading-snug text-[#64748B] break-words">{note}</span>
        </div>
      ))}
    </div>
  ) : null;

  if (unassigned) {
    return (
      <div
        onClick={handleCardClick}
        className="sb-desk-card rounded-[20px] border border-transparent min-h-0 h-full flex flex-col overflow-hidden bg-white cursor-pointer"
      >
        <div className="flex flex-1 min-h-0">
          <div className="w-[7px] shrink-0 rounded-l-2xl" style={{ backgroundColor: accentColor }} />
          <div className="flex flex-col flex-1 p-3 min-w-0 text-left">
            <div className="flex items-center justify-between mb-2">
              {slotTitle}
            </div>
            {coverage && coverage.length > 0 ? (
              <div className="flex-1 min-h-0 flex flex-col gap-2">
                <div className="min-w-0 flex flex-col gap-1 items-start text-left">
                  <div className="sb-covered-by-label text-[8px] font-semibold uppercase tracking-[0.1em] text-[#94A3B8]">Covered by</div>
                  {coverage.map((c) => (
                    <div key={c.label} className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-[#64748B] shrink-0">{c.label}</span>
                      <span className="text-[15px] font-bold text-[#334155] truncate">{c.name}</span>
                    </div>
                  ))}
                </div>
                {taskBlock}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 flex flex-col items-start justify-center min-h-0">
                  <span
                    className="text-[13px] font-semibold tracking-[0.04em]"
                    style={{ color: `${accentColor}99` }}
                  >
                    Assign TM
                  </span>
                  <span className="no-print text-[10px] mt-0.5 text-[#94A3B8]">Drop to assign</span>
                </div>
                {taskBlock}
              </div>
            )}
          </div>
        </div>
        {footer}
      </div>
    );
  }

  return (
    <div
      onClick={handleCardClick}
      className="sb-desk-card rounded-[20px] border border-transparent min-h-0 h-full flex flex-col overflow-hidden bg-white cursor-pointer"
    >
      <div className="flex flex-1 min-h-0">
        <div className="w-[7px] shrink-0 rounded-l-2xl" style={{ backgroundColor: accentColor }} />
        <div className="flex flex-col flex-1 p-3 min-w-0 text-left">
          <div className={`flex items-center justify-between ${projectPills ? "mb-1" : "mb-2.5"}`}>
            {slotTitle}
          </div>
          {projectPills ? <div className="mb-1 min-w-0">{projectPills}</div> : null}
          <div className="flex flex-col gap-0.5 mb-2 items-start text-left">
            <div className="text-[17px] font-bold text-[#111827] leading-tight truncate w-full">{name}</div>
            {nameMeta}
            {secondName && (
              <div className="text-[13px] font-semibold text-[#64748B] leading-tight truncate">{secondName}</div>
            )}
          </div>
          {taskBlock}
        </div>
      </div>
      {footer}
    </div>
  );
}
