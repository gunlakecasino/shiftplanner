"use client";

import React from "react";
import { BuilderLoadingLine } from "./builderPrimitives";

interface LazyCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialContext?: any;
  onAddTask?: any;
  onCycleBreak?: any;
  onSetGravePool?: any;
  onSetDisplayName?: any;
  onRemoveFromSchedule?: any;
  onAddCoverage?: any;
  selectedSlotAssignment?: any;
  [key: string]: any;
}

/**
 * Thin wrapper that performs the dynamic import of the real CommandPalette.
 * 
 * This isolates the `import("./CommandPalette")` expression (and its transitive
 * dep on useCommandActions) into a small dedicated module.
 * 
 * The giant ShiftBuilderClient.tsx no longer contains the import string in its
 * source, which helps Turbopack's HMR chunk registration avoid "module factory
 * is not available" errors for useCommandActions during Client evaluation.
 */
export function LazyCommandPalette(props: LazyCommandPaletteProps) {
  const [CommandPaletteComp, setCommandPaletteComp] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    if (props.open && !CommandPaletteComp) {
      // Relative to components/ directory
      import("../CommandPalette").then((mod) => {
        if (mod.CommandPalette) {
          setCommandPaletteComp(() => mod.CommandPalette);
        }
      });
    }
  }, [props.open, CommandPaletteComp]);

  if (!CommandPaletteComp) {
    if (!props.open) return null;
    return (
      <div className="sb-overlay-backdrop sb-overlay-backdrop--fixed z-[10050] flex items-center justify-center">
        <BuilderLoadingLine className="!mt-0 text-sm">Opening command palette</BuilderLoadingLine>
      </div>
    );
  }

  return <CommandPaletteComp {...props} />;
}
