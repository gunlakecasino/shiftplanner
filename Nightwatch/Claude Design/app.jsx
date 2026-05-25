/* Nightwatch — main app */

const { useState: useS, useEffect: useE, useMemo: useM, useCallback: useCB } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "pageMode": "live",
  "currentMin": 221,
  "canvasBg": "dots",
  "inkColor": "#F2F2F4",
  "animateStrokes": true,
  "showGuides": false,
  "accent": "cyan-gold",
  "dockDensity": "12"
}/*EDITMODE-END*/;

function App() {
  const D = window.NW_DATA;
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // Live shift state
  const [activeShiftId, setActiveShiftId] = useS('n02'); // Sat 5/23
  const [tasks, setTasks] = useS(D.TASKS);
  const [selectedObs, setSelectedObs] = useS('o03'); // pre-select urgent obs
  const [fabOpen, setFabOpen] = useS(false);
  const [tornWidgets, setTornWidgets] = useS({}); // id -> {x, y}

  const activeShift = D.WEEK.find(w => w.id === activeShiftId) || D.WEEK[1];
  const pageMode = activeShift.state; // 'live' | 'past' | 'future'

  // Override page mode from tweaks
  const effectivePageMode = (() => {
    if (tweaks.pageMode === 'live')   return activeShift.state === 'live' ? 'live' : 'live';
    if (tweaks.pageMode === 'past')   return 'past';
    if (tweaks.pageMode === 'future') return 'future';
    return activeShift.state;
  })();

  // For tweakable mode, we keep activeShift consistent but display mode varies
  const displayMode = tweaks.pageMode;

  // Current shift time — live ticks slowly; otherwise from tweak slider
  const [currentMin, setCurrentMin] = useS(tweaks.currentMin || 221);
  useE(() => { setCurrentMin(tweaks.currentMin); }, [tweaks.currentMin]);
  useE(() => { window.__nwCurrentMin = currentMin; }, [currentMin]);

  // Slow tick when in live mode (every 8s = 1 min)
  useE(() => {
    if (displayMode !== 'live') return;
    const t = setInterval(() => {
      setCurrentMin(m => {
        const next = Math.min(window.SHIFT_MIN, m + 1);
        setTweak('currentMin', next);
        return next;
      });
    }, 8000);
    return () => clearInterval(t);
  }, [displayMode]);

  const toggleTask = (id) => {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };
  const addTask = (text) => {
    const id = 'tu' + Date.now();
    setTasks(ts => [...ts, { id, lane: 'today', text, due: 'TONIGHT', done: false }]);
  };

  const tearOff = (widgetId, originX, originY) => {
    setTornWidgets(prev => {
      if (prev[widgetId]) { const { [widgetId]: _, ...rest } = prev; return rest; }
      return { ...prev, [widgetId]: { x: originX || 60, y: originY || 80 } };
    });
  };

  const jumpToNow = () => {
    setActiveShiftId('n02');
    setTweak('pageMode', 'live');
  };

  // ----- Render -----
  return (
    <div className={`nw-app nw-accent-${tweaks.accent} nw-density-${tweaks.dockDensity}`}>
      <PageHeader
        shift={activeShift}
        currentMin={currentMin}
        mode={displayMode}
        onJumpToNow={jumpToNow}
      />
      <ShiftStrip
        week={D.WEEK}
        activeId={activeShiftId}
        onSelect={(id) => {
          setActiveShiftId(id);
          const s = D.WEEK.find(w => w.id === id);
          if (s) setTweak('pageMode', s.state);
        }}
        mode={displayMode}
      />

      {/* Widget dock */}
      <section className="nw-dock">
        {/* Task Board — left tall column */}
        {!tornWidgets['taskboard'] && (
          <WidgetShell
            accent="#FFD60A"
            eyebrow="HIGHEST PRIORITY"
            title="Task Board"
            className="nw-widget--taskboard"
            headerRight={
              <span className="nw-widget-meta">
                {tasks.filter(t => t.lane === 'today' && !t.done).length} open tonight
              </span>
            }
            onTearOff={() => tearOff('taskboard')}
          >
            <TaskBoard tasks={tasks} onToggle={toggleTask} onAddTask={addTask} mode={displayMode} />
          </WidgetShell>
        )}

        {/* Zone deployment */}
        {!tornWidgets['zones'] && (
          <WidgetShell
            accent="#30b2ff"
            eyebrow="DEPLOYMENT"
            title="Zone Coverage"
            className="nw-widget--zones"
            headerRight={<span className="nw-widget-meta">10/10 filled · 2 on break</span>}
            onTearOff={() => tearOff('zones')}
          >
            <ZoneDeployment zones={D.ZONE_ASSIGN} roster={D.ROSTER} zoneColors={D.ZONE_COLORS} />
          </WidgetShell>
        )}

        {/* RR */}
        {!tornWidgets['rr'] && (
          <WidgetShell
            accent="#e0cbb6"
            eyebrow="RESTAURANT ROW"
            title="RR Assignments"
            className="nw-widget--rr"
            headerRight={<span className="nw-widget-meta">1 open</span>}
            onTearOff={() => tearOff('rr')}
          >
            <RRAssignments rr={D.RR_ASSIGN} roster={D.ROSTER} />
          </WidgetShell>
        )}

        {/* Roster */}
        {!tornWidgets['roster'] && (
          <WidgetShell
            accent="#3acab1"
            eyebrow="GRAVE CREW"
            title="Roster"
            className="nw-widget--roster"
            headerRight={<span className="nw-widget-meta">17 scheduled · 1 callout</span>}
            onTearOff={() => tearOff('roster')}
          >
            <GraveRoster roster={D.ROSTER} state={D.ROSTER_STATE} />
          </WidgetShell>
        )}

        {/* Events */}
        {!tornWidgets['events'] && (
          <WidgetShell
            accent="#c84f9c"
            eyebrow="FLOOR & BEO"
            title="Tonight's Events"
            className="nw-widget--events"
            headerRight={<span className="nw-widget-meta">{D.EVENTS.length} scheduled</span>}
            onTearOff={() => tearOff('events')}
          >
            <EventsCard events={D.EVENTS} currentMin={currentMin} />
          </WidgetShell>
        )}

        {/* Mini timeline */}
        {!tornWidgets['minitl'] && (
          <WidgetShell
            accent="#7d5cff"
            eyebrow="SHIFT TIMELINE"
            title="Tonight at a Glance"
            className="nw-widget--minitl"
            headerRight={<span className="nw-widget-meta">{D.OBSERVATIONS.length} obs · 4 breaks</span>}
            onTearOff={() => tearOff('minitl')}
          >
            <MiniTimeline observations={D.OBSERVATIONS} currentMin={currentMin} totalMin={window.SHIFT_MIN} />
          </WidgetShell>
        )}
      </section>

      {/* Freeform canvas zone */}
      <section className="nw-canvas-zone">
        <FreeformCanvas
          strokes={D.STROKES}
          observations={D.OBSERVATIONS}
          currentMin={currentMin}
          mode={displayMode}
          tornWidgets={tornWidgets}
          bgPattern={tweaks.canvasBg}
          inkColor={tweaks.inkColor}
          showGuides={tweaks.showGuides}
          animateStrokes={tweaks.animateStrokes}
          selectedObsId={selectedObs}
          onSelectObs={setSelectedObs}
        />

        {/* Torn-off floating widgets on canvas */}
        {Object.entries(tornWidgets).map(([id, pos]) => (
          <div key={id} className="nw-torn" style={{ left: pos.x, top: pos.y }}>
            <div className="nw-torn-tether" />
            <div className="nw-torn-card">
              <header className="nw-torn-head">
                <span className="nw-eyebrow">FLOATING · {id.toUpperCase()}</span>
                <button onClick={() => tearOff(id)} aria-label="Re-dock" className="nw-icon-btn">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </header>
              <div className="nw-torn-body">
                Drag header to reposition · tap × to re-dock
              </div>
            </div>
          </div>
        ))}

        <TimelineStrip
          currentMin={currentMin}
          observations={D.OBSERVATIONS}
          mode={displayMode}
          onTimeChange={(m) => { setCurrentMin(m); setTweak('currentMin', m); }}
        />

        <QuickStamp
          open={fabOpen}
          onOpen={() => setFabOpen(true)}
          onClose={() => setFabOpen(false)}
          onSave={(obs) => { console.log('saved obs', obs); }}
          zones={D.ZONE_COLORS}
          roster={D.ROSTER}
        />
      </section>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Nightwatch Tweaks">
        <window.TweakSection label="Page mode" />
        <window.TweakRadio
          value={tweaks.pageMode}
          onChange={(v) => setTweak('pageMode', v)}
          options={[
            { label: 'LIVE',   value: 'live' },
            { label: 'PAST',   value: 'past' },
            { label: 'FUTURE', value: 'future' },
          ]}
        />

        <window.TweakSection label="Shift clock" />
        <window.TweakSlider
          label={`Time · ${window.minToClock(tweaks.currentMin || 0)}`}
          value={tweaks.currentMin || 0}
          onChange={(v) => { setTweak('currentMin', v); setCurrentMin(v); }}
          min={0} max={475} step={1}
          unit=" min"
        />

        <window.TweakSection label="Canvas" />
        <window.TweakRadio
          label="Background"
          value={tweaks.canvasBg}
          onChange={(v) => setTweak('canvasBg', v)}
          options={[
            { label: 'DOTS',  value: 'dots' },
            { label: 'GRID',  value: 'grid' },
            { label: 'BLANK', value: 'blank' },
          ]}
        />
        <window.TweakColor
          label="Pencil ink"
          value={tweaks.inkColor}
          onChange={(v) => setTweak('inkColor', v)}
          options={['#F2F2F4', '#FFD60A', '#30b2ff', '#e44d3a']}
        />
        <window.TweakToggle
          label="Animate stroke replay"
          value={tweaks.animateStrokes}
          onChange={(v) => setTweak('animateStrokes', v)}
        />
        <window.TweakToggle
          label="Show layout guides"
          value={tweaks.showGuides}
          onChange={(v) => setTweak('showGuides', v)}
        />

        <window.TweakSection label="Accent palette" />
        <window.TweakRadio
          value={tweaks.accent}
          onChange={(v) => setTweak('accent', v)}
          options={[
            { label: 'CYAN + GOLD', value: 'cyan-gold' },
            { label: 'GOLD-LED',    value: 'gold' },
          ]}
        />
      </window.TweaksPanel>
    </div>
  );
}

window.App = App;
