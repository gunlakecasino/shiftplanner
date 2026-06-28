// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
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
        aria-label="Open ShiftBuilder help"
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
      <Link href="/shiftbuilder/help" className="sr-only">
        ShiftBuilder help and floor guide
      </Link>
    </>
  );
}