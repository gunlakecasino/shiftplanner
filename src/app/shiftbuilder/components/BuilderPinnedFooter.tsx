"use client";

import React from "react";
import { shiftBuilderVersionLabel } from "../version";

export interface BuilderPinnedFooterProps {
  sheetBrandTitle?: string;
  pageLabel: string;
  isDark?: boolean;
  onOpenSettings?: () => void;
}

/**
 * Builder-only chrome pinned to the bottom of the stage (not scaled).
 * Brand left · version center · page right.
 */
export function BuilderPinnedFooter({
  sheetBrandTitle = "Weekly Zone Deployment Book",
  pageLabel,
  isDark = false,
  onOpenSettings,
}: BuilderPinnedFooterProps) {
  const versionLongPressRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearVersionLongPress = React.useCallback(() => {
    if (versionLongPressRef.current) {
      clearTimeout(versionLongPressRef.current);
      versionLongPressRef.current = null;
    }
  }, []);

  const handleVersionPointerDown = React.useCallback(() => {
    if (!onOpenSettings) return;
    clearVersionLongPress();
    versionLongPressRef.current = setTimeout(() => {
      versionLongPressRef.current = null;
      onOpenSettings();
    }, 600);
  }, [onOpenSettings, clearVersionLongPress]);

  return (
    <footer
      className="sb-builder-pinned-footer no-print"
      style={{
        color: isDark ? "#9CA3AF" : "#9CA3AF",
        fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
      }}
    >
      <div className="sb-builder-pinned-footer__brand min-w-0 truncate">
        <span className="font-bold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
          SBS
        </span>
        <span className="mx-1 opacity-60">©</span>
        <span style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>{sheetBrandTitle}</span>
        <span className="mx-1 opacity-40">—</span>
        <span className="font-semibold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
          GRAVES
        </span>
      </div>

      <div
        className="sb-builder-pinned-footer__version shrink-0 tabular-nums select-none"
        onPointerDown={handleVersionPointerDown}
        onPointerUp={clearVersionLongPress}
        onPointerLeave={clearVersionLongPress}
        onPointerCancel={clearVersionLongPress}
        onContextMenu={(e) => e.preventDefault()}
      >
        {shiftBuilderVersionLabel()}
      </div>

      <div
        className="sb-builder-pinned-footer__page shrink-0 tabular-nums text-right"
        style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}
      >
        {pageLabel}
      </div>
    </footer>
  );
}