"use client";

import { cn } from "@/lib/utils";

export type BarChartItem = {
  label: string;
  value: number;
  color?: string;
  meta?: string;
};

type BarChartProps = {
  items: BarChartItem[];
  orientation?: "vertical" | "horizontal";
  maxValue?: number;
  height?: number;
  barHeight?: number;
  showValues?: boolean;
  className?: string;
};

export function BarChart({
  items,
  orientation = "vertical",
  maxValue,
  height = 140,
  barHeight = 10,
  showValues = true,
  className,
}: BarChartProps) {
  const max = maxValue ?? Math.max(...items.map((i) => i.value), 1);

  if (orientation === "horizontal") {
    return (
      <div className={cn("flex flex-col gap-2.5", className)}>
        {items.map((item) => {
          const color = item.color ?? "#007AFF";
          const pct = (item.value / max) * 100;
          return (
            <div key={item.label} className="flex items-center gap-3">
              <span className="w-[72px] shrink-0 text-[10px] font-semibold text-[var(--ios-label-tertiary)]">
                {item.label}
              </span>
              <div className="relative h-[10px] flex-1 overflow-hidden rounded-full bg-[var(--ios-gray-6)]">
                <div
                  className="sb-progress-bar absolute left-0 top-0 h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.88 }}
                />
              </div>
              {showValues && (
                <span
                  className="w-10 shrink-0 text-right text-[11px] font-bold tabular-nums"
                  style={{ color }}
                >
                  {item.value}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end justify-between gap-2", className)} style={{ height }}>
      {items.map((item) => {
        const color = item.color ?? "#007AFF";
        const barH = Math.max(4, Math.round((item.value / max) * (height - 28)));
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            {showValues && (
              <span className="text-[10px] font-bold tabular-nums" style={{ color }}>
                {item.value}
              </span>
            )}
            <div
              className="w-full max-w-[28px] rounded-md transition-[height] duration-500 ease-out"
              style={{ height: barH, backgroundColor: color, opacity: item.value > 0 ? 0.88 : 0.25 }}
              title={item.meta ?? `${item.label}: ${item.value}`}
            />
            <span className="text-[9px] font-semibold text-[var(--ios-label-tertiary)]">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}