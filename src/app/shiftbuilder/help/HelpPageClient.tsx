// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
"use client";

import React from "react";
import Link from "next/link";
import { SimpleMarkdown } from "../components/SimpleMarkdown";
import { GraveCoverGuideTutorial } from "../components/GraveCoverGuideTutorial";
import { useTheme } from "../hooks/useTheme";
import "./helpPage.css";

export default function HelpPageClient({ markdown }: { markdown: string }) {
  const { isDark } = useTheme();
  const [tutorialOpen, setTutorialOpen] = React.useState(false);

  return (
    <div className="sb-help-page">
      <div className="sb-help-page__inner">
        <header className="sb-help-page__header">
          <h1 className="sb-help-page__title">ShiftBuilder Help</h1>
          <div className="sb-help-page__actions">
            <Link href="/shiftbuilder" className="sb-help-page__btn">
              Back to board
            </Link>
            <button
              type="button"
              className="sb-help-page__btn sb-help-page__btn--primary"
              onClick={() => setTutorialOpen(true)}
            >
              Launch interactive tutorial
            </button>
          </div>
        </header>

        <section className="sb-help-page__panel" aria-label="Floor guide">
          <SimpleMarkdown source={markdown} />
        </section>
      </div>

      <GraveCoverGuideTutorial
        open={tutorialOpen}
        isDark={isDark}
        onClose={() => setTutorialOpen(false)}
        onFinish={() => setTutorialOpen(false)}
      />
    </div>
  );
}