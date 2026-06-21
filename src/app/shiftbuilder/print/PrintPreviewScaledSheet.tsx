"use client";

import React from "react";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";

export const PRINT_PREVIEW_SHEET_SCALE = 0.46;

const SCALED_W = Math.round(GOLDEN_WIDTH_PX * PRINT_PREVIEW_SHEET_SCALE);
const SCALED_H = Math.round(GOLDEN_HEIGHT_PX * PRINT_PREVIEW_SHEET_SCALE);

export type PrintPreviewScaledSheetProps = {
  label: string;
  children: React.ReactNode;
};

/**
 * Renders a 1056×816 Golden artboard at a reduced visual size while keeping
 * layout footprint equal to the scaled dimensions (transform does not reserve
 * full artboard width in the flex row).
 */
export function PrintPreviewScaledSheet({ label, children }: PrintPreviewScaledSheetProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: SCALED_W,
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
          width: SCALED_W,
          height: SCALED_H,
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
            width: GOLDEN_WIDTH_PX,
            height: GOLDEN_HEIGHT_PX,
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

export function printPreviewStageWidth(sheetCount: 1 | 2, gapPx = 20): number {
  return sheetCount === 2 ? SCALED_W * 2 + gapPx : SCALED_W;
}

export function printPreviewStageHeight(): number {
  return SCALED_H + 24;
}