/* Nightwatch — freeform canvas, timeline strip, FAB, popovers */

const { useState: useStateC, useEffect: useEffectC, useRef: useRefC } = React;

const CANVAS_W = 1500;
const CANVAS_H = 600;
const SHIFT_MIN = 475; // 23:00 → 06:55

const tsToMin = (ts) => {
  const [h, m] = ts.split(':').map(Number);
  let mins = (h * 60 + m) - (23 * 60);
  if (mins < 0) mins += 24 * 60;
  return mins;
};

/* ---------- Freeform Canvas ---------- */

function FreeformCanvas({
  strokes, observations, currentMin, mode,
  tornWidgets, onDragTornWidget,
  bgPattern, inkColor, showGuides, animateStrokes,
  selectedObsId, onSelectObs, onCanvasLongHover,
}) {
  const wrapRef = useRefC(null);
  const [drawn, setDrawn] = useStateC([]); // user-drawn strokes (mouse)
  const [drawing, setDrawing] = useStateC(null);
  const [strokesVisible, setStrokesVisible] = useStateC(animateStrokes ? 0 : strokes.length);

  useEffectC(() => {
    if (!animateStrokes) {
      setStrokesVisible(strokes.length);
      return;
    }
    setStrokesVisible(0);
    let i = 0;
    const tick = () => {
      i++;
      setStrokesVisible(i);
      if (i < strokes.length) setTimeout(tick, 220);
    };
    setTimeout(tick, 350);
  }, [animateStrokes, strokes.length]);

  // Mouse-as-pencil drawing (substitute for Apple Pencil)
  const startDraw = (e) => {
    if (e.button !== 0) return;
    if (mode !== 'live') return;
    const pt = canvasPoint(e);
    setDrawing({ d: `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, color: inkColor, w: 1.8 });
  };
  const moveDraw = (e) => {
    if (!drawing) return;
    const pt = canvasPoint(e);
    setDrawing(d => ({ ...d, d: d.d + ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` }));
  };
  const endDraw = () => {
    if (!drawing) return;
    setDrawn(prev => [...prev, { id: 'u' + Date.now(), ...drawing, ts: 'now' }]);
    setDrawing(null);
  };

  const canvasPoint = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const clearMyStrokes = () => setDrawn([]);

  return (
    <div className={`nw-canvas-wrap nw-canvas-bg-${bgPattern}`} ref={wrapRef}>
      {/* SVG layer */}
      <svg
        className="nw-canvas-svg"
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid slice"
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
      >
        <defs>
          <filter id="ink-blur" x="-2%" y="-2%" width="104%" height="104%">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>

        {/* faint guides */}
        {showGuides && (
          <g className="nw-canvas-guides">
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i} x1={(i / 8) * CANVAS_W} y1={0} x2={(i / 8) * CANVAS_W} y2={CANVAS_H}
                    stroke="rgba(48,178,255,0.06)" strokeWidth="1" />
            ))}
          </g>
        )}

        {/* pre-baked strokes */}
        <g filter="url(#ink-blur)">
          {strokes.slice(0, strokesVisible).map((s, idx) => (
            <path
              key={s.id}
              d={s.d}
              stroke={s.color}
              strokeWidth={s.w}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className={animateStrokes ? 'nw-stroke nw-stroke--animate' : 'nw-stroke'}
              style={{ '--stroke-len': '600px', '--stroke-delay': `${idx * 0.05}s` }}
            />
          ))}
          {/* user-drawn strokes */}
          {drawn.map((s) => (
            <path key={s.id} d={s.d} stroke={s.color} strokeWidth={s.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {/* in-progress */}
          {drawing && (
            <path d={drawing.d} stroke={drawing.color} strokeWidth={drawing.w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          )}
        </g>

        {/* Handwritten labels — fake "ink" writing inside circle */}
        <g className="nw-canvas-handwritten" style={{ pointerEvents: 'none' }}>
          <text x={920} y={195} className="nw-hand" fill="#FFD60A">SPIKE</text>
          <text x={905} y={222} className="nw-hand nw-hand--sm" fill={inkColor}>bills sticky?</text>
          <text x={680} y={460} className="nw-hand nw-hand--sm" fill={inkColor}>handoff</text>
          <text x={295} y={388} className="nw-hand nw-hand--sm" fill={inkColor}>RR-7 W open</text>
          <text x={830} y={388} className="nw-hand nw-hand--sm" fill={inkColor}>count drop ✓</text>
        </g>
      </svg>

      {/* Observation stamps (HTML overlay so they're tappable + scaleable) */}
      <div className="nw-stamps">
        {observations.map(o => (
          <button
            key={o.id}
            className={`nw-stamp is-${o.urgency} ${selectedObsId === o.id ? 'is-selected' : ''}`}
            style={{ left: `${(o.x / CANVAS_W) * 100}%`, top: `${(o.y / CANVAS_H) * 100}%` }}
            onClick={(e) => { e.stopPropagation(); onSelectObs(o.id); }}
          >
            <span className="nw-stamp-time">{o.ts}</span>
            <span className="nw-stamp-pin" />
          </button>
        ))}
      </div>

      {/* Selected obs note bubble */}
      {selectedObsId && (() => {
        const o = observations.find(x => x.id === selectedObsId);
        if (!o) return null;
        const leftPct = (o.x / CANVAS_W) * 100;
        const topPct = (o.y / CANVAS_H) * 100;
        // bubble to the right if obs is in left half, else to left
        const right = leftPct < 60;
        return (
          <div
            className={`nw-obs-bubble ${right ? 'is-right' : 'is-left'}`}
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="nw-obs-bubble-head">
              <span className="nw-eyebrow">{o.ts} · {o.urgency.toUpperCase()}</span>
              <span className="nw-obs-author">{o.author}</span>
              <button className="nw-obs-close" onClick={() => onSelectObs(null)} aria-label="Close">×</button>
            </div>
            <div className="nw-obs-bubble-text">{o.text}</div>
            {o.linked && (
              <div className="nw-obs-link">
                <span className="nw-eyebrow">LINKED</span>
                <span className="nw-obs-link-chip">
                  {o.linked.type === 'zone' ? `Zone ${o.linked.id}` :
                   o.linked.type === 'tm'   ? `TM ${o.linked.id}`   :
                   `RR ${o.linked.id}`}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Mode indicator overlay for past/future */}
      {mode !== 'live' && (
        <div className={`nw-mode-overlay is-${mode}`}>
          <span className="nw-eyebrow">{mode === 'past' ? 'ARCHIVED · READ-ONLY' : 'FUTURE · PLANNING VIEW'}</span>
        </div>
      )}

      {/* Clear-my-strokes mini control (only when user has drawn) */}
      {drawn.length > 0 && (
        <button className="nw-canvas-clear" onClick={clearMyStrokes}>
          Clear my strokes ({drawn.length})
        </button>
      )}

      {/* canvas footer hint */}
      <div className="nw-canvas-hint">
        <span className="nw-eyebrow">FREEFORM CANVAS</span>
        <span className="nw-canvas-hint-meta">
          Drag with mouse to draw · Apple Pencil pressure on iPad · Long-hover to drop a stamp
        </span>
      </div>
    </div>
  );
}

/* ---------- Shift Timeline strip (bottom of canvas zone) ---------- */

function TimelineStrip({ currentMin, observations, mode, onTimeChange }) {
  const trackRef = useRefC(null);

  const breaks = [
    { start: 60,  end: 75,  tm: 'Devon Park',  zone: 2 },
    { start: 150, end: 165, tm: 'Sasha Reyes', zone: 4 },
    { start: 245, end: 260, tm: 'Mira / Z3',   zone: 3 },
    { start: 260, end: 275, tm: 'Nina Okafor', zone: 7 },
  ];

  const handleClick = (e) => {
    if (!trackRef.current || !onTimeChange) return;
    const rect = trackRef.current.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    onTimeChange(Math.max(0, Math.min(SHIFT_MIN, Math.round(pct * SHIFT_MIN))));
  };

  const hours = [];
  for (let h = 0; h <= 8; h++) {
    const min = h * 60;
    if (min > SHIFT_MIN) break;
    const hour = (23 + h) % 24;
    hours.push({ min, label: hour === 0 ? '12a' : hour < 12 ? `${hour}a` : hour === 12 ? '12p' : `${hour - 12}p` });
  }

  return (
    <div className="nw-timeline">
      <div className="nw-timeline-side nw-timeline-side--left">
        <div className="nw-eyebrow">SHIFT TIMELINE</div>
        <div className="nw-timeline-bounds">11:00pm</div>
      </div>
      <div className="nw-timeline-track-wrap">
        <div className="nw-timeline-track" ref={trackRef} onClick={handleClick}>
          {/* hour ticks */}
          {hours.map((h, i) => (
            <div key={i} className="nw-timeline-tick" style={{ left: `${(h.min / SHIFT_MIN) * 100}%` }}>
              <span className="nw-timeline-tick-label">{h.label}</span>
            </div>
          ))}
          {/* breaks */}
          {breaks.map((b, i) => {
            const ended = b.end < currentMin;
            const inProgress = mode === 'live' && b.start <= currentMin && currentMin <= b.end;
            return (
              <div key={i}
                   className={`nw-timeline-break ${ended ? 'is-ended' : inProgress ? 'is-now' : 'is-future'}`}
                   style={{ left: `${(b.start / SHIFT_MIN) * 100}%`, width: `${((b.end - b.start) / SHIFT_MIN) * 100}%` }}
                   title={`${b.tm} break`}>
                <span className="nw-timeline-break-label">{b.tm.split(' ')[0]}</span>
              </div>
            );
          })}
          {/* observations */}
          {observations.map(o => {
            const m = tsToMin(o.ts);
            return (
              <div key={o.id} className={`nw-timeline-obs is-${o.urgency}`}
                   style={{ left: `${(m / SHIFT_MIN) * 100}%` }} title={o.text}>
                <span className="nw-timeline-obs-pin" />
                <span className="nw-timeline-obs-time">{o.ts}</span>
              </div>
            );
          })}
          {/* completed segment (past part of shift) */}
          {mode === 'live' && (
            <div className="nw-timeline-progress" style={{ width: `${(currentMin / SHIFT_MIN) * 100}%` }} />
          )}
          {/* time cursor */}
          {mode !== 'future' && (
            <div className="nw-timeline-cursor" style={{ left: `${(currentMin / SHIFT_MIN) * 100}%` }}>
              <div className="nw-timeline-cursor-line" />
              <div className="nw-timeline-cursor-label">
                {window.minToClock(currentMin)}
                {mode === 'live' && <span className="nw-pulse" />}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="nw-timeline-side nw-timeline-side--right">
        <div className="nw-eyebrow">SHIFT END</div>
        <div className="nw-timeline-bounds">6:55am</div>
      </div>
    </div>
  );
}

/* ---------- Quick Observation FAB + popover ---------- */

function QuickStamp({ open, onOpen, onClose, onSave, zones, roster }) {
  const [text, setText] = useStateC('');
  const [zone, setZone] = useStateC('');
  const [tm, setTm] = useStateC('');
  const [urgency, setUrgency] = useStateC('normal');

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSave({ text, zone, tm, urgency });
    setText(''); setZone(''); setTm(''); setUrgency('normal');
    onClose();
  };

  return (
    <>
      <button className={`nw-fab ${open ? 'is-open' : ''}`} onClick={onOpen} aria-label="Quick observation">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/>
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
        </svg>
        <span className="nw-fab-label">OBSERVATION</span>
      </button>

      {open && (
        <div className="nw-popover-shroud" onClick={onClose}>
          <form className="nw-popover" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <header className="nw-popover-head">
              <div>
                <div className="nw-eyebrow">QUICK CAPTURE</div>
                <h3>New observation</h3>
              </div>
              <button type="button" className="nw-icon-btn" onClick={onClose} aria-label="Close">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </header>
            <div className="nw-popover-body">
              <label className="nw-field">
                <span className="nw-eyebrow">NOTE</span>
                <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
                          placeholder="What did you see?" rows={3} />
              </label>
              <div className="nw-field-row">
                <label className="nw-field">
                  <span className="nw-eyebrow">ZONE</span>
                  <select value={zone} onChange={(e) => setZone(e.target.value)}>
                    <option value="">— none —</option>
                    {Object.keys(zones).map(z => <option key={z} value={z}>Zone {z}</option>)}
                  </select>
                </label>
                <label className="nw-field">
                  <span className="nw-eyebrow">TEAM MEMBER</span>
                  <select value={tm} onChange={(e) => setTm(e.target.value)}>
                    <option value="">— none —</option>
                    {roster.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>
              <fieldset className="nw-field">
                <span className="nw-eyebrow">URGENCY</span>
                <div className="nw-segctl">
                  {['low', 'normal', 'urgent'].map(u => (
                    <label key={u} className={`nw-seg is-${u} ${urgency === u ? 'is-active' : ''}`}>
                      <input type="radio" name="u" checked={urgency === u} onChange={() => setUrgency(u)} />
                      {u.toUpperCase()}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <footer className="nw-popover-foot">
              <span className="nw-popover-meta">Will be stamped to canvas + timeline @ {window.minToClock(currentMinSafe())}</span>
              <button type="submit" className="nw-btn nw-btn--primary">SAVE OBSERVATION</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

// Hack: getter for current minute from app (set by main)
const currentMinSafe = () => window.__nwCurrentMin || 220;

Object.assign(window, { FreeformCanvas, TimelineStrip, QuickStamp, tsToMin, SHIFT_MIN, CANVAS_W, CANVAS_H });
