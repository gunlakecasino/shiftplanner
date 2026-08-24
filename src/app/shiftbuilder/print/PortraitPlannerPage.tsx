import React from "react";
import type {
  PlannerRosterGroup,
  PlannerRosterEntry,
  PlannerSlotCard,
  PortraitPlannerPageModel,
} from "./buildPortraitPlannerModel";
import { formatPlannerTrailLine } from "./buildPortraitPlannerModel";
import { PLANNER_NOTES_MIN_PX } from "./portraitConstants";
import "./printPreview.css";

export type PortraitPlannerPageProps = {
  model: PortraitPlannerPageModel;
};

function PlannerTrail({ labels }: { labels: string[] }) {
  const line = formatPlannerTrailLine(labels);
  return (
    <div className="sb-planner-trail" aria-hidden={line ? undefined : true}>
      {line}
    </div>
  );
}

function PlannerSlotBox({ card }: { card: PlannerSlotCard }) {
  const coverCue = card.covers.length > 0 ? `+${card.covers.join(" +")}` : null;
  const viaCue = card.coveredVia ? `via ${card.coveredVia}` : null;
  const isCovered = Boolean(card.empty && card.coveredVia);
  const stateClass = card.empty ? (isCovered ? " is-covered" : " is-empty") : "";

  return (
    <div
      className={`sb-planner-slot${stateClass}`}
      style={{ ["--sb-planner-accent" as string]: card.accent }}
      data-slot-key={card.key}
    >
      <div className="sb-planner-slot-stripe" />
      <div className="sb-planner-slot-label">{card.label}</div>
      <div className="sb-planner-slot-writein">
        {card.empty ? (
          <div className="sb-planner-slot-open" aria-label={isCovered ? `Covered ${viaCue}` : "Open"}>
            <span className="sb-planner-slot-name sb-planner-slot-line" />
            {viaCue ? <span className="sb-planner-slot-via">{viaCue}</span> : <PlannerTrail labels={[]} />}
          </div>
        ) : (
          <div className="sb-planner-slot-name-row">
            <div className="sb-planner-slot-name sb-planner-slot-line">{card.tmName}</div>
            <PlannerTrail labels={card.trail} />
            {coverCue ? <div className="sb-planner-slot-covers">{coverCue}</div> : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  label,
  count,
  children,
  className = "",
}: {
  label: string;
  count: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`sb-planner-section ${className}`.trim()}>
      <div className="sb-planner-section-head">
        <span className="sb-planner-section-label">{label}</span>
        <span className="sb-planner-section-rule" />
        <span className="sb-planner-section-count">{count}</span>
      </div>
      {children}
    </section>
  );
}

function filledCount(cards: PlannerSlotCard[]): number {
  return cards.filter((card) => !card.empty).length;
}

function rosterRowClass(row: PlannerRosterEntry): string {
  return `sb-planner-roster-row${row.placed ? " is-placed" : ""}`;
}

function RosterWriteins({ lines = 2 }: { lines?: number }) {
  return (
    <ul className="sb-planner-roster-writeins" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <li key={index} className="sb-planner-roster-writein-row">
          <span className="sb-planner-roster-mark" />
          <span className="sb-planner-roster-writein-line" />
        </li>
      ))}
    </ul>
  );
}

function RosterGroup({ group }: { group: PlannerRosterGroup }) {
  const head = group.continued ? `${group.label} · cont.` : group.label;
  return (
    <li className="sb-planner-roster-group">
      <div className="sb-planner-roster-group-head">{head}</div>
      <ol className="sb-planner-roster-names">
        {group.rows.map((row) => (
          <li key={row.tmId} className={rosterRowClass(row)}>
            <span className="sb-planner-roster-mark" aria-hidden="true" />
            <span className="sb-planner-roster-copy">
              <span className="sb-planner-roster-name">{row.name}</span>
              <PlannerTrail labels={row.trail} />
            </span>
          </li>
        ))}
      </ol>
      <RosterWriteins lines={2} />
    </li>
  );
}

export function PortraitPlannerPage({ model }: PortraitPlannerPageProps) {
  const pageNote =
    model.pageCount > 1 ? ` · ${model.pageIndex} of ${model.pageCount}` : "";
  const rosterLabel = model.rosterContinued ? "Scheduled · cont." : "Scheduled";

  return (
    <div
      className="print-artboard sb-planner-sheet"
      data-print-view="planner"
      data-print-orientation="portrait"
    >
      <header className="sb-planner-header">
        <div className="sb-planner-header-row">
          <div className="sb-planner-header-left">
            <div className="sb-planner-kicker">Planner</div>
            <div className="sb-planner-title">
              {model.dayName}
              {pageNote}
            </div>
            <div className="sb-planner-sub">
              {model.monthYear} · {model.nightMeta} · huddle worksheet
            </div>
          </div>
          <div className="sb-planner-header-right">
            <div className="sb-planner-daynum" style={{ color: model.dayColor }}>
              {model.dateNum}
            </div>
          </div>
        </div>
      </header>

      <div className="sb-planner-body">
        <aside className="sb-planner-roster" aria-label="Scheduled tonight">
          <div className="sb-planner-roster-head">{rosterLabel}</div>
          <ol className="sb-planner-roster-list">
            {model.rosterGroups.map((group) => (
              <RosterGroup key={`${group.band}-${group.continued ? "cont" : "start"}`} group={group} />
            ))}
          </ol>
          <div className="sb-planner-roster-writein" aria-hidden="true" />
        </aside>

        <main className="sb-planner-main">
          <Section
            className="sb-planner-section-rr"
            label="Restrooms"
            count={`${filledCount(model.restrooms)} / ${model.restrooms.length}`}
          >
            <div className="sb-planner-grid sb-planner-grid-rr">
              {model.restrooms.map((card) => (
                <PlannerSlotBox key={card.key} card={card} />
              ))}
            </div>
          </Section>

          <Section
            className="sb-planner-section-zones"
            label="Zones"
            count={`${filledCount(model.zones)} / ${model.zones.length}`}
          >
            <div className="sb-planner-grid sb-planner-grid-zones">
              {model.zones.map((card) => (
                <PlannerSlotBox key={card.key} card={card} />
              ))}
            </div>
          </Section>

          <Section
            className="sb-planner-section-aux"
            label="Aux"
            count={`${filledCount(model.aux)} / ${Math.max(model.aux.length, 1)}`}
          >
            <div className="sb-planner-grid sb-planner-grid-aux">
              {model.aux.map((card) => (
                <PlannerSlotBox key={card.key} card={card} />
              ))}
            </div>
          </Section>

          <Section
            className="sb-planner-section-ol"
            label="Overlaps"
            count={`${filledCount(model.overlaps.flatMap((row) => row.slots))} / 12`}
          >
            <div className="sb-planner-overlaps">
              {model.overlaps.map((row) => (
                <div key={row.key} className="sb-planner-overlap-row">
                  <div className="sb-planner-overlap-meta">
                    <span className="sb-planner-overlap-day" style={{ color: row.headerColor }}>
                      {row.dayName} {row.dateNum}
                    </span>
                    <span className="sb-planner-overlap-time">{row.time}</span>
                  </div>
                  <div className="sb-planner-grid sb-planner-grid-ol">
                    {row.slots.map((card) => (
                      <PlannerSlotBox key={card.key} card={card} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </main>
      </div>

      <section
        className="sb-planner-notes"
        aria-label="Huddle notes"
        style={{ minHeight: PLANNER_NOTES_MIN_PX }}
      >
        <div className="sb-planner-notes-head">Huddle notes</div>
        <div className="sb-planner-notes-rules" aria-hidden="true" />
      </section>
    </div>
  );
}

export default PortraitPlannerPage;
