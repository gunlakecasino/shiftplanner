'use client';

import { useState, useMemo } from 'react';
import type {
  TaskItem, ZoneAssignment, ZoneColor, RosterMember,
  RosterState, RRRow, ShiftMode, UIEvent,
} from '@/lib/nightwatch/types';

/* ================================================================
   TaskBoard
   ================================================================ */

interface TaskBoardProps {
  tasks: TaskItem[];
  onToggle: (id: string) => void;
  onAddTask: (text: string) => void;
  mode: ShiftMode;
}

const LANE_META: Record<string, { label: string; color: string }> = {
  overdue:  { label: 'OVERDUE',  color: '#FF3B30' },
  today:    { label: 'TONIGHT',  color: '#FFD60A' },
  upcoming: { label: 'UPCOMING', color: '#636366' },
};

export function TaskBoard({ tasks, onToggle, onAddTask, mode }: TaskBoardProps) {
  const [newTask, setNewTask] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTask.trim()) { onAddTask(newTask.trim()); setNewTask(''); }
  };

  // Build a flat ordered list: overdue → today → upcoming (capped at 3)
  const ordered: TaskItem[] = [
    ...tasks.filter(t => t.lane === 'overdue'),
    ...tasks.filter(t => t.lane === 'today'),
    ...tasks.filter(t => t.lane === 'upcoming').slice(0, 3),
  ];

  return (
    <div className="nw-taskboard">
      <ul className="nw-tasklist">
        {ordered.length === 0 && (
          <li className="nw-task nw-task--empty">No open tasks.</li>
        )}
        {ordered.map(t => {
          const meta = LANE_META[t.lane] ?? LANE_META.upcoming;
          return (
            <li key={t.id} className={`nw-task nw-task--flat${t.done ? ' is-done' : ''}`}
                style={{ ['--lane' as string]: meta.color }}>
              <button
                className="nw-check"
                role="checkbox"
                aria-checked={t.done}
                onClick={() => mode !== 'past' && onToggle(t.id)}
              >
                {t.done && (
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3 3 7-7"/>
                  </svg>
                )}
              </button>
              <div className="nw-task-body">
                <div className="nw-task-text">{t.text}</div>
                <div className="nw-task-meta">
                  <span className="nw-task-lane-badge" style={{ color: meta.color }}>{meta.label}</span>
                  <span className="nw-task-due">· {t.due}</span>
                  {t.lane === 'overdue' && <span className="nw-pill nw-pill--danger">CARRYOVER</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {mode === 'live' && (
        <form className="nw-quickadd" onSubmit={handleSubmit}>
          <span className="nw-quickadd-plus">+</span>
          <input
            type="text"
            placeholder="Add task to tonight…"
            value={newTask}
            onChange={e => setNewTask(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
      )}
    </div>
  );
}

/* ================================================================
   ZoneDeployment
   ================================================================ */

interface ZoneDeploymentProps {
  zones: ZoneAssignment[];
  roster: RosterMember[];
  zoneColors: Record<number, ZoneColor>;
  onPick?: (z: ZoneAssignment) => void;
}

export function ZoneDeployment({ zones, roster, zoneColors, onPick }: ZoneDeploymentProps) {
  const tmName = (id: string | null) => {
    if (!id) return '—';
    const t = roster.find(r => r.id === id);
    if (!t) return id;
    const parts = t.name.split(' ');
    if (parts.length < 2) return t.name;
    return `${parts[0].charAt(0)}. ${parts[1]}`;
  };

  return (
    <div className="nw-zonegrid">
      {zones.map(z => {
        const c = zoneColors[z.zone];
        return (
          <button
            key={z.zone}
            className={`nw-zone${z.onBreak ? ' is-onbreak' : ''}`}
            style={{ ['--zone-bg' as string]: c.bg, ['--zone-fg' as string]: c.fg }}
            onClick={() => onPick?.(z)}
          >
            <div className="nw-zone-head">
              <span className="nw-zone-num">Z{z.zone}</span>
              <span className="nw-zone-color-name">{c.label}</span>
            </div>
            <div className="nw-zone-tm">{tmName(z.tmId)}</div>
            <div className="nw-zone-foot">
              <span className={`nw-break-dot${z.onBreak ? ' is-active' : ''}`} />
              <span className="nw-zone-meta">
                {z.onBreak
                  ? `BREAK · BACK ${z.breakBack ?? '—'}`
                  : z.breakIn
                    ? `NEXT BREAK ${z.breakIn}`
                    : 'ON FLOOR'}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================
   RRAssignments
   ================================================================ */

interface RRAssignmentsProps {
  rr: RRRow[];
  roster: RosterMember[];
}

export function RRAssignments({ rr, roster }: RRAssignmentsProps) {
  const tmName = (id: string | null) => {
    if (!id) return null;
    const t = roster.find(r => r.id === id);
    if (!t) return '—';
    const parts = t.name.split(' ');
    if (parts.length < 2) return t.name;
    return `${parts[0].charAt(0)}. ${parts[1]}`;
  };

  return (
    <div className="nw-rrgrid">
      <div className="nw-rrhead">
        <span />
        <span className="nw-eyebrow">MEN&apos;S</span>
        <span className="nw-eyebrow">WOMEN&apos;S</span>
      </div>
      {rr.map(row => (
        <div key={row.rr} className="nw-rrrow">
          <div className="nw-rr-label">RR {row.rr}</div>
          <div className="nw-rr-cell">
            <span className="nw-rr-dot nw-rr-dot--m" />
            <span>{tmName(row.mens) ?? <em className="nw-rr-empty">OPEN</em>}</span>
          </div>
          <div className="nw-rr-cell">
            <span className="nw-rr-dot nw-rr-dot--w" />
            <span>{tmName(row.womens) ?? <em className="nw-rr-empty">OPEN</em>}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ================================================================
   GraveRoster
   ================================================================ */

interface GraveRosterProps {
  roster: RosterMember[];
  state: RosterState;
}

export function GraveRoster({ roster, state }: GraveRosterProps) {
  const counts = useMemo(() => {
    let floor = 0, brk = 0, off = 0;
    roster.forEach(t => {
      const s = state[t.id];
      if (s === 'floor') floor++;
      else if (s === 'break') brk++;
      else if (s === 'calledoff') off++;
    });
    return { floor, brk, off };
  }, [roster, state]);

  return (
    <div className="nw-roster">
      <div className="nw-roster-summary">
        <div className="nw-roster-stat">
          <span className="nw-roster-dot is-floor" />
          <strong>{counts.floor}</strong>&nbsp;floor
        </div>
        <div className="nw-roster-stat">
          <span className="nw-roster-dot is-break" />
          <strong>{counts.brk}</strong>&nbsp;on break
        </div>
        <div className="nw-roster-stat">
          <span className="nw-roster-dot is-off" />
          <strong>{counts.off}</strong>&nbsp;called off
        </div>
      </div>
      <ul className="nw-roster-list">
        {roster.map(t => {
          const s = state[t.id] ?? 'floor';
          const [first, last] = t.name.split(' ');
          return (
            <li key={t.id} className={`nw-roster-row is-${s}`}>
              <span className="nw-roster-dot" />
              <span className="nw-roster-name">
                {first} <strong>{last}</strong>
              </span>
              {t.role !== 'tm' && (
                <span className="nw-roster-role">{t.role.toUpperCase()}</span>
              )}
              <span className="nw-roster-status">
                {s === 'floor' ? '' : s === 'break' ? 'BREAK' : 'CALLED OFF'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ================================================================
   EventsCard
   ================================================================ */

interface EventsCardProps {
  events: UIEvent[];
  currentMin: number;
}

export function EventsCard({ events, currentMin }: EventsCardProps) {
  const elapsed = (time: string): number => {
    const [h, m] = time.split(':').map(Number);
    let mins = h * 60 + m - 23 * 60;
    if (mins < 0) mins += 24 * 60;
    return mins;
  };

  if (events.length === 0) {
    return (
      <div className="nw-events-empty">
        <span>No events logged for this shift.</span>
      </div>
    );
  }

  return (
    <ul className="nw-events">
      {events.map(e => {
        const eMin = elapsed(e.time);
        const done = eMin < currentMin;
        const live = Math.abs(eMin - currentMin) < 15;
        return (
          <li key={e.id} className={`nw-event${done ? ' is-done' : ''}${live ? ' is-live' : ''} is-${e.priority}`}>
            <div className="nw-event-time">
              <span className="nw-event-clock">{e.time}</span>
              {live && <span className="nw-event-now">NOW</span>}
            </div>
            <div className="nw-event-body">
              <div className="nw-event-label">{e.label}</div>
              <div className="nw-event-loc">{e.location}</div>
            </div>
            {e.priority === 'high' && <span className="nw-event-prio">!</span>}
          </li>
        );
      })}
    </ul>
  );
}
