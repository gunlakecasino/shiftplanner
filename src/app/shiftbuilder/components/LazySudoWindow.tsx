"use client";

import React from "react";
import { SudoTabLoading } from "../sudo/SudoGlass";

interface LazySudoWindowProps {
  open: boolean;
  onClose: () => void;
  currentNightId: string | null;
  weekStart: any;
  currentOperator: any;
  onSignOut: () => void;
  isDark: boolean;
  permissions: any;
  onDataChanged: () => Promise<void>;
  [key: string]: any;
}

/**
 * Thin wrapper that performs the dynamic import of the real SudoWindow.
 * 
 * Isolates the heavy Sudo admin surface (and its import) out of the giant
 * ShiftBuilderClient.tsx to avoid Turbopack module factory issues during
 * Client evaluation.
 */
export function LazySudoWindow(props: LazySudoWindowProps) {
  const [SudoWindowComp, setSudoWindowComp] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    if (props.open && !SudoWindowComp) {
      import("../sudo/SudoWindow").then((mod) => {
        if (mod.SudoWindow) {
          setSudoWindowComp(() => mod.SudoWindow);
        }
      });
    }
  }, [props.open, SudoWindowComp]);

  if (!SudoWindowComp) {
    if (!props.open) return null;
    return (
      <div className="sb-overlay-backdrop sb-overlay-backdrop--fixed z-[10000] flex items-center justify-center">
        <SudoTabLoading>Loading Sudo</SudoTabLoading>
      </div>
    );
  }

  return <SudoWindowComp {...props} />;
}
