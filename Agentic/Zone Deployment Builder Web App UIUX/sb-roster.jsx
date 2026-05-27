// Interactive Roster Rail.
// Click a name → it becomes "staged" (held). Click a card on the sheet to drop it.
// Or click "→ Assign to {selectedKey}" to send it to the currently selected slot.

function SbRosterRail({ assignments, stagedTm, setStagedTm, selectedKey, onAssignToSelected, open, onToggle }) {
  const { useState, useMemo } = React;
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');

  // Compute placement map
  const placement = useMemo(() => {
    const m = {};
    Object.entries(assignments).forEach(([slot, a]) => {
      if (a?.tmId) m[a.tmId] = slot;
    });
    return m;
  }, [assignments]);

  const filtered = useMemo(() => {
    return SB_ROSTER.filter(tm => {
      if (filter === 'Full' && tm.pool !== 'Full') return false;
      if (filter === 'PM' && tm.pool !== 'PM') return false;
      if (filter === 'AM' && tm.pool !== 'AM') return false;
      if (filter === 'Open') {
        if (placement[tm.id]) return false;
      }
      if (query && !tm.name.toLowerCase().includes(query.toLowerCase()) && !tm.full.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [filter, query, placement]);

  const unplaced = filtered.filter(tm => !placement[tm.id]);
  const placed = filtered.filter(tm => !!placement[tm.id]);

  const counts = {
    All: SB_ROSTER.length,
    Full: SB_ROSTER.filter(t => t.pool === 'Full').length,
    PM: SB_ROSTER.filter(t => t.pool === 'PM').length,
    AM: SB_ROSTER.filter(t => t.pool === 'AM').length,
    Open: SB_ROSTER.filter(t => !placement[t.id]).length,
  };

  const stagedObj = stagedTm ? SB_ROSTER.find(r => r.id === stagedTm) : null;

  return (
    <div style={{
      position:'absolute', top:88, left:14, width:228, bottom:78,
      borderRadius: 22,
      background: 'rgba(28,28,30,0.55)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 40px -20px rgba(0,0,0,0.5)`,
      padding:'14px 12px 12px',
      display:'flex', flexDirection:'column', gap:10,
      zIndex: 8,
      overflow:'hidden',
      fontFamily:'Inter Tight, system-ui',
      /* Slide + fade */
      transform: open ? 'translateX(0) scaleX(1)' : 'translateX(-110%) scaleX(0.92)',
      transformOrigin: 'left center',
      opacity: open ? 1 : 0,
      pointerEvents: open ? 'auto' : 'none',
      transition: open
        ? 'transform 0.42s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease'
        : 'transform 0.34s cubic-bezier(0.4,0,1,1), opacity 0.22s ease',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'0 4px' }}>
        <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:'1.6px', color:'#C7C7CC', textTransform:'uppercase' }}>Roster</span>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', fontFamily:'JetBrains Mono, monospace' }}>{counts.All - counts.Open} / {counts.All}</span>
          <button onClick={onToggle} aria-label="Collapse roster" style={{
            width:22, height:22, borderRadius:7,
            background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,0.08)',
            color:'#6C6C72', fontSize:12, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', transition:'all 0.15s',
          }}>‹</button>
        </div>
      </div>

      {/* Search */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'8px 12px', borderRadius:12,
        background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.06)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Search names…"
          style={{
            background:'transparent', border:'none', outline:'none', flex:1, minWidth:0,
            fontSize:12.5, color:'#F2F2F4', letterSpacing:'-0.1px',
            fontFamily:'inherit',
          }}
        />
      </div>

      {/* Filter chips */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
        {[
          { l:'All', k:'All' },
          { l:'Full', k:'Full' },
          { l:'PM', k:'PM' },
          { l:'AM', k:'AM' },
          { l:'Open', k:'Open', warn: true },
        ].map(c => {
          const active = filter === c.k;
          return (
            <button key={c.k} onClick={() => setFilter(c.k)} style={{
              fontSize:10.5, padding:'4px 9px', borderRadius:10,
              background: active ? 'rgba(255,255,255,0.12)' : c.warn ? 'rgba(229,57,53,0.10)' : 'rgba(255,255,255,0.03)',
              border: active ? '1px solid rgba(255,255,255,0.20)' : c.warn ? '1px solid rgba(229,57,53,0.25)' : '1px solid rgba(255,255,255,0.06)',
              color: active ? '#F2F2F4' : c.warn ? '#FF6B65' : '#9CA3AF',
              fontWeight: active ? 700 : 500, letterSpacing:'-0.1px',
              fontFamily:'JetBrains Mono, monospace', cursor:'pointer',
            }}>{c.l} · {counts[c.k]}</button>
          );
        })}
      </div>

      {/* Staged-TM banner */}
      {stagedObj && (
        <div style={{
          padding:'10px 12px', borderRadius:12,
          background:'linear-gradient(180deg, rgba(184,151,8,0.18), rgba(184,151,8,0.10))',
          border:'1px solid rgba(184,151,8,0.45)',
          boxShadow:'0 6px 16px -8px rgba(184,151,8,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
          display:'flex', flexDirection:'column', gap:6,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:9.5, color:'#E9B948', fontWeight:800, letterSpacing:'1.4px' }}>HOLDING</span>
            <span style={{ fontSize:12.5, color:'#fff', fontWeight:800, letterSpacing:'-0.2px' }}>{stagedObj.name}</span>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            <button onClick={() => onAssignToSelected(stagedObj)} style={{
              flex:1, height:28, borderRadius:8,
              background:'linear-gradient(180deg, #D4A547, #B89708)',
              color:'#1A1208', border:'1px solid rgba(184,151,8,0.6)',
              fontSize:11, fontWeight:800, letterSpacing:'-0.1px',
              boxShadow:'inset 0 1px 0 rgba(255,255,255,0.4)', cursor:'pointer',
            }}>→ Drop on {selectedKey}</button>
            <button onClick={() => setStagedTm(null)} style={{
              height:28, padding:'0 10px', borderRadius:8,
              background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)',
              color:'#C7C7CC', fontSize:11, fontWeight:600, cursor:'pointer',
            }}>Esc</button>
          </div>
          <span style={{ fontSize:9.5, color:'rgba(233,185,72,0.85)', textAlign:'center' }}>or tap any slot on the sheet</span>
        </div>
      )}

      {/* Lists */}
      <div className="no-scrollbar" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:4 }}>
        {unplaced.length > 0 && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 4px 0' }}>
              <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1px', color:'#6C6C72', textTransform:'uppercase' }}>Unplaced · {unplaced.length}</span>
              <button style={{ fontSize:9.5, color:'#E9B948', fontWeight:600, cursor:'pointer' }}>Auto-fill ▸</button>
            </div>
            {unplaced.map(tm => (
              <RosterChip key={tm.id} tm={tm} staged={stagedTm === tm.id}
                onClick={() => setStagedTm(stagedTm === tm.id ? null : tm.id)} />
            ))}
          </>
        )}

        {placed.length > 0 && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 4px 0' }}>
              <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1px', color:'#6C6C72', textTransform:'uppercase' }}>Placed · {placed.length}</span>
            </div>
            {placed.map(tm => (
              <RosterChip key={tm.id} tm={tm} slot={placement[tm.id]} placed
                onClick={() => setStagedTm(stagedTm === tm.id ? null : tm.id)} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function RosterChip({ tm, slot, placed, staged, onClick }) {
  const initials = tm.name.split(/[. ]/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase();
  const poolColor = tm.pool === 'AM' ? '#43A047' : tm.pool === 'PM' ? '#FB8C00' : '#9CA3AF';
  return (
    <button onClick={onClick} style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'6px 8px', borderRadius:11,
      background: staged ? 'rgba(184,151,8,0.22)' : placed ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)',
      border: staged ? '1px solid rgba(184,151,8,0.55)' : '1px solid rgba(255,255,255,0.06)',
      boxShadow: staged ? '0 8px 16px -8px rgba(184,151,8,0.45)' : 'none',
      transform: staged ? 'translateY(-1px) scale(1.015)' : 'none',
      cursor: 'pointer',
      transition: 'all 0.15s',
      width:'100%', textAlign:'left',
      opacity: placed && !staged ? 0.78 : 1,
    }}>
      <div style={{
        width:24, height:24, borderRadius:'50%',
        background:'linear-gradient(135deg, #3A3A3C, #1C1C1E)',
        border:'1px solid rgba(255,255,255,0.10)',
        color:'#E5E5E7', fontSize:9.5, fontWeight:800, letterSpacing:'-0.3px',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'Inter Tight, system-ui',
        position:'relative', flexShrink:0,
      }}>
        {initials}
        {tm.pool !== 'Full' && (
          <span style={{
            position:'absolute', bottom:-2, right:-2,
            width:8, height:8, borderRadius:4,
            background: poolColor,
            border:'1px solid #1C1C1E',
          }} />
        )}
      </div>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, lineHeight:1.15 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#F2F2F4', letterSpacing:'-0.2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tm.name}</span>
        <span style={{ fontSize:9.5, color:'#8E8E93', fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.1px' }}>{tm.hours} · {tm.pool}</span>
      </div>
      {placed && !staged && (
        <span style={{
          fontSize:9, fontFamily:'JetBrains Mono', fontWeight:700,
          padding:'2px 5px', borderRadius:5,
          background:'rgba(255,255,255,0.06)', color:'#C7C7CC',
        }}>{slot}</span>
      )}
      {staged && (
        <span style={{ fontSize:9, color:'#E9B948', fontWeight:800, letterSpacing:'0.4px' }}>HOLD</span>
      )}
    </button>
  );
}

Object.assign(window, { SbRosterRail });
