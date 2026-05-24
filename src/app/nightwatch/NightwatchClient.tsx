'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ShiftMode, NightSummary, TaskItem, Observation, CommittedStroke, ZoneAssignment, RRRow, RosterMember, UIEvent, RosterState } from '@/lib/nightwatch/types';
import { ZONE_COLORS } from './mockData';

import {
  fetchCurrentWeekNights,
  fetchTasks,
  fetchZoneData,
  fetchShiftNotes,
  fetchShiftEvents,
  fetchCanvasStrokes,
  updateTaskStatus,
  addTaskToNight,
  saveShiftNote,
  saveCanvasStroke,
  deleteCanvasStroke,
  clearCanvasStrokes,
  addShiftEvent,
} from '@/lib/nightwatch/db';

import PageHeader from './components/PageHeader';
import ShiftStrip from './components/ShiftStrip';
import { TaskBoard, ZoneDeployment, RRAssignments, GraveRoster, EventsCard } from './components/Widgets';
import FreeformCanvas from './components/FreeformCanvas';
import TimelineStrip from './components/TimelineStrip';
import QuickStamp from './components/QuickStamp';

const SHIFT_MIN = 475; // 23:00 → 06:55

// ── Shift clock helpers ───────────────────────────────────────
// Grave shift starts 23:00 on the shift date.
// Early morning (h < 7) means we're past midnight, still on last night's shift.
function computeCurrentMin(): number {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  // Not in shift window at all — return 0 (show shift start)
  if (h >= 7 && h < 23) return 0;
  // Minutes past 23:00 — add 24h offset for post-midnight hours
  const totalMins = h < 7 ? (h + 24) * 60 + m : h * 60 + m;
  return Math.max(0, Math.min(totalMins - 23 * 60, SHIFT_MIN));
}

// helpers
function minToClock(m: number): string {
  const total = 23 * 60 + m;
  const h24 = Math.floor(total / 60) % 24;
  const min = total % 60;
  const h12 = ((h24 + 11) % 12) + 1;
  const ampm = h24 < 12 ? 'am' : 'pm';
  return `${h12}:${String(min).padStart(2, '0')}${ampm}`;
}

function fmtPhase(m: number): string {
  if (m < 180) return 'EARLY SHIFT';
  if (m < 300) return 'MID-SHIFT';
  if (m < 420) return 'LATE SHIFT';
  return 'CLOSING SHIFT';
}

export default function NightwatchClient() {
  // ── Clock — initialized from real wall clock ───────────────
  const [currentMin, setCurrentMin] = useState(computeCurrentMin);

  // ── Night / week ───────────────────────────────────────────
  const [week, setWeek]                   = useState<NightSummary[]>([]);
  const [activeNightId, setActiveNightId] = useState<string>('');
  const [todayNightId, setTodayNightId]   = useState<string | null>(null);

  // ── Widget data — start empty, fill from DB ────────────────
  const [tasks, setTasks]               = useState<TaskItem[]>([]);
  const [zones, setZones]               = useState<ZoneAssignment[]>([]);
  const [rrRows, setRrRows]             = useState<RRRow[]>([]);
  const [roster, setRoster]             = useState<RosterMember[]>([]);
  const [rosterState, setRosterState]   = useState<RosterState>({});
  const [observations, setObservations] = useState<Observation[]>([]);
  const [strokes, setStrokes]           = useState<CommittedStroke[]>([]);
  const [shiftEvents, setShiftEvents]   = useState<UIEvent[]>([]);

  // ── UI state ───────────────────────────────────────────────
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [fabOpen, setFabOpen]             = useState(false);
  const [dbReady, setDbReady]             = useState(false);
  const [loading, setLoading]             = useState(true);

  // ── Derive mode from active night ──────────────────────────
  const activeNight = week.find(n => n.id === activeNightId) ?? week[0];
  const mode: ShiftMode =
    activeNight?.state === 'live'   ? 'live'   :
    activeNight?.state === 'past'   ? 'past'   : 'future';

  // ── Tick clock ────────────────────────────────────────────
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => {
      setCurrentMin(m => Math.min(m + 1, SHIFT_MIN));
    }, 30_000);
    return () => clearInterval(id);
  }, [mode]);

  // ── Initial data load ─────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        // 1. Week nights (determines which night is live)
        const { nights, todayNightId: nightId } = await fetchCurrentWeekNights();
        if (nights.length > 0) {
          setWeek(nights);
          const liveId = nightId ?? nights.find(n => n.state === 'live')?.id ?? nights[0].id;
          setActiveNightId(liveId);
          if (nightId) setTodayNightId(nightId);
        }

        const resolvedNightId = nightId ?? null;

        // 2. All queries in parallel
        const [dbTasks, dbZone, dbNotes, dbStrokes, dbEvents] = await Promise.all([
          fetchTasks(),
          resolvedNightId ? fetchZoneData(resolvedNightId) : null,
          resolvedNightId ? fetchShiftNotes(resolvedNightId) : null,
          resolvedNightId ? fetchCanvasStrokes(resolvedNightId) : null,
          resolvedNightId ? fetchShiftEvents(resolvedNightId) : null,
        ]);

        setTasks(dbTasks);
        if (dbZone?.zones.length)  setZones(dbZone.zones);
        if (dbZone?.rr.length)     setRrRows(dbZone.rr);
        if (dbZone?.roster.length) setRoster(dbZone.roster);
        if (dbNotes?.length)       setObservations(dbNotes);
        if (dbStrokes?.length)     setStrokes(dbStrokes);
        if (dbEvents)              setShiftEvents(dbEvents);
      } finally {
        setLoading(false);
        setDbReady(true);
      }
    }
    load();
  }, []);

  // ── Reload zone / notes / strokes when switching nights ───
  useEffect(() => {
    if (!dbReady || activeNightId === todayNightId) return; // tonight already loaded
    async function loadNight() {
      const [dbZone, dbNotes, dbStrokes, dbEvents] = await Promise.all([
        fetchZoneData(activeNightId),
        fetchShiftNotes(activeNightId),
        fetchCanvasStrokes(activeNightId),
        fetchShiftEvents(activeNightId),
      ]);
      if (dbZone.zones.length)      setZones(dbZone.zones);
      if (dbZone.rr.length)         setRrRows(dbZone.rr);
      if (dbZone.roster.length)     setRoster(dbZone.roster);
      setObservations(dbNotes);
      setStrokes(dbStrokes);
      setShiftEvents(dbEvents);
    }
    loadNight();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeNightId, dbReady]);

  // ── Callbacks ─────────────────────────────────────────────
  const toggleTask = useCallback((id: string) => {
    setTasks(prev => {
      const next = prev.map(t => t.id === id ? { ...t, done: !t.done } : t);
      const task = next.find(t => t.id === id);
      if (task) updateTaskStatus(id, task.done).catch(console.error);
      return next;
    });
  }, []);

  const addTask = useCallback((text: string) => {
    const nightId = todayNightId;
    if (nightId) {
      addTaskToNight(nightId, text)
        .then(newTask => {
          if (newTask) setTasks(prev => [...prev, newTask]);
        })
        .catch(console.error);
    } else {
      // Optimistic local-only fallback
      const newTask: TaskItem = {
        id: `t${Date.now()}`,
        text,
        done: false,
        due: 'TONIGHT',
        lane: 'today',
      };
      setTasks(prev => [...prev, newTask]);
    }
  }, [todayNightId]);

  // ── Shift events ─────────────────────────────────────────
  const handleAddEvent = useCallback((eventData: {
    label: string;
    location: string;
    priority: 'low' | 'normal' | 'high';
    time: string;
  }) => {
    const nightId = todayNightId;
    // Optimistic add
    const optimisticEvent: UIEvent = {
      id: `ev${Date.now()}`,
      ...eventData,
    };
    setShiftEvents(prev => [...prev, optimisticEvent].sort((a, b) => a.time.localeCompare(b.time)));

    if (nightId) {
      addShiftEvent(nightId, eventData)
        .then(saved => {
          if (saved) {
            setShiftEvents(prev =>
              prev.map(e => e.id === optimisticEvent.id ? saved : e)
                  .sort((a, b) => a.time.localeCompare(b.time))
            );
          }
        })
        .catch(console.error);
    }
  }, [todayNightId]);

  const saveObservation = useCallback((data: {
    text: string;
    urgency: 'low' | 'normal' | 'urgent';
    zone: string;
    tm: string;
  }) => {
    const h24 = Math.floor(((23 * 60 + currentMin) % (24 * 60)) / 60);
    const m   = (23 * 60 + currentMin) % 60;
    const ts  = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    // Deterministic grid placement — 4-column grid, rows spaced 120px apart
    const idx = observations.length;
    const col = idx % 4;
    const row = Math.floor(idx / 4);
    const x   = 140 + col * 230;
    const y   = 60  + row * 120;

    // Optimistic update
    const optimisticObs: Observation = {
      id: `o${Date.now()}`,
      text: data.text,
      ts,
      urgency: data.urgency,
      x,
      y,
      linkedEntityType: data.zone ? 'zone' : data.tm ? 'tm' : null,
      linkedEntityId: data.zone || data.tm || null,
    };
    setObservations(prev => [...prev, optimisticObs]);

    // Persist if we have a night
    if (todayNightId) {
      saveShiftNote(todayNightId, { ...data, x, y, ts })
        .then(saved => {
          if (saved) {
            // Replace optimistic with DB record (gets real UUID)
            setObservations(prev =>
              prev.map(o => o.id === optimisticObs.id ? saved : o)
            );
          }
        })
        .catch(console.error);
    }
  }, [currentMin, todayNightId]);

  const handleStrokeCommit = useCallback((pathData: string, color: string, width: number): Promise<string | null> => {
    if (todayNightId && mode === 'live') {
      return saveCanvasStroke(todayNightId, { pathData, color, width });
    }
    return Promise.resolve(null);
  }, [todayNightId, mode]);

  const handleEraseDbStroke = useCallback((id: string) => {
    setStrokes(prev => prev.filter(s => s.id !== id));
    deleteCanvasStroke(id).catch(console.error);
  }, []);

  const handleClearStrokes = useCallback(() => {
    setStrokes([]);
    if (todayNightId) {
      clearCanvasStrokes(todayNightId).catch(console.error);
    }
  }, [todayNightId]);

  // ── KPIs ──────────────────────────────────────────────────
  const openTasks = tasks.filter(t => !t.done && t.lane !== 'upcoming').length;
  const filledZones = zones.filter(z => z.tmId).length;

  const kpis = [
    { label: 'Zones Filled', value: `${filledZones}/${zones.length || 10}`, tone: 'ok'   as const },
    { label: 'Roster',       value: `${roster.length} on floor`,             tone: 'ok'   as const },
    { label: 'Open Tasks',   value: String(openTasks),                        tone: 'warn' as const },
  ];

  // ── currentMinClock helper (for EventsCard default time) ──
  const currentMinClock = (() => {
    const h24 = Math.floor(((23 * 60 + currentMin) % (24 * 60)) / 60);
    const m   = (23 * 60 + currentMin) % 60;
    return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  })();

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="nw-app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div className="nw-loading">
          <div className="nw-loading-spinner" />
          <span className="nw-loading-label">Loading shift data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="nw-app">
      {/* Row 1 — Header */}
      <PageHeader
        shift={activeNight ?? week[0]}
        currentMin={currentMin}
        mode={mode}
        kpis={kpis}
        onJumpToNow={() => { if (todayNightId) setActiveNightId(todayNightId); }}
        minToClock={minToClock}
        fmtPhase={fmtPhase}
        shiftMin={SHIFT_MIN}
      />

      {/* Row 2 — Shift Strip */}
      <ShiftStrip
        week={week}
        activeId={activeNightId}
        onSelect={setActiveNightId}
        mode={mode}
      />

      {/* Row 3 — Widget Dock */}
      <div className="nw-dock">
        {/* Task Board — col 1, rows 1-2 */}
        <div className="nw-widget nw-widget--taskboard" style={{ ['--accent' as string]: '#FFD60A' }}>
          <div className="nw-widget-accent" />
          <header className="nw-widget-head">
            <div className="nw-widget-titleblock">
              <div className="nw-eyebrow nw-widget-eyebrow">TASKS</div>
              <h3 className="nw-widget-title">Shift Task Board</h3>
            </div>
            <div className="nw-widget-actions">
              <span className="nw-widget-meta">{tasks.filter(t => !t.done).length} open</span>
            </div>
          </header>
          <div className="nw-widget-body">
            <TaskBoard tasks={tasks} onToggle={toggleTask} onAddTask={addTask} mode={mode} />
          </div>
        </div>

        {/* Zone Deployment — col 2, rows 1-2 */}
        <div className="nw-widget nw-widget--zones" style={{ ['--accent' as string]: '#30b2ff' }}>
          <div className="nw-widget-accent" />
          <header className="nw-widget-head">
            <div className="nw-widget-titleblock">
              <div className="nw-eyebrow nw-widget-eyebrow">DEPLOYMENT</div>
              <h3 className="nw-widget-title">Zone Assignments</h3>
            </div>
            <div className="nw-widget-actions">
              <span className="nw-widget-meta">{filledZones} zones filled</span>
            </div>
          </header>
          <div className="nw-widget-body">
            <ZoneDeployment zones={zones} roster={roster} zoneColors={ZONE_COLORS} onPick={() => {}} />
          </div>
        </div>

        {/* RR Assignments — col 3, rows 1-2 */}
        <div className="nw-widget nw-widget--rr" style={{ ['--accent' as string]: '#e0cbb6' }}>
          <div className="nw-widget-accent" />
          <header className="nw-widget-head">
            <div className="nw-widget-titleblock">
              <div className="nw-eyebrow nw-widget-eyebrow">RESTROOMS</div>
              <h3 className="nw-widget-title">RR Assignments</h3>
            </div>
          </header>
          <div className="nw-widget-body">
            <RRAssignments rr={rrRows} roster={roster} />
          </div>
        </div>

        {/* RR Roster — col 3, row 2 */}
        <div className="nw-widget nw-widget--roster" style={{ ['--accent' as string]: '#7d5cff' }}>
          <div className="nw-widget-accent" />
          <header className="nw-widget-head">
            <div className="nw-widget-titleblock">
              <div className="nw-eyebrow nw-widget-eyebrow">PERSONNEL</div>
              <h3 className="nw-widget-title">Grave Roster</h3>
            </div>
            <div className="nw-widget-actions">
              <span className="nw-widget-meta">{roster.length} on shift</span>
            </div>
          </header>
          <div className="nw-widget-body">
            <GraveRoster roster={roster} state={rosterState} />
          </div>
        </div>

        {/* Shift Events — col 4, rows 1-2 */}
        <div className="nw-widget nw-widget--events" style={{ ['--accent' as string]: '#FF3B30' }}>
          <div className="nw-widget-accent" />
          <header className="nw-widget-head">
            <div className="nw-widget-titleblock">
              <div className="nw-eyebrow nw-widget-eyebrow">BEO / FLOOR</div>
              <h3 className="nw-widget-title">Shift Events</h3>
            </div>
            <div className="nw-widget-actions">
              <span className="nw-widget-meta">{shiftEvents.length} logged</span>
            </div>
          </header>
          <div className="nw-widget-body">
            <EventsCard
              events={shiftEvents}
              currentMin={currentMin}
              mode={mode}
              currentMinClock={currentMinClock}
              onAdd={mode === 'live' ? handleAddEvent : undefined}
            />
          </div>
        </div>
      </div>

      {/* Row 4 — Freeform Canvas + Timeline */}
      <div className="nw-canvas-zone">
        <FreeformCanvas
          strokes={strokes}
          observations={observations}
          currentMin={currentMin}
          mode={mode}
          selectedObsId={selectedObsId}
          onSelectObs={setSelectedObsId}
          onStrokeCommit={handleStrokeCommit}
          onEraseDbStroke={handleEraseDbStroke}
          onClearStrokes={handleClearStrokes}
          onLongHoverCanvas={mode === 'live' ? () => setFabOpen(true) : undefined}
          inkColor="#F2F2F4"
          bgPattern="dots"
          showGuides={false}
          animateStrokes={true}
        />
        <TimelineStrip
          currentMin={currentMin}
          observations={observations}
          mode={mode}
          onTimeChange={mode === 'live' ? undefined : setCurrentMin}
          minToClock={minToClock}
          shiftMin={SHIFT_MIN}
        />

        {/* Quick Observation FAB */}
        {mode === 'live' && (
          <QuickStamp
            open={fabOpen}
            onOpen={() => setFabOpen(true)}
            onClose={() => setFabOpen(false)}
            onSave={saveObservation}
            zones={ZONE_COLORS}
            roster={roster}
            currentMin={currentMin}
            minToClock={minToClock}
          />
        )}
      </div>
    </div>
  );
}
