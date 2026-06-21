"use client";

import React from "react";
import { FormattedTaskLabel } from "./FormattedTaskLabel";
import type { TaskTextStyle } from "@/lib/shiftbuilder/taskTextStyle";
import {
  normalizeTaskMarkerType,
  shouldRenderTaskMarker,
  taskMarkerInk,
  taskMarkerWash,
  type TaskMarkerType,
} from "@/lib/shiftbuilder/taskMarkerStyle";
import { taskLevelCss } from "@/lib/shiftbuilder/taskTextStyle";

function MarkerInkLayer({
  children,
  className = "absolute inset-0 z-0 pointer-events-none",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span aria-hidden className={className}>{children}</span>;
}

function MarkerTextLayer({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <span className="relative z-[1]" style={style}>
      {children}
    </span>
  );
}

function FeltHighlight({ ink, isPrint }: { ink: string; isPrint?: boolean }) {
  const wash = taskMarkerWash(ink, isPrint ? 0.3 : 0.34);
  const washSoft = taskMarkerWash(ink, isPrint ? 0.14 : 0.18);
  const washEdge = taskMarkerWash(ink, isPrint ? 0.42 : 0.46);

  return (
    <svg
      className="h-full w-full"
      viewBox="0 0 120 28"
      preserveAspectRatio="none"
      style={{ overflow: "visible", display: "block" }}
    >
      {/* Main chisel-tip wash */}
      <path
        d="M 3 7 C 18 4.5, 42 5.5, 68 6.2 S 108 5.8, 117 7.2 L 118 20 C 116 23.5, 88 24.5, 52 24 C 22 23.5, 5 22.5, 2 19.5 Z"
        fill={wash}
      />
      {/* Softer overlap for uneven ink density */}
      <path
        d="M 0 9 C 24 6.5, 56 7.8, 92 8.5 S 120 7.5, 120 9.5 L 119 18.5 C 112 21.5, 74 22.5, 38 21.8 C 14 21.2, 2 19.8, 0 16.5 Z"
        fill={washSoft}
      />
      {/* Left stroke where the marker first lands */}
      <path
        d="M 4 6.5 C 4 12, 3.5 17.5, 4 22"
        fill="none"
        stroke={washEdge}
        strokeWidth={isPrint ? 3.2 : 4}
        strokeLinecap="round"
      />
      <path
        d="M 6.5 8 C 6.8 13, 6.2 18, 6.8 21.5"
        fill="none"
        stroke={washEdge}
        strokeWidth={isPrint ? 1.4 : 1.8}
        strokeLinecap="round"
        strokeOpacity={0.35}
      />
      {/* Feathered top edge */}
      <path
        d="M 8 6.8 C 34 5.2, 62 6.5, 110 7.5"
        fill="none"
        stroke={washEdge}
        strokeWidth={isPrint ? 1.2 : 1.6}
        strokeLinecap="round"
        strokeOpacity={0.22}
      />
      {/* Feathered bottom edge */}
      <path
        d="M 6 21.5 C 38 23.2, 72 23.8, 114 21.8"
        fill="none"
        stroke={washEdge}
        strokeWidth={isPrint ? 1 : 1.4}
        strokeLinecap="round"
        strokeOpacity={0.18}
      />
    </svg>
  );
}

function FeltUnderline({ ink, isPrint }: { ink: string; isPrint?: boolean }) {
  const h = isPrint ? 7 : 9;
  return (
    <svg
      className="w-full"
      style={{
        height: h,
        overflow: "visible",
        display: "block",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: isPrint ? -1 : -2,
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
      className="h-full w-full"
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      style={{ overflow: "visible", display: "block" }}
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

  if (normalized === "highlight") {
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
          className="relative isolate inline"
          style={{
            padding: isPrintPreview ? "0 4px 1px" : "1px 6px 2px",
            transform: isPrintPreview ? "rotate(-0.15deg)" : "rotate(-0.25deg)",
          }}
        >
          <MarkerInkLayer>
            <FeltHighlight ink={ink} isPrint={isPrintPreview} />
          </MarkerInkLayer>
          <MarkerTextLayer>
            <FormattedTaskLabel label={label} textStyle={textStyle} />
          </MarkerTextLayer>
        </span>
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
          className="relative isolate inline"
          style={{
            padding: isPrintPreview ? "0 2px 1px" : "0 4px 2px",
          }}
        >
          <MarkerInkLayer className="absolute left-0 right-0 bottom-0 z-0 pointer-events-none">
            <FeltUnderline ink={ink} isPrint={isPrintPreview} />
          </MarkerInkLayer>
          <MarkerTextLayer>
            <FormattedTaskLabel label={label} textStyle={textStyle} />
          </MarkerTextLayer>
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
          className="relative isolate inline-block"
          style={{
            padding: isPrintPreview ? "1px 7px 2px" : "2px 10px 3px",
            transform: isPrintPreview ? "rotate(-0.35deg)" : "rotate(-0.55deg)",
          }}
        >
          <MarkerInkLayer>
            <FeltRing ink={ink} isPrint={isPrintPreview} />
          </MarkerInkLayer>
          <MarkerTextLayer>
            <FormattedTaskLabel label={label} textStyle={textStyle} />
          </MarkerTextLayer>
        </span>
      </span>
    );
  }

  return (
    <span className={className} style={base}>
      <FormattedTaskLabel label={label} textStyle={textStyle} />
    </span>
  );
}

export default TaskMarkerLabel;