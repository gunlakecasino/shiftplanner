'use client';

import type { NightSummary, ShiftMode } from '@/lib/nightwatch/types';

interface ShiftStripProps {
  week: NightSummary[];
  activeId: string;
  onSelect: (id: string) => void;
  mode: ShiftMode;
}

export default function ShiftStrip({ week, activeId, onSelect }: ShiftStripProps) {
  // Derive week label from first/last entries
  const first = week[0]?.date ?? '';
  const last  = week[week.length - 1]?.date ?? '';
  const weekLabel = first && last ? `GRAVE WEEK · ${first.toUpperCase()} → ${last.toUpperCase()}` : 'GRAVE WEEK';

  return (
    <nav className="nw-strip" role="tablist" aria-label="Shift navigation">
      <button className="nw-strip-arrow" aria-label="Previous week">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>
      <div className="nw-strip-week-label">
        <div className="nw-eyebrow">{weekLabel}</div>
      </div>
      <ol className="nw-tiles">
        {week.map(n => {
          const isActive = n.id === activeId;
          const cls = `nw-tile nw-tile--${n.state}${isActive ? ' is-active' : ''}`;
          const stateLabel = n.state === 'past' ? 'CLOSED' : n.state === 'live' ? 'LIVE' : 'SCHEDULED';
          const dateNum = n.date.split(' ')[1] ?? n.date;
          return (
            <li
              key={n.id}
              className={cls}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(n.id)}
            >
              <div className="nw-tile-state-row">
                <span className="nw-tile-state-dot" />
                <span className="nw-tile-state-label">{stateLabel}</span>
              </div>
              <div className="nw-tile-day">{n.shortLabel}</div>
              <div className="nw-tile-date">{dateNum}</div>
              <div className="nw-tile-summary">{n.summary ?? ' '}</div>
            </li>
          );
        })}
      </ol>
      <button className="nw-strip-arrow" aria-label="Next week">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    </nav>
  );
}
