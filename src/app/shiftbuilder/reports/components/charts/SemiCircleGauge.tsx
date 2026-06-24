"use client";

import { cn } from "@/lib/utils";

type SemiCircleGaugeProps = {
  value: number;
  max?: number;
  label: string;
  sublabel?: string;
  color?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
};

export function SemiCircleGauge({
  value,
  max = 100,
  label,
  sublabel,
  color = "#4D1A8A",
  size = 120,
  strokeWidth = 10,
  className,
}: SemiCircleGaugeProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <svg width={size} height={size / 2 + strokeWidth} className="overflow-visible">
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke="var(--ios-gray-6, #e5e5ea)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="sb-gauge-arc transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          className="fill-[var(--ios-label)] text-[22px] font-bold tabular-nums"
          style={{ fontFamily: "var(--font-bricolage, system-ui)" }}
        >
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="mt-1 text-center">
        <div className="text-[12px] font-semibold tracking-[-0.2px] text-[var(--ios-label)]">
          {label}
        </div>
        {sublabel && (
          <div className="mt-0.5 text-[10px] text-[var(--ios-label-tertiary)]">{sublabel}</div>
        )}
      </div>
    </div>
  );
}