/* Nightwatch — widget components for the dock */

const { useState, useMemo } = React;

function WidgetShell({ accent, title, eyebrow, headerRight, children, className = '', style, onTearOff, torn }) {
  return (
    <article className={`nw-widget ${className}`} style={{ '--accent': accent, ...style }}>
      <div className="nw-widget-accent" />
      <header className="nw-widget-head">
        <div className="nw-widget-titleblock">
          {eyebrow && <div className="nw-eyebrow nw-widget-eyebrow">{eyebrow}</div>}
          <h3 className="nw-widget-title">{title}</h3>
        </div>
        <div className="nw-widget-actions">
          {headerRight}
          <button className="nw-widget-grip" title="Tear off to canvas" onClick={onTearOff} aria-label="Tear off">
            <svg viewBox="0 0 12 12" width="14" height="14" fill="currentColor">
              <circle cx="3" cy="3" r="1"/><circle cx="9" cy="3" r="1"/>
              <circle cx="3" cy="6" r="1"/><circle cx="9" cy="6" r="1"/>
              <circle cx="3" cy="9" r="1"/><circle cx="9" cy="9" r="1"/>
            </svg>
          </button>
        </div>
      </header>
      <div className="nw-widget-body">{children}</div>
      {torn && <div className="nw-tether" />}
    </article>
  );
}

/* ---------- Task Board (HIGHEST PRIORITY) ---------- */

function TaskBoard({ tasks, onToggle, onAddTask, mode }) {
  const overdue  = tasks.filter(t => t.lane === 'overdue');
  const today    = tasks.filter(t => t.lane === 'today');
  const upcoming = tasks.filter(t => t.lane === 'upcoming').slice(0, 3);

  const [newTask, setNewTask] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (newTask.trim()) {
      onAddTask(newTask.trim());
      setNewTask('');
    }
  };

  const Swimlane = ({ lane, label, color, items, footer }) => (
    <section className={`nw-lane nw-lane--${lane}`} style={{ '--lane': color }}>
      <header className="nw-lane-head">
        <span className="nw-lane-stripe" />
        <div className="nw-lane-title">
          <span className="nw-lane-label">{label}</span>
          <span className="nw-lane-count">{items.length}</span>
        </div>
      </header>
      <ul className="nw-lane-list">
        {items.length === 0 && (
          <li className="nw-task nw-task--empty">No tasks in this lane.</li>
        )}
        {items.map(t => (
          <li key={t.id} className={`nw-task ${t.done ? 'is-done' : ''}`}>
            <button
              className="nw-check"
              role="checkbox"
              aria-checked={t.done}
              onClick={() => mode !== 'past' && onToggle(t.id)}
              disabled={mode === 'past' && !t.done && lane !== 'overdue'}
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
                <span className="nw-task-due">DUE {t.due}</span>
                {lane === 'overdue' && <span className="nw-pill nw-pill--danger">CARRYOVER</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {footer}
    </section>
  );

  const todayFooter = mode === 'live' ? (
    <form className="nw-quickadd" onSubmit={submit}>
      <span className="nw-quickadd-plus">+</span>
      <input
        type="text"
        placeholder="Add task to tonight…"
        value={newTask}
        onChange={(e) => setNewTask(e.target.value)}
      />
      <kbd>↵</kbd>
    </form>
  ) : null;

  return (
    <div className="nw-taskboard">
      <Swimlane lane="overdue"  label="OVERDUE · CARRYOVER"  color="#FF3B30" items={overdue} />
      <Swimlane lane="today"    label={mode === 'past' ? 'THAT NIGHT' : mode === 'future' ? 'SCHEDULED FOR THIS SHIFT' : 'TODAY · TONIGHT'} color="#FFD60A" items={today} footer={todayFooter} />
      <Swimlane lane="upcoming" label="UPCOMING · NEXT 3"   color="#636366" items={upcoming} />
    </div>
  );
}

/* ---------- Zone Deployment ---------- */

function ZoneDeployment({ zones, roster, zoneColors, onPick }) {
  const tmName = (id) => {
    const t = roster.find(r => r.id === id);
    if (!t) return '—';
    const [first, last] = t.name.split(' ');
    return `${first.charAt(0)}. ${last}`;
  };

  return (
    <div className="nw-zonegrid">
      {zones.map(z => {
        const c = zoneColors[z.zone];
        return (
          <button
            key={z.zone}
            className={`nw-zone ${z.onBreak ? 'is-onbreak' : ''}`}
            style={{ '--zone-bg': c.bg, '--zone-fg': c.fg }}
            onClick={() => onPick && onPick(z)}
          >
            <div className="nw-zone-head">
              <span className="nw-zone-num">Z{z.zone}</span>
              <span className="nw-zone-color-name">{c.label}</span>
            </div>
            <div className="nw-zone-tm">{tmName(z.tmId)}</div>
            <div className="nw-zone-foot">
              <span className={`nw-break-dot ${z.onBreak ? 'is-active' : ''}`} />
              <span className="nw-zone-meta">
                {z.onBreak ? `BREAK · BACK ${z.breakBack}` : `NEXT BREAK ${z.breakIn}`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- RR Assignments ---------- */

function RRAssignments({ rr, roster }) {
  const tmName = (id) => {
    if (!id) return null;
    const t = roster.find(r => r.id === id);
    if (!t) return '—';
    const [first, last] = t.name.split(' ');
    return `${first.charAt(0)}. ${last}`;
  };

  return (
    <div className="nw-rrgrid">
      <div className="nw-rrhead">
        <span/>
        <span className="nw-eyebrow">MEN'S</span>
        <span className="nw-eyebrow">WOMEN'S</span>
      </div>
      {rr.map(row => (
        <div key={row.rr} className="nw-rrrow">
          <div className="nw-rr-label">RR {row.rr}</div>
          <div className="nw-rr-cell">
            <span className="nw-rr-dot nw-rr-dot--m" />
            <span>{tmName(row.mens) || <em className="nw-rr-empty">OPEN</em>}</span>
          </div>
          <div className="nw-rr-cell">
            <span className="nw-rr-dot nw-rr-dot--w" />
            <span>{tmName(row.womens) || <em className="nw-rr-empty">OPEN</em>}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Grave Roster ---------- */

function GraveRoster({ roster, state }) {
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
          <strong>{counts.floor}</strong> floor
        </div>
        <div className="nw-roster-stat">
          <span className="nw-roster-dot is-break" />
          <strong>{counts.brk}</strong> on break
        </div>
        <div className="nw-roster-stat">
          <span className="nw-roster-dot is-off" />
          <strong>{counts.off}</strong> called off
        </div>
      </div>
      <ul className="nw-roster-list">
        {roster.map(t => {
          const s = state[t.id] || 'floor';
          const [first, last] = t.name.split(' ');
          return (
            <li key={t.id} className={`nw-roster-row is-${s}`}>
              <span className="nw-roster-dot" />
              <span className="nw-roster-name">
                {first} <strong>{last}</strong>
              </span>
              {t.role !== 'tm' && <span className="nw-roster-role">{t.role.toUpperCase()}</span>}
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

/* ---------- BEO / Floor Events ---------- */

function EventsCard({ events, currentMin }) {
  // currentMin = mins since 23:00
  const elapsed = (eTime) => {
    const [h, m] = eTime.split(':').map(Number);
    // events use 24h. Convert event clock to mins since 23:00.
    let mins = (h * 60 + m) - (23 * 60);
    if (mins < 0) mins += 24 * 60;
    return mins;
  };

  return (
    <ul className="nw-events">
      {events.map(e => {
        const eMin = elapsed(e.time);
        const done = eMin < currentMin;
        const live = Math.abs(eMin - currentMin) < 15;
        return (
          <li key={e.id} className={`nw-event ${done ? 'is-done' : ''} ${live ? 'is-live' : ''} is-${e.priority}`}>
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

/* ---------- Mini timeline ---------- */
/* Same logic as full canvas timeline but compressed */

function MiniTimeline({ observations, currentMin, totalMin }) {
  const breaks = [
    { start: 4 * 60 + 5,  end: 4 * 60 + 20, tm: 'Mira' },   // 03:05 → 03:20
    { start: 4 * 60 + 20, end: 4 * 60 + 35, tm: 'Nina' },   // 03:20 → 03:35
    { start: 60,  end: 75, tm: 'Devon' },                   // 00:00 → 00:15
    { start: 150, end: 165, tm: 'Sasha' },                  // 01:30 → 01:45
  ];

  // observations have ts strings "HH:MM" (24h, possibly past midnight)
  const tsToMin = (ts) => {
    const [h, m] = ts.split(':').map(Number);
    let mins = (h * 60 + m) - (23 * 60);
    if (mins < 0) mins += 24 * 60;
    return mins;
  };

  return (
    <div className="nw-minitl">
      <div className="nw-minitl-track">
        {/* hour ticks */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="nw-minitl-tick" style={{ left: `${(i / 8) * 100}%` }}>
            <span>{(23 + i) % 24}</span>
          </div>
        ))}
        {/* breaks */}
        {breaks.map((b, i) => (
          <div key={i} className="nw-minitl-break"
               style={{ left: `${(b.start / totalMin) * 100}%`, width: `${((b.end - b.start) / totalMin) * 100}%` }}
               title={`${b.tm} break`} />
        ))}
        {/* observations */}
        {observations.map(o => {
          const m = tsToMin(o.ts);
          const tone = o.urgency === 'urgent' ? 'urgent' : o.urgency === 'low' ? 'low' : 'normal';
          return (
            <div key={o.id} className={`nw-minitl-obs is-${tone}`}
                 style={{ left: `${(m / totalMin) * 100}%` }} title={o.text} />
          );
        })}
        {/* time cursor */}
        <div className="nw-minitl-cursor" style={{ left: `${(currentMin / totalMin) * 100}%` }} />
      </div>
      <div className="nw-minitl-legend">
        <span><i className="nw-minitl-key nw-minitl-key--obs" /> observations</span>
        <span><i className="nw-minitl-key nw-minitl-key--brk" /> breaks</span>
        <span><i className="nw-minitl-key nw-minitl-key--cur" /> now</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  WidgetShell, TaskBoard, ZoneDeployment, RRAssignments,
  GraveRoster, EventsCard, MiniTimeline,
});
