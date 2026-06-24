"use client";

import { cn } from "@/lib/utils";

type ProgressBarProps = {
  value: number;
  max?: number;
  color?: string;
  label?: string;
  valueLabel?: string;
  height?: number;
  showTrack?: boolean;
  className?: string;
};

export function ProgressBar({
  value,
  max = 100,
  color = "#007AFF",
  label,
  valueLabel,
  height = 8,
  showTrack = true,
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;

  return (
    <div className={cn("w-full", className)}>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label && (
            <span className="truncate text-[11px] font-medium text-[var(--ios-label-secondary)]">
              {label}
            </span>
          )}
          {valueLabel && (
            <span
              className="shrink-0 text-[11px] font-bold tabular-nums"
              style={{ color }}
            >
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full",
          showTrack && "bg-[var(--ios-gray-6)]",
        )}
        style={{ height }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className="sb-progress-bar absolute left-0 top-0 h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.9 }}
        />
      </div>
    </div>
  );
}