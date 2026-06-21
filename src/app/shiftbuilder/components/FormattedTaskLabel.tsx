"use client";

import React from "react";
import {
  buildFormattedTextSegments,
  type TaskTextStyle,
} from "@/lib/shiftbuilder/taskTextStyle";

export function FormattedTaskLabel({
  label,
  textStyle,
  className = "",
  baseStyle,
}: {
  label: string;
  textStyle?: TaskTextStyle | null;
  className?: string;
  baseStyle?: React.CSSProperties;
}) {
  const segments = buildFormattedTextSegments(label, textStyle);
  return (
    <span className={className} style={baseStyle}>
      {segments.map((seg, i) => (
        <span key={`${i}-${seg.text}`} style={seg.style}>
          {seg.text}
        </span>
      ))}
    </span>
  );
}

export default FormattedTaskLabel;