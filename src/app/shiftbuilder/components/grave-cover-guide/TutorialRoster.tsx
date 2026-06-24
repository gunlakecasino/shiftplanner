"use client";

import React from "react";
import type { TutorialAssignment } from "./tutorialScenario";

type TutorialRosterProps = {
  placed: TutorialAssignment[];
  calledOff: Array<{ tmId: string; tmName: string }>;
  highlightCalledOff?: boolean;
};

function MsIcon({ name, size = 12 }: { name: string; size?: number }) {
  return (
    <span
      className="ms"
      style={{
        fontSize: size,
        fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20',
      }}
    >
      {name}
    </span>
  );
}

export function TutorialRoster({
  placed,
  calledOff,
  highlightCalledOff = false,
}: TutorialRosterProps) {
  const placedCount = placed.length;
  const unplacedCount = 0;
  const placementPct = 100;

  return (
    <aside className={`sb-roster-shell sb-guide-roster-panel ${highlightCalledOff ? "sb-guide-target" : ""}`}>
      <header className="sb-roster-header">
        <div className="sb-roster-header__title-row">
          <div className="sb-roster-header__glyph" aria-hidden>
            <MsIcon name="groups" size={13} />
          </div>
          <span className="sb-roster-header__title">Grave Roster</span>
          <div className="sb-roster-header__line" />
        </div>
        <p className="sb-roster-header__subtitle">Graves band · practice scenario</p>
        <div className="sb-roster-stats">
          <span className="sb-roster-stat sb-roster-stat--placed">
            <span className="sb-roster-stat__dot" />
            {placedCount} placed
          </span>
          <span className="sb-roster-stat sb-roster-stat--pending">
            <span className="sb-roster-stat__dot" />
            {unplacedCount} to place
          </span>
        </div>
        <div className="sb-roster-progress" aria-hidden>
          <div className="sb-roster-progress__fill" style={{ width: `${placementPct}%` }} />
        </div>
      </header>

      <div className="sb-roster-controls">
        <div className="sb-roster-search-wrap">
          <input
            type="text"
            readOnly
            placeholder="Search by name or ID…"
            className="sb-roster-search"
          />
          <div className="sb-roster-search__icon">
            <MsIcon name="search" size={14} />
          </div>
        </div>
        <div className="sb-roster-segment" role="group" aria-label="Schedule band filter">
          <button type="button" className="sb-roster-segment__btn sb-roster-segment__btn--active">
            All bands
          </button>
          <button type="button" className="sb-roster-segment__btn">
            Graves only
          </button>
        </div>
      </div>

      <div className="sb-roster-body">
        <section className="sb-roster-section">
          <button type="button" className="sb-roster-section__btn sb-roster-section__btn--placed" aria-expanded>
            <span className="sb-roster-section__left min-w-0">
              <MsIcon name="chevron_right" />
              <span className="sb-roster-section__label sb-roster-section__label--placed truncate">
                Already Placed
              </span>
            </span>
            <span className="sb-roster-section__count sb-roster-section__count--placed">{placedCount}</span>
          </button>
          {placed.map((tm) => (
            <div key={tm.tmId} className="sb-roster-item sb-roster-item--placed px-3 py-1.5 text-[12px] text-[var(--sb-text-2)]">
              {tm.tmName}
            </div>
          ))}
        </section>

        <section className="sb-roster-section">
          <div className="sb-roster-banner">
            <div className="flex-1 h-px sb-gold-rule" />
            <span className="sb-roster-banner__label">On Sheet — Not Placed</span>
            <div className="flex-1 h-px sb-gold-rule" />
          </div>
          <p className="sb-roster-empty text-[11px] px-3 py-2">No unplaced TMs — typical on grave.</p>
        </section>

        {calledOff.length > 0 && (
          <section className={`sb-roster-section ${highlightCalledOff ? "sb-guide-target sb-guide-target--pulse" : ""}`}>
            <div className="sb-roster-divider" />
            <button type="button" className="sb-roster-section__btn" aria-expanded>
              <span className="sb-roster-section__left min-w-0">
                <MsIcon name="chevron_right" />
                <span className="sb-roster-section__label sb-roster-section__label--warn truncate">
                  Called Off
                </span>
              </span>
              <span className="sb-roster-section__count sb-roster-section__count--warn">{calledOff.length}</span>
            </button>
            {calledOff.map((tm) => (
              <div key={tm.tmId} className="sb-roster-called-chip">
                <span className="sb-roster-called-chip__name">{tm.tmName}</span>
                <span className="sb-roster-called-chip__badge">off</span>
                <button type="button" className="sb-roster-called-chip__restore sb-interactive" disabled>
                  Restore
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}