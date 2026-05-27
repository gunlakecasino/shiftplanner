// Top bar: brand + day scrubber + draft + ⌘K + Grok + Publish
// Bottom dock: zoom · undo/redo · view switch · Ask Grok

function SbTopBar({ dayIdx, setDayIdx, draftMode, setDraftMode, openPalette, stats }) {
  return (
    <>
      <div style={{
        position:'absolute', top:14, left:14, right:14, height:56,
        borderRadius: 20,
        background: 'rgba(28,28,30,0.55)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: `
          inset 0 1px 0 0 rgba(255,255,255,0.14),
          inset 0 -1px 0 0 rgba(255,255,255,0.04),
          0 12px 32px -16px rgba(0,0,0,0.45)
        `,
        display:'flex', alignItems:'center', padding:'0 18px', gap:14,
        zIndex: 10,
        fontFamily: 'Inter Tight, system-ui',
      }}>
        {/* Logo + breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:34, height:34, borderRadius:10,
            background: 'linear-gradient(135deg, #2C2C2E, #1C1C1E)',
            border: '1px solid rgba(184,151,8,0.4)',
            boxShadow:'inset 0 1px 0 rgba(255,255,255,0.12), 0 0 0 1px rgba(0,0,0,0.4)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontFamily:'Bricolage Grotesque, system-ui', fontSize:18, fontWeight:900,
            color:'#B89708', letterSpacing:'-1px',
          }}>J</div>
          <div style={{ display:'flex', flexDirection:'column', lineHeight:1.1 }}>
            <span style={{ fontSize:12, fontWeight:700, letterSpacing:'-0.2px', color:'#F2F2F4' }}>Shift Builder · Grave</span>
            <span style={{ fontSize:10.5, fontWeight:500, color:'#9CA3AF', letterSpacing:'0.2px' }}>GLCR · Internal Maintenance · Brian C.</span>
          </div>
        </div>

        <span style={{ width:1, height:28, background:'rgba(255,255,255,0.08)' }} />

        {/* Day scrubber — actually interactive */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {SB_TOKENS.dayShort.map((d, i) => {
            const active = i === dayIdx;
            const c = SB_TOKENS.dayColor[i];
            return (
              <button key={i}
                onClick={() => setDayIdx(i)}
                style={{
                  width: active ? 76 : 32, height: 34, borderRadius: 17,
                  display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                  background: active ? `linear-gradient(180deg, ${c}, ${c}cc)` : 'rgba(255,255,255,0.04)',
                  border: active ? `1px solid ${c}` : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: active ? `0 4px 12px -4px ${c}, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
                  color: active ? '#fff' : '#9CA3AF',
                  fontFamily: 'Atkinson Hyperlegible, Inter Tight, system-ui',
                  fontSize: active ? 12.5 : 12, fontWeight: 800,
                  letterSpacing: active ? '0.5px' : '-0.2px',
                  cursor:'pointer', transition:'all 0.18s cubic-bezier(0.2,0.7,0.2,1)',
                }}>
                {active ? (
                  <>
                    <span style={{ fontFamily:'Bricolage Grotesque', fontSize:18, fontWeight:900, letterSpacing:'-1px' }}>{i === 0 ? 28 : i}</span>
                    <span style={{ textTransform:'uppercase' }}>{SB_TOKENS.dayLong[i].slice(0,3)}</span>
                  </>
                ) : d}
              </button>
            );
          })}
        </div>

        <span style={{ flex:1 }} />

        {/* Stats pill */}
        <div style={{
          height:34, padding:'0 12px', borderRadius:17,
          background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)',
          display:'inline-flex', alignItems:'center', gap:8,
          fontSize:11.5, color:'#C7C7CC', fontWeight:600,
          fontFamily:'JetBrains Mono, monospace',
        }}>
          <span style={{ color:'#9CA3AF' }}>PLACED</span>
          <span style={{ color:'#F2F2F4', fontWeight:800 }}>{stats.placed}<span style={{ color:'#6C6C72' }}>/{stats.total}</span></span>
        </div>

        {/* Draft toggle */}
        <button onClick={() => setDraftMode(d => !d)} style={{
          height:34, padding:'0 14px', borderRadius:17,
          background: draftMode ? 'rgba(184,151,8,0.18)' : 'rgba(255,255,255,0.04)',
          border: draftMode ? '1px solid rgba(184,151,8,0.45)' : '1px solid rgba(255,255,255,0.08)',
          color: draftMode ? '#E9B948' : '#9CA3AF',
          fontSize:12, fontWeight:700, letterSpacing:'-0.1px',
          display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer',
          transition:'all 0.18s',
        }}>
          <span style={{
            width:6, height:6, borderRadius:'50%',
            background: draftMode ? '#E9B948' : '#6C6C72',
            boxShadow: draftMode ? '0 0 8px #E9B94888' : 'none',
          }} />
          {draftMode ? 'Draft · 3 staged' : 'Live'}
        </button>

        {/* ⌘K */}
        <button onClick={openPalette} style={{
          height:34, padding:'0 8px 0 14px', borderRadius:17,
          background:'rgba(255,255,255,0.05)',
          border:'1px solid rgba(255,255,255,0.10)',
          color:'#C7C7CC', fontSize:12, fontWeight:500,
          display:'inline-flex', alignItems:'center', gap:8, cursor:'pointer',
        }}>
          <span>Search · Assign · Command</span>
          <span style={{
            display:'inline-flex', gap:2, alignItems:'center',
            padding:'2px 6px', borderRadius:6,
            background:'rgba(255,255,255,0.06)',
            fontFamily:'JetBrains Mono, monospace', fontSize:10.5, fontWeight:600,
          }}>⌘K</span>
        </button>

        {/* Grok orb */}
        <button style={{
          width:34, height:34, borderRadius:'50%',
          background: 'radial-gradient(circle at 30% 30%, #C39DFF, #6B3FE0 60%, #2A1854)',
          boxShadow:'inset 0 1px 2px rgba(255,255,255,0.4), 0 0 16px -2px #6B3FE066, 0 0 0 1px rgba(195,157,255,0.3)',
          position:'relative', cursor:'pointer',
        }}>
          <span style={{ position:'absolute', top:6, left:8, width:8, height:6, borderRadius:'50%', background:'rgba(255,255,255,0.6)', filter:'blur(1px)' }} />
        </button>

        {/* Publish */}
        <button style={{
          height:34, padding:'0 18px', borderRadius:17,
          background: 'linear-gradient(180deg, #D4A547, #B89708)',
          border:'1px solid rgba(184,151,8,0.6)',
          color:'#1A1208', fontSize:12.5, fontWeight:800, letterSpacing:'-0.1px',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px -4px #B8970866',
          cursor:'pointer',
        }}>
          Publish PDF →
        </button>
      </div>

      {/* Brushed-gold hairline below top bar */}
      <div style={{
        position:'absolute', top:75, left:60, right:60, height:1,
        background:'linear-gradient(to right, transparent, rgba(184,151,8,0.5) 20%, rgba(184,151,8,0.5) 80%, transparent)',
        zIndex: 4, pointerEvents:'none',
      }} />
    </>
  );
}

function SbBottomDock({ view, setView, zoom, setZoom, canUndo, canRedo, undo, redo, openPalette, rosterOpen, onToggleRoster, markerOpen, onToggleMarker }) {
  return (
    <div style={{
      position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
      height: 52, borderRadius: 18,
      background: 'rgba(28,28,30,0.6)',
      backdropFilter: 'blur(40px) saturate(180%)',
      WebkitBackdropFilter: 'blur(40px) saturate(180%)',
      border: '1px solid rgba(255,255,255,0.10)',
      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), 0 16px 40px -16px rgba(0,0,0,0.55)`,
      display:'flex', alignItems:'center', padding:'0 8px', gap:6,
      zIndex: 10, fontFamily:'Inter Tight, system-ui',
    }}>
      {/* Rail toggles — left */}
      <button onClick={onToggleRoster} title={rosterOpen ? 'Collapse roster' : 'Open roster'} style={{
        ...dockBtn(), padding:'0 10px', minWidth:36,
        background: rosterOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        color: rosterOpen ? '#C7C7CC' : '#6C6C72',
        transition:'all 0.18s cubic-bezier(0.16,1,0.3,1)',
      }}>{rosterOpen ? '⊣' : '⊢'}</button>

      <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 2px' }} />

      <button onClick={() => setZoom(Math.max(70, zoom - 10))} style={dockBtn(36)}>−</button>
      <button onClick={() => setZoom(100)} style={{ ...dockBtn(64), fontFamily:'JetBrains Mono, monospace' }}>{zoom}%</button>
      <button onClick={() => setZoom(Math.min(140, zoom + 10))} style={dockBtn(36)}>+</button>

      <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />

      <button onClick={undo} disabled={!canUndo} style={{ ...dockBtn(), opacity: canUndo ? 1 : 0.4 }}>↶ Undo</button>
      <button onClick={redo} disabled={!canRedo} style={{ ...dockBtn(), opacity: canRedo ? 1 : 0.4 }}>Redo ↷</button>

      <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />

      {['Deployment','Breaks','Tasks'].map(v => {
        const active = v === view;
        return (
          <button key={v} onClick={() => setView(v)} style={{
            ...dockBtn(),
            background: active ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
            color: active ? '#fff' : '#9CA3AF',
            fontWeight: active ? 700 : 500,
            boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.12)' : 'none',
            transition:'all 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}>{v}</button>
        );
      })}

      <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 2px' }} />

      {/* Rail toggle — right */}
      <button onClick={onToggleMarker} title={markerOpen ? 'Collapse inspector' : 'Open inspector'} style={{
        ...dockBtn(), padding:'0 10px', minWidth:36,
        background: markerOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        color: markerOpen ? '#C7C7CC' : '#6C6C72',
        transition:'all 0.18s cubic-bezier(0.16,1,0.3,1)',
      }}>{markerOpen ? '⊢' : '⊣'}</button>

      <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />

      <button onClick={openPalette} style={{
        height:36, padding:'0 14px', borderRadius:12,
        background:'linear-gradient(180deg, rgba(107,63,224,0.25), rgba(107,63,224,0.15))',
        border:'1px solid rgba(195,157,255,0.35)',
        color:'#C39DFF', fontSize:12, fontWeight:700, letterSpacing:'-0.1px',
        display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer',
      }}>
        <span style={{ fontFamily:'Bricolage Grotesque', fontSize:14 }}>✦</span>
        Ask Grok
      </button>
    </div>
  );
}

function dockBtn(minW) {
  return {
    minWidth: minW || 'auto',
    height: 36, padding: '0 14px', borderRadius: 12,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: '#C7C7CC', fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.1px',
    fontFamily: 'Inter Tight, system-ui',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };
}

Object.assign(window, { SbTopBar, SbBottomDock });
