// v1.1 — iPad UI/UX world-class release
"use client";

import React from "react";
import Link from "next/link";
import { GraveCoverGuideTutorial } from "./GraveCoverGuideTutorial";
import { useTheme } from "../hooks/useTheme";
import "./shiftBuilderHelpButton.css";

export default function ShiftBuilderHelpButton() {
  const { isDark } = useTheme();
  const [tutorialOpen, setTutorialOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        className="sb-help-fab no-print"
        aria-label="Open SheetBuilder help"
        title="Help — interactive tutorial & floor guide"
        onClick={() => setTutorialOpen(true)}
      >
        ?
      </button>

      <GraveCoverGuideTutorial
        open={tutorialOpen}
        isDark={isDark}
        onClose={() => setTutorialOpen(false)}
        onFinish={() => setTutorialOpen(false)}
      />

      {/* Screen-reader path to full help page (non-visual) */}
      <Link href="/sheetbuilder/help" className="sr-only">
        SheetBuilder help and floor guide
      </Link>
    </>
  );
}
