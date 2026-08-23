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

  if (unassigned) {
    return (
      <div
        onClick={handleCardClick}
        className="rounded-lg border border-gray-200 min-h-[172px] flex flex-col overflow-hidden bg-white cursor-pointer"
      >
        <div className="flex flex-1 min-h-0">
          <div className="w-[5px] shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />
          <div className="flex flex-col flex-1 p-3 min-w-0">
          <div className="flex items-center justify-between mb-2">
            {!noChip
              ? <span className="sb-canvas-slot-label text-[10px] font-semibold uppercase tracking-[0.04em] leading-snug" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", color: accentColor }}>{cardLabel}</span>
              : <div />}
          </div>
          {coverage && coverage.length > 0 ? (
            <div className="flex-1 min-h-0 flex flex-col gap-2">
              <div className="min-w-0 flex flex-col gap-1">
                <div className="sb-covered-by-label text-[8px] font-semibold uppercase tracking-[0.1em] text-[#9aa3b2]">Covered by</div>
                {coverage.map((c) => (
                  <div key={c.label} className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-[10px] font-bold text-gray-500 shrink-0">{c.label}</span>
                    <span className="text-[15px] font-bold text-gray-400 truncate">{c.name}</span>
                  </div>
                ))}
              </div>
              {hasTasks && (
                <div className="min-w-0 mt-auto flex flex-col gap-1">
                  {taskContent ?? notes?.map((note, index) => (
                    <div key={`${note}-${index}`} className="flex items-start gap-1 min-w-0">
                      <span
                        className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: accentColor, opacity: 0.85 }}
                      />
                      <span className="text-[9px] leading-snug text-gray-600 break-words">{note}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[13px] font-semibold" style={{ color: `${accentColor}55` }}>Unassigned</span>
              </div>
              {hasTasks && (
                <div className="mt-auto min-w-0">
                  {taskContent ?? notes?.map((note, index) => (
                    <div key={`${note}-${index}`} className="flex items-start gap-1 min-w-0">
                      <span
                        className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: accentColor, opacity: 0.85 }}
                      />
                      <span className="text-[9px] leading-tight text-gray-600 break-words">{note}</span>
                    </div>
                  ))}
                </div>
              )}
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
      className="rounded-lg border border-gray-200 min-h-[172px] flex flex-col overflow-hidden bg-white cursor-pointer"
    >
      <div className="flex flex-1 min-h-0">
        <div className="w-[5px] shrink-0 rounded-l-xl" style={{ backgroundColor: accentColor }} />
        <div className="flex flex-col flex-1 p-3 min-w-0">
        <div className={`flex items-center justify-between ${projectPills ? "mb-1" : "mb-2.5"}`}>
          {!noChip
            ? <span className="sb-canvas-slot-label text-[10px] font-semibold uppercase tracking-[0.04em] leading-snug" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", color: accentColor }}>{cardLabel}</span>
            : <div />}
        </div>
        {projectPills ? <div className="mb-1 min-w-0">{projectPills}</div> : null}
        <div className="flex flex-col gap-0.5 mb-2">
          <div className="text-[17px] font-bold text-gray-900 leading-tight truncate">{name}</div>
          {nameMeta}
          {secondName && (
            <div className="text-[13px] font-semibold text-gray-400 leading-tight truncate">{secondName}</div>
          )}
        </div>
        {hasTasks && (
          <div className="mt-auto flex flex-col gap-1">
            {taskContent ?? notes?.map((n, i) => (
              <div key={i} className="flex items-start gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full mt-[4px] shrink-0" style={{ backgroundColor: accentColor, opacity: 0.85 }} />
                    <span className="text-[10px] font-medium text-gray-600 leading-snug break-words">{n}</span>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
      {footer}
    </div>
  );
}
