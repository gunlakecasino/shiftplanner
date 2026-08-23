"use client";

import React from "react";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";
import { PORTRAIT_HEIGHT_PX, PORTRAIT_WIDTH_PX } from "./portraitConstants";

export const PRINT_PREVIEW_SHEET_SCALE = 0.46;

const SCALED_W = Math.round(GOLDEN_WIDTH_PX * PRINT_PREVIEW_SHEET_SCALE);
const SCALED_H = Math.round(GOLDEN_HEIGHT_PX * PRINT_PREVIEW_SHEET_SCALE);

export type PrintPreviewScaledSheetProps = {
  label: string;
  children: React.ReactNode;
  artboardWidth?: number;
  artboardHeight?: number;
};

/**
 * Renders a 1056×816 Golden artboard at a reduced visual size while keeping
 * layout footprint equal to the scaled dimensions (transform does not reserve
 * full artboard width in the flex row).
 */
export function PrintPreviewScaledSheet({
  label,
  children,
  artboardWidth = GOLDEN_WIDTH_PX,
  artboardHeight = GOLDEN_HEIGHT_PX,
}: PrintPreviewScaledSheetProps) {
  const scaledW = Math.round(artboardWidth * PRINT_PREVIEW_SHEET_SCALE);
  const scaledH = Math.round(artboardHeight * PRINT_PREVIEW_SHEET_SCALE);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: scaledW,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "1.5px",
          color: "#6B7280",
          marginBottom: 4,
          textTransform: "uppercase",
          textAlign: "center",
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: scaledW,
          height: scaledH,
          overflow: "hidden",
          border: "1px solid var(--ios-gray-6)",
          borderRadius: 2,
          boxShadow:
            "0 10px 40px -10px rgba(0,0,0,0.18), 0 0 0 1px rgba(255,255,255,0.6) inset",
          background: "#fff",
          position: "relative",
        }}
      >
        <div
          style={{
            width: artboardWidth,
            height: artboardHeight,
            transform: `scale(${PRINT_PREVIEW_SHEET_SCALE})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function printPreviewStageWidth(
  sheetCount: 1 | 2,
  gapPx = 20,
  artboardWidth = GOLDEN_WIDTH_PX,
): number {
  const scaledW = Math.round(artboardWidth * PRINT_PREVIEW_SHEET_SCALE);
  return sheetCount === 2 ? scaledW * 2 + gapPx : scaledW;
}

export function printPreviewStageHeight(artboardHeight = GOLDEN_HEIGHT_PX): number {
  return Math.round(artboardHeight * PRINT_PREVIEW_SHEET_SCALE) + 24;
}

export { PORTRAIT_WIDTH_PX, PORTRAIT_HEIGHT_PX };