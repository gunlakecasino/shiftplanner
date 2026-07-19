"use client";

import React from "react";
import { createPortal } from "react-dom";

export type DayPlacementRunMode = "fill-open" | "rebuild-day";

type RunDayPlacementsSummary = {
  dateLabel: string;
  scheduledCount: number;
  placedCount: number;
  openSlotCount: number;
  lockedCount: number;
  callOffCount: number;
  draftActive: boolean;
};

type Props = {
  open: boolean;
  running?: boolean;
  summary: RunDayPlacementsSummary;
  onClose: () => void;
  onRun: (mode: DayPlacementRunMode) => void | Promise<void>;
};

const MODE_COPY: Record<
  DayPlacementRunMode,
  {
    label: string;
    description: string;
  }
> = {
  "fill-open": {
    label: "Fill Open Slots",
    description: "Keeps valid current placements and fills the remaining day.",
  },
  "rebuild-day": {
    label: "Rebuild Day",
    description: "Recomputes the board while preserving hard locks and eligibility rules.",
  },
};

export function RunDayPlacementsModal({
  open,
  running = false,
  summary,
  onClose,
  onRun,
}: Props) {
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const run = (mode: DayPlacementRunMode) => {
    void onRun(mode);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.46)",
        backdropFilter: "blur(3px)",
        WebkitBackdropFilter: "blur(3px)",
      }}
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sb-run-day-title"
        className="w-full max-w-[460px] rounded-2xl border border-black/10 bg-[#fbfaf8] p-5 text-[#1c1c1e] shadow-[0_18px_60px_-18px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.75)] outline-none"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7b3226]">
              SheetBuilder
            </div>
            <h2
              id="sb-run-day-title"
              className="mt-1 text-[18px] font-extrabold tracking-normal"
            >
              Run Day Placements?
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
              {summary.dateLabel}. Results open as a draft for review before
              anything is applied live.
            </p>
          </div>
          <button
            type="button"
            className="sb-interactive h-8 w-8 shrink-0 rounded-full text-[18px] leading-none text-neutral-500 hover:bg-black/5"
            aria-label="Close run day placements"
            onClick={onClose}
          >
            x
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryPill label="Scheduled" value={summary.scheduledCount} />
          <SummaryPill label="Placed" value={summary.placedCount} />
          <SummaryPill label="Open" value={summary.openSlotCount} />
          <SummaryPill label="Locked" value={summary.lockedCount} />
        </div>

        <div className="mt-3 rounded-xl border border-black/8 bg-white/70 px-3 py-2 text-[12px] leading-relaxed text-neutral-600">
          {summary.callOffCount > 0
            ? `${summary.callOffCount} call-off/unavailable TM${summary.callOffCount === 1 ? "" : "s"} will be excluded.`
            : "Known call-offs and dated unavailability stay excluded."}
          {summary.draftActive
            ? " Current draft placements may be replaced by this run."
            : " Existing live placements are handled by the mode you choose."}
        </div>

        <div className="mt-4 grid gap-2">
          {(Object.keys(MODE_COPY) as DayPlacementRunMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className="sb-interactive rounded-xl border border-black/10 bg-white px-4 py-3 text-left shadow-[0_1px_0_rgba(255,255,255,0.8)_inset] transition hover:border-[#7b3226]/40 hover:bg-[#fffdf9] disabled:opacity-50"
              disabled={running}
              onClick={() => run(mode)}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[14px] font-extrabold">
                  {MODE_COPY[mode].label}
                </span>
                <span className="rounded-full bg-[#7b3226] px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white">
                  Run
                </span>
              </span>
              <span className="mt-1 block text-[12px] leading-snug text-neutral-500">
                {MODE_COPY[mode].description}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="sb-interactive rounded-full border border-black/10 bg-white px-4 py-2 text-[13px] font-bold text-neutral-700 hover:bg-neutral-50"
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SummaryPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-black/8 bg-white/70 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-400">
        {label}
      </div>
      <div className="mt-0.5 text-[18px] font-extrabold tabular-nums">
        {value}
      </div>
    </div>
  );
}

export default RunDayPlacementsModal;
