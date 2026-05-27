// ShiftBuilder — Velvet interactive prototype.
// Architecture: useReducer for all mutations, useCallback for stable refs,
// useTransition for non-urgent sheet updates (day switch).
// Children get stable callbacks → React.memo on cards has real bite.

const { useState, useEffect, useMemo, useReducer, useCallback, useTransition } = React;

function ShiftBuilderApp() {
  // ── Deployment state via reducer ──────────────────────────────────────────
  const [deploy, dispatch] = useReducer(deploymentReducer, null, makeInitialDeployState);
  const assignments = deploy.present;
  const canUndo = deploy.past.length > 0;
  const canRedo = deploy.future.length > 0;

  // ── Selection / editing ───────────────────────────────────────────────────
  const [selectedKey, setSelectedKey] = useState('Z5');
  const [editing, setEditing] = useState({ slot: 'Z5', field: 'task' });
  const [taskDraft, setTaskDraft] = useState('');

  // ── Day + view ────────────────────────────────────────────────────────────
  const [dayIdx, setDayIdx] = useState(5);
  const [isPendingDay, startDayTransition] = useTransition();

  // ── Top-level UI state ────────────────────────────────────────────────────
  const [draftMode, setDraftMode] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [view, setView] = useState('Deployment');
  const [prevView, setPrevView] = useState(null); // for exit animation
  const [zoom, setZoom] = useState(100);
  const [stagedTm, setStagedTm] = useState(null); // tm object | null
  const [toast, setToast] = useState(null);
  // Inline composer for empty cards: { slot, rect } | null
  const [composer, setComposer] = useState(null);
  // Rail visibility
  const [rosterOpen, setRosterOpen] = useState(true);
  const [markerOpen, setMarkerOpen] = useState(true);

  const switchView = useCallback((v) => {
    setPrevView(view);
    setView(v);
  }, [view]);

  const flashToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(t => t === msg ? null : t), 1800);
  }, []);

  // ── Stable action dispatchers (useCallback → stable refs → React.memo works)
  const assignTm = useCallback((slot, tm) => {
    dispatch({ type: A.ASSIGN_TM, slot, tm });
    setStagedTm(null);
    setSelectedKey(slot);
    setEditing({ slot, field: 'task' });
    setTaskDraft('');
    setMarkerOpen(true); // surface the marker pad after assignment
    flashToast(`${tm.name} → ${slot}`);
  }, [flashToast]);

  const clearSlot = useCallback((slot) => {
    dispatch({ type: A.CLEAR_SLOT, slot });
    flashToast(`${slot} cleared`);
  }, [flashToast]);

  const addTask = useCallback((slot, text) => {
    dispatch({ type: A.ADD_TASK, slot, text });
  }, []);

  const removeTask = useCallback((slot, idx) => {
    dispatch({ type: A.REMOVE_TASK, slot, idx });
  }, []);

  // Direct set — fixes the loop-on-stale-state bug.
  const setBreak = useCallback((slot, group) => {
    dispatch({ type: A.SET_BREAK, slot, group });
  }, []);

  const toggleLock = useCallback((slot) => {
    dispatch({ type: A.TOGGLE_LOCK, slot });
  }, []);

  const undo = useCallback(() => dispatch({ type: A.UNDO }), []);
  const redo = useCallback(() => dispatch({ type: A.REDO }), []);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const selectCard = useCallback((key) => {
    setSelectedKey(key);
    setEditing({ slot: key, field: 'task' });
    setTaskDraft('');
    setMarkerOpen(true); // auto-open marker pad on card tap
  }, []);

  // When a staged TM is held and user taps a card, drop them there.
  // Otherwise: if card is empty, open the inline composer; else open the marker pad.
  const handleCardClick = useCallback((key, event) => {
    if (stagedTm) {
      assignTm(key, stagedTm);
      return;
    }
    // Empty? Open composer anchored to the card.
    const empty = !assignments[key]?.tmName;
    if (empty && event?.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      setComposer({
        slot: key,
        rect: { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right, width: rect.width, height: rect.height },
      });
      setSelectedKey(key);
      return;
    }
    selectCard(key);
  }, [stagedTm, assignTm, assignments, selectCard]);

  const commitTask = useCallback(() => {
    const slot = editing.slot || selectedKey;
    if (taskDraft.trim() && slot) {
      addTask(slot, taskDraft);
      setTaskDraft('');
    }
  }, [editing.slot, selectedKey, taskDraft, addTask]);

  // ── Day switch via useTransition (keeps UI responsive during sheet rerender)
  const switchDay = useCallback((i) => {
    startDayTransition(() => setDayIdx(i));
  }, [startDayTransition]);

  // ── Keyboard sheet navigation ─────────────────────────────────────────────
  // Arrow keys navigate across the slot grid; Enter opens the Marker Pad.
  useEffect(() => {
    const onKey = (e) => {
      // Global shortcuts
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setPaletteOpen(p => !p); return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault(); undo(); return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault(); redo(); return;
      }
      if (e.key === 'Escape') {
        if (paletteOpen) { setPaletteOpen(false); return; }
        if (stagedTm) { setStagedTm(null); return; }
        setEditing(ed => ({ ...ed, field: null }));
        return;
      }
      // Arrow nav on the sheet — only when no input is focused
      if (document.activeElement?.tagName === 'INPUT') return;
      if (paletteOpen) return;
      if (['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key)) {
        e.preventDefault();
        const slots = selectors.orderedSlots;
        const cur = slots.indexOf(selectedKey);
        if (cur < 0) { selectCard(slots[0]); return; }
        // Z1-Z10 are 5 wide, RR cards are also 5 wide (2 sides each = 10 slots → 5 cards),
        // AUX is 6 wide, overlaps are 6 wide. Use flat index arithmetic with col widths.
        const COLS = { zone:5, rr:2, aux:6, ol:6 };
        const colCount = cur < 10 ? COLS.zone
          : cur < 20 ? COLS.rr
          : cur < 26 ? COLS.aux
          : COLS.ol;
        let next = cur;
        if (e.key === 'ArrowRight') next = Math.min(slots.length - 1, cur + 1);
        if (e.key === 'ArrowLeft')  next = Math.max(0, cur - 1);
        if (e.key === 'ArrowDown')  next = Math.min(slots.length - 1, cur + colCount);
        if (e.key === 'ArrowUp')    next = Math.max(0, cur - colCount);
        selectCard(slots[next]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, stagedTm, selectedKey, selectCard, undo, redo]);

  // ── Derived values (memoized — stable unless inputs change) ───────────────
  const stats = useMemo(() => selectors.placedCount(assignments), [assignments]);
  const conflicts = useMemo(() => selectors.conflictSlots(assignments), [assignments]);
  const placement = useMemo(() => selectors.placementMap(assignments), [assignments]);

  const dayDate = useMemo(() => ({
    dateNum: dayIdx === 0 ? 28 : dayIdx,
    monthYear: dayIdx === 0 ? 'February 2026' : 'March 2026',
  }), [dayIdx]);

  return (
    <SbStage w={1366} h={1024}>
      {/* Velvet substrate */}
      <div style={{
        position:'absolute', inset:0,
        background:`
          radial-gradient(ellipse 70% 60% at 50% 0%, rgba(80,40,30,0.18), transparent 70%),
          radial-gradient(ellipse 60% 80% at 100% 100%, rgba(184,151,8,0.06), transparent 70%),
          radial-gradient(ellipse 60% 80% at 0% 100%, rgba(120,30,40,0.08), transparent 70%),
          linear-gradient(180deg, #0F0E10 0%, #08070A 100%)
        `,
        opacity: isPendingDay ? 0.85 : 1,
        transition: 'opacity 0.15s',
      }}>
        <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.05, mixBlendMode:'overlay', pointerEvents:'none' }}>
          <filter id="velvet-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" /></filter>
          <rect width="100%" height="100%" filter="url(#velvet-noise)" />
        </svg>
      </div>

      {/* Sheet — centered, switches between Deployment and Break view */}
      <div style={{
        position:'absolute', left:'50%', top:'50%',
        transform:`translate(-50%, -50%) scale(${0.95 * (zoom/100)})`,
        transformOrigin:'center center',
        filter:'drop-shadow(0 50px 100px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(255,255,255,0.08))',
        transition:`transform ${0.38}s var(--spring-gentle, cubic-bezier(0.22,1,0.36,1))`,
        opacity: isPendingDay ? 0.6 : 1,
      }}>
        {/* View wrapper — crossfade on switch */}
        <div key={view} style={{
          animation: 'sb-view-in 0.34s cubic-bezier(0.16,1,0.3,1) both',
        }}>
          {view === 'Breaks' ? (
            <BreakSheet
              assignments={assignments}
              dayIdx={dayIdx}
              dateNum={dayDate.dateNum}
              monthYear={dayDate.monthYear}
              stats={stats}
            />
          ) : (
            <DeploymentSheet
              assignments={assignments}
              selectedKey={selectedKey}
              onCardClick={handleCardClick}
              stagedTm={stagedTm}
              onDropTm={handleCardClick}
              dayIdx={dayIdx}
              dateNum={dayDate.dateNum}
              monthYear={dayDate.monthYear}
              stats={stats}
              conflicts={conflicts}
            />
          )}
        </div>
      </div>

      {/* Collapsed roster tab */}
      {!rosterOpen && (
        <button
          onClick={() => setRosterOpen(true)}
          style={{
            position:'absolute', top:'50%', left:0,
            transform:'translateY(-50%)',
            width:36, height:120, borderRadius:'0 14px 14px 0',
            background:'rgba(28,28,30,0.72)',
            backdropFilter:'blur(32px) saturate(160%)',
            WebkitBackdropFilter:'blur(32px) saturate(160%)',
            border:'1px solid rgba(255,255,255,0.10)',
            borderLeft:'none',
            boxShadow:'inset -1px 0 0 rgba(255,255,255,0.08), 4px 0 24px -8px rgba(0,0,0,0.4)',
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:8,
            cursor:'pointer', zIndex:9,
            animation:'sb-slide-left-in 0.4s cubic-bezier(0.16,1,0.3,1) both',
            color:'#C7C7CC',
          }}
          aria-label="Open roster"
        >
          <span style={{ fontSize:14, transform:'rotate(-90deg)', display:'block' }}>›</span>
          <span style={{ fontSize:8.5, fontWeight:800, letterSpacing:'1.4px', writingMode:'vertical-rl', textTransform:'uppercase', color:'#9CA3AF', fontFamily:'Inter Tight, system-ui' }}>Roster</span>
        </button>
      )}

      {/* Collapsed marker pad tab */}
      {!markerOpen && (
        <button
          onClick={() => setMarkerOpen(true)}
          style={{
            position:'absolute', top:'50%', right:0,
            transform:'translateY(-50%)',
            width:36, height:120, borderRadius:'14px 0 0 14px',
            background:'rgba(28,28,30,0.72)',
            backdropFilter:'blur(32px) saturate(160%)',
            WebkitBackdropFilter:'blur(32px) saturate(160%)',
            border:'1px solid rgba(255,255,255,0.10)',
            borderRight:'none',
            boxShadow:'inset 1px 0 0 rgba(255,255,255,0.08), -4px 0 24px -8px rgba(0,0,0,0.4)',
            display:'flex', flexDirection:'column', alignItems:'center',
            justifyContent:'center', gap:8,
            cursor:'pointer', zIndex:9,
            animation:'sb-slide-right-in 0.4s cubic-bezier(0.16,1,0.3,1) both',
            color:'#C7C7CC',
          }}
          aria-label="Open marker pad"
        >
          <span style={{ fontSize:14, transform:'rotate(90deg)', display:'block' }}>›</span>
          <span style={{ fontSize:8.5, fontWeight:800, letterSpacing:'1.4px', writingMode:'vertical-rl', textTransform:'uppercase', color:'#9CA3AF', fontFamily:'Inter Tight, system-ui' }}>Inspector</span>
        </button>
      )}

      {/* Chrome */}
      <SbTopBar
        dayIdx={dayIdx}
        setDayIdx={switchDay}
        draftMode={draftMode}
        setDraftMode={setDraftMode}
        openPalette={useCallback(() => setPaletteOpen(true), [])}
        stats={stats}
      />
      <SbRosterRail
        assignments={assignments}
        stagedTm={stagedTm}
        setStagedTm={setStagedTm}
        selectedKey={selectedKey}
        onAssignToSelected={useCallback((tm) => assignTm(selectedKey, tm), [assignTm, selectedKey])}
        open={rosterOpen}
        onToggle={useCallback(() => setRosterOpen(o => !o), [])}
      />
      <SbMarkerPad
        slotKey={selectedKey}
        assignment={assignments[selectedKey]}
        editing={editing}
        setEditing={setEditing}
        taskDraft={taskDraft}
        setTaskDraft={setTaskDraft}
        commitTask={commitTask}
        addTaskDirect={useCallback((text) => addTask(selectedKey, text), [addTask, selectedKey])}
        removeTask={useCallback((idx) => removeTask(selectedKey, idx), [removeTask, selectedKey])}
        setBreak={useCallback((group) => setBreak(selectedKey, group), [setBreak, selectedKey])}
        toggleLock={useCallback(() => toggleLock(selectedKey), [toggleLock, selectedKey])}
        clearSlot={useCallback(() => clearSlot(selectedKey), [clearSlot, selectedKey])}
        open={markerOpen}
        onToggle={useCallback(() => setMarkerOpen(o => !o), [])}
        onCardClick={selectCard}
      />
      <SbBottomDock
        view={view} setView={switchView}
        zoom={zoom} setZoom={setZoom}
        canUndo={canUndo} canRedo={canRedo}
        undo={undo} redo={redo}
        openPalette={useCallback(() => setPaletteOpen(true), [])}
        rosterOpen={rosterOpen} onToggleRoster={useCallback(() => setRosterOpen(o => !o), [])}
        markerOpen={markerOpen} onToggleMarker={useCallback(() => setMarkerOpen(o => !o), [])}
      />

      {paletteOpen && (
        <SbCmdK
          close={useCallback(() => setPaletteOpen(false), [])}
          assignments={assignments}
          assignTm={assignTm}
          addTaskToSlot={addTask}
          selectCard={selectCard}
        />
      )}

      {/* Inline empty-card composer */}
      {composer && (
        <InlineComposer
          slot={composer.slot}
          anchorRect={composer.rect}
          roster={SB_ROSTER}
          placement={placement}
          onClose={() => setComposer(null)}
          onAssign={(tm) => { assignTm(composer.slot, tm); setComposer(null); }}
          onOpenInspector={() => {
            setComposer(null);
            setMarkerOpen(true);
            selectCard(composer.slot);
          }}
        />
      )}

      {toast && (
        <div role="status" aria-live="polite" style={{
          position:'absolute', left:'50%', top:84, transform:'translateX(-50%)',
          padding:'8px 16px', borderRadius:12,
          background:'rgba(28,28,30,0.85)',
          backdropFilter:'blur(20px) saturate(180%)',
          WebkitBackdropFilter:'blur(20px) saturate(180%)',
          border:'1px solid rgba(184,151,8,0.45)',
          color:'#E9B948', fontSize:12.5, fontWeight:700, letterSpacing:'-0.1px',
          boxShadow:'0 8px 24px -8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
          zIndex:50, fontFamily:'Inter Tight, system-ui',
          animation:'sb-toast-in 0.2s cubic-bezier(0.2,0.7,0.2,1)',
          pointerEvents:'none',
        }}>{toast}</div>
      )}
    </SbStage>
  );
}

Object.assign(window, { ShiftBuilderApp });
