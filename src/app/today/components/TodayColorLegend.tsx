"use client";

import { useEffect, useState } from "react";
import { ZONE_DEFS, getZoneColor } from "@/lib/shiftbuilder/constants";
import { cn } from "@/lib/utils";

const LEGEND_KEY = "today_color_legend_seen";

type TodayColorLegendProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function TodayColorLegend({ visible, onDismiss }: TodayColorLegendProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    try {
      if (sessionStorage.getItem(LEGEND_KEY) === "1") return;
      setShow(true);
      const t = setTimeout(() => {
        sessionStorage.setItem(LEGEND_KEY, "1");
        setShow(false);
        onDismiss();
      }, 6000);
      return () => clearTimeout(t);
    } catch {
      setShow(true);
    }
  }, [visible, onDismiss]);

  if (!show) return null;

  const zones = ZONE_DEFS.slice(0, 8);

  return (
    <div
      className="sb-today-color-legend pointer-events-none fixed bottom-24 left-1/2 z-30 max-w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl border border-black/8 bg-white/94 px-3 py-2 shadow-lg backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.25em] text-[#8E8E93]">
        Zone colors
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {zones.map((z) => (
          <span
            key={z.key}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-black/6 px-2 py-0.5 text-[10px] font-semibold text-[#1C1C1E]",
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: getZoneColor(z.key) }}
            />
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}