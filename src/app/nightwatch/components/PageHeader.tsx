'use client';

import type { NightSummary, ShiftMode } from '@/lib/nightwatch/types';

interface KPI {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger';
}

interface PageHeaderProps {
  shift: NightSummary;
  currentMin: number;
  mode: ShiftMode;
  kpis: KPI[];
  onJumpToNow: () => void;
  minToClock: (m: number) => string;
  fmtPhase: (m: number) => string;
  shiftMin: number;
}

export default function PageHeader({
  shift, currentMin, mode, kpis, onJumpToNow, minToClock, fmtPhase, shiftMin,
}: PageHeaderProps) {
  const phase = fmtPhase(currentMin);
  const time  = minToClock(currentMin);
  const showLive = mode === 'live';
  const modeLabel = mode === 'future' ? 'SCHEDULED' : 'ARCHIVED';
  const dateNum = shift.date.split(' ')[1];

  return (
    <header className="nw-header">
      {/* Left — title */}
      <div className="nw-header-left">
        <div className="nw-eyebrow nw-eyebrow--gold">
          <span className="nw-eyebrow-dot" />
          NIGHTWATCH · GRAVE SHIFT JOURNAL
        </div>
        <div className="nw-header-title">
          <h1 className="nw-page-date">{shift.fullLabel}</h1>
          <span className="nw-page-night">
            NIGHT&nbsp;OF&nbsp;<span>{dateNum}</span>
          </span>
        </div>
      </div>

      {/* Mid — clock */}
      <div className="nw-header-mid">
        {showLive ? (
          <div className="nw-clock">
            <div className="nw-clock-phase">
              <span className="nw-pulse" />
              {phase} · {time}
            </div>
            <div className="nw-clock-meta">
              SHIFT IN PROGRESS · {shiftMin - currentMin} MIN REMAINING
            </div>
          </div>
        ) : (
          <div className="nw-clock nw-clock--inactive">
            <div className="nw-clock-phase nw-clock-phase--muted">
              {modeLabel}
              <span className="nw-divider-dot" />
              {mode === 'future' ? 'STARTS 11:00pm' : '11:00pm → 6:55am'}
            </div>
            <div className="nw-clock-meta">
              {mode === 'future'
                ? 'PLANNING VIEW · WIDGETS FROZEN AT PROJECTED STATE'
                : 'READ-ONLY · WIDGETS FROZEN AT 06:55am SNAPSHOT'}
            </div>
          </div>
        )}
      </div>

      {/* Right — KPIs + actions */}
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
          <button className="nw-icon-btn" title="Settings" aria-label="Settings">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
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
