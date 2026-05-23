'use client';

import { useRef } from 'react';
import type { Observation, ShiftMode } from '@/lib/nightwatch/types';

const BREAKS = [
  { start: 60,  end: 75,  tm: 'Devon Park',  zone: 2 },
  { start: 150, end: 165, tm: 'Sasha Reyes', zone: 4 },
  { start: 245, end: 260, tm: 'Mira / Z3',   zone: 3 },
  { start: 260, end: 275, tm: 'Nina Okafor', zone: 7 },
];

function tsToMin(ts: string): number {
  const [h, m] = ts.split(':').map(Number);
  let mins = h * 60 + m - 23 * 60;
  if (mins < 0) mins += 24 * 60;
  return mins;
}

interface TimelineStripProps {
  currentMin: number;
  observations: Observation[];
  mode: ShiftMode;
  onTimeChange?: (m: number) => void;
  minToClock: (m: number) => string;
  shiftMin: number;
}

export default function TimelineStrip({
  currentMin, observations, mode, onTimeChange, minToClock, shiftMin,
}: TimelineStripProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    if (!trackRef.current || !onTimeChange) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onTimeChange(Math.max(0, Math.min(shiftMin, Math.round(pct * shiftMin))));
  };

  // Build hour ticks: 11pm → 7am
  const hours: { min: number; label: string }[] = [];
  for (let h = 0; h <= 8; h++) {
    const min = h * 60;
    if (min > shiftMin) break;
    const hour = (23 + h) % 24;
    hours.push({
      min,
      label: hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p`,
    });
  }

  return (
    <div className="nw-timeline">
      {/* Left side */}
      <div className="nw-timeline-side nw-timeline-side--left">
        <div className="nw-eyebrow">SHIFT TIMELINE</div>
        <div className="nw-timeline-bounds">11:00pm</div>
      </div>

      {/* Track */}
      <div className="nw-timeline-track-wrap">
        <div
          className="nw-timeline-track"
          ref={trackRef}
          onClick={handleClick}
          style={{ cursor: onTimeChange ? 'pointer' : 'default' }}
        >
          {/* Hour ticks */}
          {hours.map((h, i) => (
            <div key={i} className="nw-timeline-tick" style={{ left: `${(h.min / shiftMin) * 100}%` }}>
              <span className="nw-timeline-tick-label">{h.label}</span>
            </div>
          ))}

          {/* Breaks */}
          {BREAKS.map((b, i) => {
            const ended = b.end < currentMin;
            const inProgress = mode === 'live' && b.start <= currentMin && currentMin <= b.end;
            const cls = `nw-timeline-break${ended ? ' is-ended' : inProgress ? ' is-now' : ' is-future'}`;
            return (
              <div
                key={i}
                className={cls}
                style={{
                  left: `${(b.start / shiftMin) * 100}%`,
                  width: `${((b.end - b.start) / shiftMin) * 100}%`,
                }}
                title={`${b.tm} break`}
              >
                <span className="nw-timeline-break-label">{b.tm.split(' ')[0]}</span>
              </div>
            );
          })}

          {/* Observations */}
          {observations.map(o => {
            const m = tsToMin(o.ts);
            return (
              <div
                key={o.id}
                className={`nw-timeline-obs is-${o.urgency}`}
                style={{ left: `${(m / shiftMin) * 100}%` }}
                title={o.text}
              >
                <span className="nw-timeline-obs-pin" />
                <span className="nw-timeline-obs-time">{o.ts}</span>
              </div>
            );
          })}

          {/* Progress fill */}
          {mode === 'live' && (
            <div
              className="nw-timeline-progress"
              style={{ width: `${(currentMin / shiftMin) * 100}%` }}
            />
          )}

          {/* Cursor */}
          {mode !== 'future' && (
            <div
              className="nw-timeline-cursor"
              style={{ left: `${(currentMin / shiftMin) * 100}%` }}
            >
              <div className="nw-timeline-cursor-line" />
              <div className="nw-timeline-cursor-label">
                {minToClock(currentMin)}
                {mode === 'live' && <span className="nw-pulse" />}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right side */}
      <div className="nw-timeline-side nw-timeline-side--right">
        <div className="nw-eyebrow">SHIFT END</div>
        <div className="nw-timeline-bounds">6:55am</div>
      </div>
    </div>
  );
}
