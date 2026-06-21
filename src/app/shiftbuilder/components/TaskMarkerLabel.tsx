"use client";

import React from "react";
import { FormattedTaskLabel } from "./FormattedTaskLabel";
import type { TaskTextStyle } from "@/lib/shiftbuilder/taskTextStyle";
import {
  normalizeTaskMarkerType,
  shouldRenderTaskMarker,
  taskMarkerContainerStyle,
  taskMarkerInk,
  type TaskMarkerType,
} from "@/lib/shiftbuilder/taskMarkerStyle";
import { taskLevelCss } from "@/lib/shiftbuilder/taskTextStyle";

function FeltUnderline({ ink, isPrint }: { ink: string; isPrint?: boolean }) {
  const h = isPrint ? 7 : 9;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 w-full"
      style={{
        bottom: isPrint ? -1 : -2,
        height: h,
        overflow: "visible",
      }}
      viewBox="0 0 120 10"
      preserveAspectRatio="none"
    >
      <path
        d="M1 6.5 C 22 4.2, 38 7.8, 58 5.6 S 96 7.2, 119 5.8"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 7 : 8.5}
        strokeLinecap="round"
        strokeOpacity={0.42}
      />
      <path
        d="M0 7.2 C 28 8.8, 52 4.6, 78 7.4 S 108 5.8, 120 7.6"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 4 : 5}
        strokeLinecap="round"
        strokeOpacity={0.22}
      />
      <path
        d="M3 5.8 C 30 3.6, 55 6.2, 82 4.8 S 110 6.4, 117 5.2"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 2.5 : 3}
        strokeLinecap="round"
        strokeOpacity={0.14}
      />
    </svg>
  );
}

function FeltRing({ ink, isPrint }: { ink: string; isPrint?: boolean }) {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      style={{ overflow: "visible" }}
    >
      <path
        d="M 8 20 C 10 8, 32 4, 50 5 C 72 6, 92 10, 94 22 C 95 30, 78 34, 50 33 C 24 32, 6 28, 8 20 Z"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 2.2 : 2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.78}
      />
      <path
        d="M 10 19 C 12 9, 34 6, 52 7 C 70 8, 90 12, 91 21 C 92 29, 76 32, 52 31 C 28 30, 9 27, 10 19 Z"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 1.4 : 1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.28}
        transform="translate(1.2 0.8)"
      />
      <path
        d="M 7 21 C 9 11, 30 7, 48 8 C 68 9, 93 13, 95 23 C 96 31, 80 35, 48 34 C 22 33, 5 29, 7 21 Z"
        fill="none"
        stroke={ink}
        strokeWidth={isPrint ? 1 : 1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={0.16}
        transform="translate(-0.8 -0.6)"
      />
    </svg>
  );
}

export function TaskMarkerLabel({
  label,
  color,
  markerType,
  textStyle,
  className = "block rounded-sm font-medium py-px",
  isPrintPreview = false,
  fontSize,
  hanging,
  textColor,
}: {
  label: string;
  color?: string | null;
  markerType?: TaskMarkerType | string | null;
  textStyle?: TaskTextStyle | null;
  className?: string;
  isPrintPreview?: boolean;
  fontSize?: string;
  hanging?: { textIndent: string; paddingLeft: string };
  textColor?: string;
}) {
  const normalized = normalizeTaskMarkerType(markerType);
  const showMarker = shouldRenderTaskMarker(normalized, color);
  const ink = taskMarkerInk(color);

  const base: React.CSSProperties = {
    fontSize: textStyle?.fontSizePx ? `${textStyle.fontSizePx}px` : fontSize,
    textIndent: hanging?.textIndent ?? "0",
    paddingLeft: hanging?.paddingLeft ?? "0",
    color: textColor,
    ...taskLevelCss(textStyle),
    ...(isPrintPreview
      ? { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : {}),
  };

  if (!showMarker || normalized === "none") {
    return (
      <span className={className} style={base}>
        <FormattedTaskLabel label={label} textStyle={textStyle} />
      </span>
    );
  }

  if (normalized === "underline") {
    return (
      <span
        className={className}
        style={{
          ...base,
          backgroundColor: "transparent",
          borderLeft: "none",
        }}
      >
        <span
          className="relative inline"
          style={{
            padding: isPrintPreview ? "0 2px 1px" : "0 4px 2px",
          }}
        >
          <FeltUnderline ink={ink} isPrint={isPrintPreview} />
          <FormattedTaskLabel label={label} textStyle={textStyle} />
        </span>
      </span>
    );
  }

  if (normalized === "circle") {
    return (
      <span
        className={className}
        style={{
          ...base,
          backgroundColor: "transparent",
          borderLeft: "none",
          display: "inline-block",
        }}
      >
        <span
          className="relative inline-block"
          style={{
            padding: isPrintPreview ? "1px 7px 2px" : "2px 10px 3px",
            transform: isPrintPreview ? "rotate(-0.35deg)" : "rotate(-0.55deg)",
          }}
        >
          <FeltRing ink={ink} isPrint={isPrintPreview} />
          <FormattedTaskLabel label={label} textStyle={textStyle} />
        </span>
      </span>
    );
  }

  const style = taskMarkerContainerStyle(color, normalized, {
    base,
    isPrint: isPrintPreview,
  });

  return (
    <span className={className} style={style}>
      <FormattedTaskLabel label={label} textStyle={textStyle} />
    </span>
  );
}

export default TaskMarkerLabel;