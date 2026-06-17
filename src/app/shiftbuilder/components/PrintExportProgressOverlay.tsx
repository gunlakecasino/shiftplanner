"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Printer } from "lucide-react";

export type PrintExportProgress = {
  current: number;
  total: number;
  label: string;
};

type PrintExportProgressOverlayProps = {
  active: boolean;
  mode: "print" | "export";
  progress: PrintExportProgress | null;
  isDark: boolean;
};

export function PrintExportProgressOverlay({
  active,
  mode,
  progress,
  isDark,
}: PrintExportProgressOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !active) return null;

  const tx = isDark ? "#F2F2F4" : "#1C1C1E";
  const ts = isDark ? "#8E8E93" : "#6B7280";
  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  const title = mode === "export" ? "Building your export" : "Preparing to print";
  const subtitle =
    mode === "export"
      ? "Rendering Golden sheets — this may take a moment"
      : "Loading Golden sheets for the print dialog";
  const Icon = mode === "export" ? Download : Printer;

  return createPortal(
    <div
      className="sb-print-export-progress-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: isDark ? "rgba(0,0,0,0.72)" : "rgba(15,15,20,0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        pointerEvents: "all",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          padding: "28px 32px 24px",
          borderRadius: 20,
          background: isDark ? "rgba(28,28,30,0.96)" : "rgba(250,250,252,0.98)",
          border: `1px solid ${isDark ? "rgba(72,72,74,0.6)" : "rgba(209,209,214,0.7)"}`,
          boxShadow: isDark
            ? "0 32px 80px rgba(0,0,0,0.55)"
            : "0 32px 80px rgba(0,0,0,0.18)",
          textAlign: "center",
        }}
      >
        <div
          className="sb-progress-pulse"
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            margin: "0 auto 18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg,#0A84FF 0%,#0060D0 100%)",
            boxShadow: "0 8px 24px rgba(10,132,255,0.4)",
          }}
        >
          <Icon size={26} color="#fff" strokeWidth={2} />
        </div>

        <p style={{ fontSize: 16, fontWeight: 700, color: tx, marginBottom: 4 }}>
          {title}
          <span className="sb-loading-dots" aria-hidden="true" />
        </p>
        <p style={{ fontSize: 12, color: ts, marginBottom: 16, lineHeight: 1.45 }}>
          {subtitle}
        </p>

        <p style={{ fontSize: 13, fontWeight: 600, color: tx, marginBottom: 10, minHeight: 20 }}>
          {progress?.label ?? "Starting…"}
        </p>

        {progress && progress.total > 0 ? (
          <div style={{ fontSize: 11, color: ts, marginBottom: 14 }}>
            Sheet {progress.current} of {progress.total}
          </div>
        ) : null}

        <div
          style={{
            width: "100%",
            height: 5,
            borderRadius: 3,
            background: isDark ? "rgba(72,72,74,0.5)" : "rgba(209,209,214,0.5)",
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          <div
            className="sb-progress-bar"
            style={{
              height: "100%",
              width: `${pct}%`,
              background: "linear-gradient(90deg,#0A84FF,#30D158)",
              borderRadius: 3,
              transition: "width 220ms ease-out",
            }}
          />
        </div>

        <div style={{ fontSize: 10, color: ts, opacity: 0.65 }}>
          Please wait — do not close this window
        </div>
      </div>
    </div>,
    document.body,
  );
}