// The Marker Pad — the novel task-entry surface that solves the pain point.
//
// Pain point: "Task entry is too many steps. ⌘K → Tasks → zone picker → Continue → type → Enter"
//
// Cure (no zone picker, no Continue, no modal): the *slot is implicit*. Whichever
// card you tapped on the sheet IS the slot. The Marker Pad opens with the task
// input already focused, recents are one tap away, Enter commits, Tab grabs the
// top suggestion. Multiple tasks in a row without ever leaving the pad.

function SbMarkerPad({
  slotKey, assignment, editing, setEditing,
  taskDraft, setTaskDraft, commitTask, addTaskDirect, removeTask,
  setBreak, toggleLock, clearSlot,
  open, onToggle, onCardClick,
}) {
  const { useRef, useEffect, useMemo } = React;
  const accent = SB_TOKENS.zoneColor[slotKey]
              || SB_TOKENS.auxColor[slotKey]
              || (slotKey?.startsWith('MRR') || slotKey?.startsWith('WRR')
                  ? SB_TOKENS.rrColor[parseInt(slotKey.replace(/[MW]RR/,''),10)]
                  : null)
              || '#6B7280';
  const icon = SB_TOKENS.zoneIcon[slotKey]
            || SB_TOKENS.auxIcon[slotKey]
            || (slotKey?.startsWith('MRR') || slotKey?.startsWith('WRR')
                ? SB_TOKENS.rrIcon[parseInt(slotKey.replace(/[MW]RR/,''),10)]
                : '●');

  const slotDef = useMemo(() => {
    return SB_ZONES.find(z => z.key === slotKey)
        || SB_AUX.find(a => a.key === slotKey)
        || (() => {
            if (slotKey?.startsWith('MRR') || slotKey?.startsWith('WRR')) {
              const num = parseInt(slotKey.replace(/[MW]RR/,''),10);
              const rr = SB_RR.find(r => r.num === num);
              return rr ? { ...rr, label: `${slotKey} · ${rr.label}`, loc: `${rr.loc} · ${slotKey.startsWith('M') ? "Men's" : "Women's"}` } : null;
            }
            if (slotKey?.startsWith('OL-')) {
              const isPm = slotKey.includes('PM');
              return { label: isPm ? 'PM OVERLAP' : 'AM OVERLAP', loc: isPm ? '10p – 4a' : '3a – 9a' };
            }
            return null;
          })();
  }, [slotKey]);

  const tm = assignment?.tmId ? SB_ROSTER.find(r => r.id === assignment.tmId) : null;
  const tasks = assignment?.tasks || [];
  const breakGroup = assignment?.breakGroup ?? 0;
  const breakTime = ['no break', '12:00a', '1:30a', '3:00a'][breakGroup];

  // Top suggestions for autocomplete
  const suggestions = useMemo(() => {
    const q = taskDraft.toLowerCase().trim();
    const recents = SB_RECENT_TASKS;
    if (!q) return recents.slice(0, 6);
    return recents.filter(t => t.toLowerCase().includes(q)).slice(0, 6);
  }, [taskDraft]);

  const topSuggestion = suggestions[0] && suggestions[0].toLowerCase() !== taskDraft.toLowerCase().trim()
    ? suggestions[0] : null;

  const inputRef = useRef(null);
  useEffect(() => {
    if (editing.field === 'task' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing.slot, editing.field]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (taskDraft.trim()) {
        commitTask();
        // keep focus
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    } else if (e.key === 'Tab' && topSuggestion) {
      e.preventDefault();
      setTaskDraft(topSuggestion);
    } else if (e.key === 'Escape') {
      setTaskDraft('');
      inputRef.current?.blur();
    }
  };

  return (
    <div style={{
      position:'absolute', top:88, right:14, width:296, bottom:78,
      borderRadius: 22,
      background: 'rgba(28,28,30,0.58)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: `
        inset 0 1px 0 rgba(255,255,255,0.14),
        0 20px 40px -20px rgba(0,0,0,0.5),
        0 0 0 1px ${accent}22
      `,
      padding:'14px 14px 12px',
      display:'flex', flexDirection:'column', gap:12,
      zIndex: 8,
      overflow:'hidden',
      fontFamily:'Inter Tight, system-ui',
      /* Slide + fade */
      transform: open ? 'translateX(0) scaleX(1)' : 'translateX(110%) scaleX(0.92)',
      transformOrigin: 'right center',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: open
        ? 'transform 0.42s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease'
        : 'transform 0.34s cubic-bezier(0.4,0,1,1), opacity 0.22s ease',
    }}>
      {/* Accent rail at left edge */}
      <div style={{
        position:'absolute', top:18, left:-1, width:3, height:48,
        borderRadius:'0 3px 3px 0',
        background: accent,
        boxShadow: `0 0 16px ${accent}88`,
      }} />

      {/* Identity header with close button */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:24, color:accent, lineHeight:1 }}>{icon}</span>
            <span style={{
              fontSize:11, fontWeight:800, letterSpacing:'1.6px', color: accent,
              fontFamily:'Atkinson Hyperlegible, Inter Tight',
            }}>{slotDef?.label}</span>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#F2F2F4', letterSpacing:'-0.4px', fontFamily:'Bricolage Grotesque, Inter Tight' }}>
            {slotDef?.loc}
          </div>
          <div style={{ fontSize:10.5, color:'#8E8E93', fontFamily:'JetBrains Mono, monospace', marginTop:2 }}>
            slot · {slotKey}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
          <button
            onClick={onToggle}
            aria-label="Collapse marker pad"
            style={{
              width:24, height:24, borderRadius:8,
              background:'rgba(255,255,255,0.06)',
              border:'1px solid rgba(255,255,255,0.10)',
              color:'#6C6C72', fontSize:14, fontWeight:700,
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', transition:'all 0.15s', flexShrink:0,
            }}>›</button>
          <span style={{ fontSize:10, color:'#9CA3AF', padding:'3px 7px', borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontFamily:'JetBrains Mono' }}>
            Marker Pad
          </span>
        </div>
      </div>

      {/* Assigned TM or empty */}
      <div style={{
        background:'rgba(255,255,255,0.04)',
        border: tm ? '1px solid rgba(255,255,255,0.07)' : '1px dashed rgba(255,255,255,0.12)',
        borderRadius:14, padding:'10px 12px',
        display:'flex', alignItems:'center', gap:10,
      }}>
        {tm ? (
          <>
            <div style={{
              width:36, height:36, borderRadius:'50%',
              background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
              color:'#fff', fontSize:13, fontWeight:800,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'Inter Tight', letterSpacing:'-0.3px',
              boxShadow:'inset 0 1px 0 rgba(255,255,255,0.25)',
              flexShrink:0,
            }}>{tm.name.split(/[. ]/).filter(Boolean).map(s=>s[0]).join('').slice(0,2)}</div>
            <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0 }}>
              <span style={{ fontSize:14, fontWeight:800, color:'#F2F2F4', letterSpacing:'-0.2px' }}>{tm.full}</span>
              <span style={{ fontSize:10.5, color:'#9CA3AF', fontFamily:'JetBrains Mono' }}>{tm.hours} · {tm.pool} · 14 prior nights</span>
            </div>
            <button style={{
              fontSize:10.5, padding:'4px 9px', borderRadius:8,
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)',
              color:'#C7C7CC', fontWeight:600, cursor:'pointer',
            }}>Swap</button>
          </>
        ) : (
          <>
            <div style={{
              width:36, height:36, borderRadius:'50%',
              border:'1.5px dashed rgba(255,255,255,0.25)',
              color:'#6C6C72', fontSize:18, fontWeight:300,
              display:'flex', alignItems:'center', justifyContent:'center',
              flexShrink:0,
            }}>?</div>
            <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#9CA3AF', letterSpacing:'-0.1px' }}>Unassigned</span>
              <span style={{ fontSize:10.5, color:'#6C6C72', fontFamily:'JetBrains Mono' }}>tap a name in the roster →</span>
            </div>
          </>
        )}
      </div>

      {/* Break selector */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C6C72', textTransform:'uppercase' }}>Break Wave</span>
          <span style={{ fontSize:10, color: breakGroup ? '#E9B948' : '#6C6C72', fontWeight:600 }}>
            {breakGroup ? `Group ${breakGroup} · ${breakTime}` : 'Off the sheet'}
          </span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
          {[
            { l:'Off', v:0, sub:'no break' },
            { l:'1',   v:1, sub:'12:00a' },
            { l:'2',   v:2, sub:'1:30a'  },
            { l:'3',   v:3, sub:'3:00a'  },
          ].map(b => {
            const active = b.v === breakGroup;
            return (
              <button key={b.v}
                onClick={() => setBreak(b.v)}
                aria-pressed={b.v === breakGroup}
                aria-label={b.v === 0 ? 'No break' : `Break group ${b.v} at ${b.sub}`}
                style={{
                  padding:'8px 4px', borderRadius:12,
                  background: active ? `linear-gradient(180deg, ${accent}cc, ${accent}88)` : 'rgba(255,255,255,0.04)',
                  border: active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.07)',
                  boxShadow: active ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px ${accent}88` : 'none',
                  color: active ? '#fff' : '#9CA3AF',
                  display:'flex', flexDirection:'column', alignItems:'center', gap:1,
                  cursor:'pointer', transition:'all 0.15s',
                }}>
                <span style={{ fontSize: b.l==='Off' ? 14 : 18, fontWeight:800, fontFamily:'Bricolage Grotesque', letterSpacing:'-0.4px', lineHeight:1 }}>{b.l}</span>
                <span style={{ fontSize:8.5, color: active ? 'rgba(255,255,255,0.85)' : '#6C6C72', fontFamily:'JetBrains Mono', letterSpacing:'0.2px' }}>{b.sub}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TASKS */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1, minHeight:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C6C72', textTransform:'uppercase' }}>Tasks · {tasks.length}</span>
          <span style={{ fontSize:9.5, color:'#8E8E93' }}>Type · Enter to add · Tab to autocomplete</span>
        </div>

        {/* Existing tasks */}
        <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:120, overflowY:'auto' }} className="no-scrollbar">
          {tasks.map((t, idx) => (
            <div key={`${t}-${idx}`} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'7px 10px', borderRadius:10,
              background:'rgba(255,255,255,0.05)',
              border:'1px solid rgba(255,255,255,0.08)',
              animation:'sb-task-appear 0.28s cubic-bezier(0.16,1,0.3,1) both',
            }}>
              <span style={{ width:6, height:6, borderRadius:2, background: accent, boxShadow: `0 0 6px ${accent}88`, flexShrink:0 }} />
              <span style={{ fontSize:13, color:'#F2F2F4', fontWeight:600, letterSpacing:'-0.15px', flex:1 }}>{t}</span>
              <button onClick={() => removeTask(idx)} style={{
                fontSize:11, color:'#6C6C72', cursor:'pointer',
                padding:'2px 6px', borderRadius:6,
                background:'transparent',
              }}>×</button>
            </div>
          ))}
        </div>

        {/* Inline composer — always visible, always focused when slot selected */}
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'9px 12px', borderRadius:12,
          background:'rgba(255,255,255,0.05)',
          border: editing.field === 'task' ? `1px solid ${accent}99` : '1px solid rgba(255,255,255,0.10)',
          boxShadow: editing.field === 'task'
            ? `0 0 0 3px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.08)`
            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
          position:'relative',
        }}
          onClick={() => {
            setEditing({ slot: slotKey, field: 'task' });
            inputRef.current?.focus();
          }}>
          <span style={{ fontSize:11, color: accent, fontWeight:800, letterSpacing:'1px', fontFamily:'JetBrains Mono' }}>+</span>
          <div style={{ position:'relative', flex:1, minHeight:18 }}>
            {/* Ghost autocomplete */}
            {topSuggestion && taskDraft && (
              <span style={{
                position:'absolute', left:0, top:0,
                fontSize:14, color:'rgba(242,242,244,0.30)', letterSpacing:'-0.2px',
                pointerEvents:'none', whiteSpace:'pre',
              }}>
                <span style={{ visibility:'hidden' }}>{taskDraft}</span>
                {topSuggestion.slice(taskDraft.length)}
              </span>
            )}
            <input
              ref={inputRef}
              value={taskDraft}
              onChange={e => setTaskDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Add a task…"
              style={{
                background:'transparent', border:'none', outline:'none',
                color:'#F2F2F4', fontSize:14, fontWeight:600, letterSpacing:'-0.2px',
                width:'100%', minWidth:0, padding:0,
                fontFamily:'inherit', position:'relative', zIndex:1,
              }}
            />
          </div>
          {taskDraft ? (
            <span style={{ fontSize:9.5, color:'#E9B948', fontFamily:'JetBrains Mono', fontWeight:700 }}>↵</span>
          ) : (
            <span style={{ fontSize:9.5, color:'#6C6C72', fontFamily:'JetBrains Mono' }}>↵ add</span>
          )}
        </div>

        {/* Suggestion chips — one-tap insert */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:2 }}>
          <span style={{ fontSize:9.5, color:'#6C6C72', fontFamily:'JetBrains Mono', letterSpacing:'0.3px', padding:'3px 0 3px 4px' }}>
            {taskDraft ? 'match' : 'recent'}
          </span>
          {suggestions.length === 0 && (
            <span style={{ fontSize:10, color:'#6C6C72', padding:'4px 8px', fontStyle:'italic' }}>no recents match · press Enter to add as new</span>
          )}
          {suggestions.map(c => (
            <button key={c}
              onClick={() => {
                addTaskDirect(c);
                setTaskDraft('');
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              style={{
                fontSize:10.5, padding:'4px 8px', borderRadius:8,
                background:'rgba(184,151,8,0.10)',
                border:'1px solid rgba(184,151,8,0.25)',
                color:'#E9B948', fontWeight:600, letterSpacing:'-0.1px',
                fontFamily:'Atkinson Hyperlegible, Inter Tight',
                cursor:'pointer',
              }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display:'flex', gap:5, paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={toggleLock} style={{ ...padBtn(), color: assignment?.isLocked ? '#FF9F0A' : '#C7C7CC',
          background: assignment?.isLocked ? 'rgba(255,159,10,0.10)' : 'rgba(255,255,255,0.04)',
          border: assignment?.isLocked ? '1px solid rgba(255,159,10,0.30)' : '1px solid rgba(255,255,255,0.07)',
        }}>
          {assignment?.isLocked ? '🔒 Locked' : 'Lock'}
        </button>
        <button style={padBtn()}>Coverage</button>
        <button style={padBtn()}>Swap</button>
        <button onClick={clearSlot} style={{ ...padBtn(), background:'rgba(229,57,53,0.10)', border:'1px solid rgba(229,57,53,0.30)', color:'#FF6B65' }}>Clear</button>
      </div>
    </div>
  );
}

function padBtn() {
  return {
    flex:1, height:32, borderRadius:10,
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.07)',
    color:'#C7C7CC', fontSize:11, fontWeight:600, letterSpacing:'-0.1px',
    fontFamily: 'Inter Tight, system-ui',
    cursor:'pointer',
  };
}

Object.assign(window, { SbMarkerPad });
