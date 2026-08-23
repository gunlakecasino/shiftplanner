import React from "react";
import type { PortraitPlannerPageModel, PlannerRosterEntry, PlannerSlotCard } from "./buildPortraitPlannerModel";
import "./printPreview.css";

export type PortraitPlannerPageProps = {
  model: PortraitPlannerPageModel;
};

function bandMark(band: PlannerRosterEntry["band"]): string {
  if (band === "pm") return "PM";
  if (band === "am") return "AM";
  return "";
}

function PlannerSlotBox({ card }: { card: PlannerSlotCard }) {
  return (
    <div
      className={`sb-planner-slot${card.empty ? " is-empty" : ""}`}
      style={{ ["--sb-planner-accent" as string]: card.accent }}
      data-slot-key={card.key}
    >
      <div className="sb-planner-slot-stripe" />
      <div className="sb-planner-slot-label">{card.label}</div>
      {card.empty ? (
        <div className="sb-planner-slot-open" aria-label="Open">
          <span />
        </div>
      ) : (
        <div className="sb-planner-slot-name">{card.tmName}</div>
      )}
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
        <div className="sb-planner-header-stripe" style={{ background: model.dayColor }} />
        <div className="sb-planner-header-row">
          <div className="sb-planner-header-left">
            <div className="sb-planner-kicker">Planner sheet</div>
            <div className="sb-planner-title">
              {model.dayName}
              {pageNote}
            </div>
            <div className="sb-planner-sub">
              {model.monthYear} · {model.nightMeta} · huddle / clipboard
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
            {model.roster.length === 0 ? (
              <li className="sb-planner-roster-empty">No Graves schedule loaded</li>
            ) : (
              model.roster.map((row) => {
                const mark = bandMark(row.band);
                return (
                  <li
                    key={row.tmId}
                    className={`sb-planner-roster-row${row.placed ? " is-placed" : ""}`}
                  >
                    <span className="sb-planner-roster-name">{row.name}</span>
                    {mark ? <span className="sb-planner-roster-band">{mark}</span> : null}
                  </li>
                );
              })
            )}
          </ol>
        </aside>

        <main className="sb-planner-main">
          <Section
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
            label="Auxiliary"
            count={`${filledCount(model.aux)} / ${Math.max(model.aux.length, 1)}`}
          >
            <div className="sb-planner-grid sb-planner-grid-aux">
              {model.aux.map((card) => (
                <PlannerSlotBox key={card.key} card={card} />
              ))}
            </div>
          </Section>

          <Section
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
    </div>
  );
}

export default PortraitPlannerPage;
