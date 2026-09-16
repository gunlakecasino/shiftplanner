// v1.1 — iPad UI/UX world-class release
"use client";

import React from "react";
import Link from "next/link";
import { GraveCoverGuideTutorial } from "./GraveCoverGuideTutorial";
import { useTheme } from "../hooks/useTheme";

export const SB_OPEN_HELP_EVENT = "sb-open-help";

/** Tutorial host only — Help lives in FloatingNav More, not a topbar FAB. */
export default function ShiftBuilderHelpButton() {
  const { isDark } = useTheme();
  const [tutorialOpen, setTutorialOpen] = React.useState(false);

  React.useEffect(() => {
    const open = () => setTutorialOpen(true);
    window.addEventListener(SB_OPEN_HELP_EVENT, open);
    return () => window.removeEventListener(SB_OPEN_HELP_EVENT, open);
  }, []);

  return (
    <>
      <GraveCoverGuideTutorial
        open={tutorialOpen}
        isDark={isDark}
        onClose={() => setTutorialOpen(false)}
        onFinish={() => setTutorialOpen(false)}
      />

      <Link href="/sheetbuilder/help" className="sr-only">
        SheetBuilder help and floor guide
      </Link>
    </>
  );
}
