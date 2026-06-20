"use client";

import { createPortal } from "react-dom";
import { Coffee, Eye, LayoutGrid, Printer, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodayBoardView } from "../hooks/useTodayScheduleNav";

type TodayZenOrbProps = {
  visible: boolean;
  operatorName: string;
  currentView: TodayBoardView;
  onViewChange: (view: TodayBoardView) => void;
  onRestoreChrome: () => void;
  onPrint?: () => void;
  showPrint?: boolean;
  isPrinting?: boolean;
};

export function TodayZenOrb({
  visible,
  operatorName,
  currentView,
  onViewChange,
  onRestoreChrome,
  onPrint,
  showPrint = false,
  isPrinting = false,
}: TodayZenOrbProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "sb-today-zen-orb fixed bottom-5 right-5 z-[60] flex flex-col items-end gap-2 transition-all duration-280 ease-out",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-2 scale-90 opacity-0",
      )}
      role="toolbar"
      aria-label="Zen mode controls"
      aria-hidden={!visible}
    >
      <div className="flex items-center gap-1 rounded-full border border-white/50 bg-white/92 p-1 shadow-lg shadow-black/10 backdrop-blur-xl">
        <button
          type="button"
          onClick={onRestoreChrome}
          className="sb-kiosk-tap-target flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 text-[#C13A14] transition hover:bg-black/5"
          title="Exit zen mode (Esc)"
          aria-label="Exit zen mode"
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          <span className="hidden text-[10px] font-bold uppercase tracking-wide sm:inline">Exit</span>
        </button>
        <button
          type="button"
          onClick={() => onViewChange("deployment")}
          className={cn(
            "sb-kiosk-tap-target flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-black/5",
            currentView === "deployment" ? "bg-[#C13A14]/10 text-[#C13A14]" : "text-[#6C6C72]",
          )}
          title="Deployment board"
          aria-label="Deployment board"
        >
          <LayoutGrid className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onViewChange("breaks")}
          className={cn(
            "sb-kiosk-tap-target flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-black/5",
            currentView === "breaks" ? "bg-[#C13A14]/10 text-[#C13A14]" : "text-[#6C6C72]",
          )}
          title="Break sheet"
          aria-label="Break sheet"
        >
          <Coffee className="h-4 w-4" />
        </button>
        {showPrint && onPrint ? (
          <button
            type="button"
            onClick={onPrint}
            disabled={isPrinting}
            className="sb-kiosk-tap-target flex h-11 w-11 items-center justify-center rounded-full text-[#6C6C72] transition hover:bg-black/5 disabled:opacity-50"
            title="Print"
            aria-label="Print deployment and breaks"
          >
            <Printer className="h-4 w-4" />
          </button>
        ) : null}
        <span
          className="max-w-[5.5rem] truncate px-2 text-[10px] font-semibold text-[#1C1C1E]"
          title={operatorName}
        >
          {operatorName.split(" ")[0]}
        </span>
        <span className="sr-only">View only indicator</span>
        <Eye className="mr-2 h-3.5 w-3.5 text-[#AEAEB2]" aria-hidden />
      </div>
      <p className="rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-medium text-white/90 backdrop-blur-sm">
        Esc or Exit to show navigation
      </p>
    </div>,
    document.body,
  );
}