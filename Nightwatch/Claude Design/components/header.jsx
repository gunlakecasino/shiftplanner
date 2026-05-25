/* Nightwatch — page header + shift-tile navigation strip */

const fmtShiftPhase = (timeMin) => {
  // timeMin in minutes since 23:00. Shift = 23:00 → 06:55 = 475 min total.
  if (timeMin < 60) return 'EARLY SHIFT';
  if (timeMin < 180) return 'EARLY SHIFT';
  if (timeMin < 300) return 'MID-SHIFT';
  if (timeMin < 420) return 'LATE SHIFT';
  return 'CLOSING SHIFT';
};

const minToClock = (m) => {
  // 0 = 23:00, total minutes
  const total = 23 * 60 + m;
  const h24 = Math.floor(total / 60) % 24;
  const min = total % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'am' : 'pm';
  return `${h12}:${String(min).padStart(2, '0')}${ampm}`;
};

const minToClock24 = (m) => {
  const total = 23 * 60 + m;
  const h24 = Math.floor(total / 60) % 24;
  const min = total % 60;
  return `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

function PageHeader({ shift, currentMin, mode, onJumpToNow }) {
  const phase = fmtShiftPhase(currentMin);
  const time = minToClock(currentMin);
  const showPhaseClock = mode === 'live';

  const kpis = [
    { label: 'Zones Filled', value: '10/10', tone: 'ok' },
    { label: 'Roster',       value: '14 on floor', tone: 'ok' },
    { label: 'Open Tasks',   value: '3',  tone: 'warn' },
  ];

  const modeLabel = mode === 'live'   ? null
                  : mode === 'future' ? 'SCHEDULED'
                  : 'ARCHIVED';

  return (
    <header className="nw-header">
      <div className="nw-header-left">
        <div className="nw-eyebrow nw-eyebrow--gold">
          <span className="nw-eyebrow-dot" />
          NIGHTWATCH · GRAVE SHIFT JOURNAL
        </div>
        <div className="nw-header-title">
          <h1 className="nw-page-date">{shift.fullLabel}</h1>
          <span className="nw-page-night">NIGHT&nbsp;OF&nbsp;<span>{shift.date.split(' ')[1]}</span></span>
        </div>
      </div>

      <div className="nw-header-mid">
        {showPhaseClock ? (
          <div className="nw-clock">
            <div className="nw-clock-phase">
              <span className="nw-pulse" />
              {phase} · {time}
            </div>
            <div className="nw-clock-meta">SHIFT IN PROGRESS · {475 - currentMin} MIN REMAINING</div>
          </div>
        ) : (
          <div className="nw-clock nw-clock--inactive">
            <div className="nw-clock-phase nw-clock-phase--muted">
              {modeLabel}
              <span className="nw-divider-dot" />
              {mode === 'future' ? 'STARTS 11:00pm' : '11:00pm → 6:55am'}
            </div>
            <div className="nw-clock-meta">
              {mode === 'future' ? 'PLANNING VIEW · WIDGETS FROZEN AT PROJECTED STATE' : 'READ-ONLY · WIDGETS FROZEN AT 06:55am SNAPSHOT'}
            </div>
          </div>
        )}
      </div>

      <div className="nw-header-right">
        <div className="nw-kpis">
          {kpis.map(k => (
            <div key={k.label} className={`nw-kpi nw-kpi--${k.tone}`}>
              <div className="nw-kpi-value">{k.value}</div>
              <div className="nw-kpi-label">{k.label}</div>
            </div>
          ))}
        </div>
        <div className="nw-header-actions">
          <button className="nw-icon-btn" title="Customize widgets" aria-label="Customize">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
            </svg>
          </button>
          {mode !== 'live' && (
            <button className="nw-btn nw-btn--ghost-gold" onClick={onJumpToNow}>
              JUMP TO TONIGHT
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ShiftStrip({ week, activeId, onSelect, mode }) {
  return (
    <nav className="nw-strip" role="tablist">
      <button className="nw-strip-arrow" aria-label="Previous week">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div className="nw-strip-week-label">
        <div className="nw-eyebrow">GRAVE WEEK · MAY 22 → MAY 28</div>
      </div>
      <ol className="nw-tiles">
        {week.map(n => {
          const isActive = n.id === activeId;
          const cls = `nw-tile nw-tile--${n.state} ${isActive ? 'is-active' : ''}`;
          return (
            <li key={n.id} className={cls} role="tab" aria-selected={isActive}
                onClick={() => onSelect(n.id)}>
              <div className="nw-tile-state-row">
                <span className="nw-tile-state-dot" />
                <span className="nw-tile-state-label">
                  {n.state === 'past' ? 'CLOSED' : n.state === 'live' ? 'LIVE' : 'SCHEDULED'}
                </span>
              </div>
              <div className="nw-tile-day">{n.shortLabel}</div>
              <div className="nw-tile-date">{n.date.split(' ')[1]}</div>
              <div className="nw-tile-summary">{n.summary || ' '}</div>
            </li>
          );
        })}
      </ol>
      <button className="nw-strip-arrow" aria-label="Next week">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </nav>
  );
}

window.PageHeader = PageHeader;
window.ShiftStrip = ShiftStrip;
window.fmtShiftPhase = fmtShiftPhase;
window.minToClock = minToClock;
window.minToClock24 = minToClock24;
