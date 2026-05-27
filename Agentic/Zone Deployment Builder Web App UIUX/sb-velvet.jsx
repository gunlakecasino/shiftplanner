// === Variant A · "Velvet" — Premium Casino Glass ===
// Dark velvet substrate, Cupertino liquid-glass chrome with brushed-gold
// hairlines, paper sheet centered, floating Marker Pad solves task entry.
//
// Sized for iPad Pro 12.9" landscape: 1366 × 1024.

const SbVelvetArtboard = () => {
  const { useState } = React;
  // Z5 is selected — has multiple tasks, good for showing the marker pad
  const selectedKey = 'Z5';
  const selectedAssign = SB_ASSIGNMENTS[selectedKey];

  return (
    <div style={{
      width: 1366, height: 1024,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter Tight, Inter, system-ui',
      // Velvet substrate
      background: `
        radial-gradient(ellipse 70% 60% at 50% 0%, rgba(80,40,30,0.18), transparent 70%),
        radial-gradient(ellipse 60% 80% at 100% 100%, rgba(184,151,8,0.06), transparent 70%),
        radial-gradient(ellipse 60% 80% at 0% 100%, rgba(120,30,40,0.08), transparent 70%),
        linear-gradient(180deg, #0F0E10 0%, #08070A 100%)
      `,
      color: '#F2F2F4',
    }}>
      {/* Velvet noise texture (subtle) */}
      <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.05, mixBlendMode:'overlay', pointerEvents:'none' }}>
        <filter id="velvet-noise"><feTurbulence type="fractalNoise" baseFrequency="0.9" /></filter>
        <rect width="100%" height="100%" filter="url(#velvet-noise)" />
      </svg>

      {/* ── PAPER SHEET, centered ── */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '50%',
        transform: 'translate(-50%, -50%) scale(0.835)',
        transformOrigin: 'center center',
        filter: 'drop-shadow(0 50px 100px rgba(0,0,0,0.55)) drop-shadow(0 0 1px rgba(255,255,255,0.08))',
      }}>
        <DeploymentSheet selectedKey={selectedKey} dayIdx={5} dateNum={5} />
      </div>

      {/* ── TOP BAR — liquid glass ── */}
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
        zIndex: 5,
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

        {/* Divider */}
        <span style={{ width:1, height:28, background:'rgba(255,255,255,0.08)' }} />

        {/* Day scrubber */}
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {SB_TOKENS.dayShort.map((d, i) => {
            const active = i === 5;
            const c = SB_TOKENS.dayColor[i];
            return (
              <button key={i} style={{
                width: active ? 76 : 32, height: 34, borderRadius: 17,
                display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6,
                background: active ? `linear-gradient(180deg, ${c}, ${c}cc)` : 'rgba(255,255,255,0.04)',
                border: active ? `1px solid ${c}` : '1px solid rgba(255,255,255,0.06)',
                boxShadow: active ? `0 4px 12px -4px ${c}, inset 0 1px 0 rgba(255,255,255,0.2)` : 'none',
                color: active ? '#fff' : '#9CA3AF',
                fontFamily: 'var(--font-atkinson), Inter Tight, system-ui',
                fontSize: active ? 12.5 : 12, fontWeight: 800, letterSpacing: active ? '0.5px' : '-0.2px',
                cursor:'pointer', transition:'all 0.2s',
              }}>
                {active ? (
                  <>
                    <span style={{ fontFamily:'Bricolage Grotesque', fontSize:18, fontWeight:900, letterSpacing:'-1px' }}>5</span>
                    <span style={{ textTransform:'uppercase' }}>{SB_TOKENS.dayLong[i].slice(0,3)}</span>
                  </>
                ) : d}
              </button>
            );
          })}
        </div>

        <span style={{ flex:1 }} />

        {/* Draft toggle */}
        <button style={{
          height:34, padding:'0 14px', borderRadius:17,
          background:'rgba(184,151,8,0.18)',
          border:'1px solid rgba(184,151,8,0.45)',
          color:'#E9B948', fontSize:12, fontWeight:700, letterSpacing:'-0.1px',
          display:'inline-flex', alignItems:'center', gap:6,
          fontFamily: 'Inter Tight, system-ui',
        }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'#E9B948', boxShadow:'0 0 8px #E9B94888' }} />
          Draft · 3 staged
        </button>

        {/* ⌘K hint */}
        <button style={{
          height:34, padding:'0 8px 0 14px', borderRadius:17,
          background:'rgba(255,255,255,0.05)',
          border:'1px solid rgba(255,255,255,0.10)',
          color:'#C7C7CC', fontSize:12, fontWeight:500,
          display:'inline-flex', alignItems:'center', gap:8,
          fontFamily: 'Inter Tight, system-ui',
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
        <div style={{
          width:34, height:34, borderRadius:'50%',
          background: 'radial-gradient(circle at 30% 30%, #C39DFF, #6B3FE0 60%, #2A1854)',
          boxShadow:'inset 0 1px 2px rgba(255,255,255,0.4), 0 0 16px -2px #6B3FE066, 0 0 0 1px rgba(195,157,255,0.3)',
          position:'relative',
        }}>
          <span style={{ position:'absolute', top:6, left:8, width:8, height:6, borderRadius:'50%', background:'rgba(255,255,255,0.6)', filter:'blur(1px)' }} />
        </div>

        {/* Publish */}
        <button style={{
          height:34, padding:'0 18px', borderRadius:17,
          background: 'linear-gradient(180deg, #D4A547, #B89708)',
          border:'1px solid rgba(184,151,8,0.6)',
          color:'#1A1208', fontSize:12.5, fontWeight:800, letterSpacing:'-0.1px',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.4), 0 4px 12px -4px #B8970866',
          fontFamily: 'Inter Tight, system-ui',
        }}>
          Publish PDF →
        </button>
      </div>

      {/* Brushed-gold hairline below top bar */}
      <div style={{
        position:'absolute', top:75, left:60, right:60, height:1,
        background:'linear-gradient(to right, transparent, rgba(184,151,8,0.5) 20%, rgba(184,151,8,0.5) 80%, transparent)',
        zIndex: 4,
      }} />

      {/* ── ROSTER RAIL — floating left ── */}
      <RosterRail />

      {/* ── MARKER PAD — floating right (the novel task-entry surface) ── */}
      <MarkerPad slotKey={selectedKey} assign={selectedAssign} />

      {/* ── BOTTOM DOCK ── */}
      <div style={{
        position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
        height: 52,
        borderRadius: 18,
        background: 'rgba(28,28,30,0.6)',
        backdropFilter: 'blur(40px) saturate(180%)',
        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.14),
          0 16px 40px -16px rgba(0,0,0,0.55)
        `,
        display:'flex', alignItems:'center', padding:'0 8px', gap:6,
        zIndex: 5,
      }}>
        {/* Zoom */}
        {['−','100%','+'].map((s, i) => (
          <button key={i} style={{
            minWidth: i===1 ? 60 : 36, height:36, borderRadius:12,
            background: 'rgba(255,255,255,0.04)',
            border:'1px solid rgba(255,255,255,0.06)',
            color:'#C7C7CC', fontSize:13, fontWeight:600,
            fontFamily: 'JetBrains Mono, monospace',
          }}>{s}</button>
        ))}
        <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />
        {/* Undo/redo */}
        <button style={dockBtnStyle()}>↶ Undo</button>
        <button style={dockBtnStyle()}>Redo ↷</button>
        <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />
        {/* View switch */}
        {['Deployment', 'Breaks', 'Tasks'].map((v, i) => (
          <button key={v} style={{
            ...dockBtnStyle(),
            background: i===0 ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
            color: i===0 ? '#fff' : '#9CA3AF',
            fontWeight: i===0 ? 700 : 500,
          }}>{v}</button>
        ))}
        <span style={{ width:1, height:24, background:'rgba(255,255,255,0.08)', margin:'0 6px' }} />
        {/* Grok command */}
        <button style={{
          height:36, padding:'0 14px', borderRadius:12,
          background:'linear-gradient(180deg, rgba(107,63,224,0.25), rgba(107,63,224,0.15))',
          border:'1px solid rgba(195,157,255,0.35)',
          color:'#C39DFF', fontSize:12, fontWeight:700, letterSpacing:'-0.1px',
          display:'inline-flex', alignItems:'center', gap:6,
        }}>
          <span style={{ fontFamily:'Bricolage Grotesque', fontSize:14 }}>✦</span>
          Ask Grok
        </button>
      </div>
    </div>
  );
};

function dockBtnStyle() {
  return {
    height:36, padding:'0 14px', borderRadius:12,
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.06)',
    color:'#C7C7CC', fontSize:12.5, fontWeight:600, letterSpacing:'-0.1px',
    fontFamily: 'Inter Tight, system-ui',
    cursor:'pointer',
  };
}

// === ROSTER RAIL ===
function RosterRail() {
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
      zIndex: 4,
      overflow:'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'0 4px' }}>
        <span style={{ fontSize:10.5, fontWeight:800, letterSpacing:'1.6px', color:'#C7C7CC', textTransform:'uppercase' }}>Roster</span>
        <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', fontFamily:'JetBrains Mono, monospace' }}>28 / 32</span>
      </div>

      {/* Search */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        padding:'8px 12px', borderRadius:12,
        background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.06)',
      }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <span style={{ fontSize:12.5, color:'#9CA3AF', letterSpacing:'-0.1px' }}>Search names…</span>
      </div>

      {/* Filter chips */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
        {[
          {l:'All · 32', a:true},
          {l:'Full · 22'},
          {l:'PM · 4'},
          {l:'AM · 6'},
          {l:'Open · 4', warn:true},
        ].map((c, i) => (
          <span key={i} style={{
            fontSize:10.5, padding:'4px 9px', borderRadius:10,
            background: c.a ? 'rgba(255,255,255,0.12)' : c.warn ? 'rgba(229,57,53,0.14)' : 'rgba(255,255,255,0.03)',
            border: c.a ? '1px solid rgba(255,255,255,0.16)' : c.warn ? '1px solid rgba(229,57,53,0.3)' : '1px solid rgba(255,255,255,0.06)',
            color: c.a ? '#F2F2F4' : c.warn ? '#FF6B65' : '#9CA3AF',
            fontWeight: c.a ? 700 : 500, letterSpacing:'-0.1px',
            fontFamily:'JetBrains Mono, monospace',
          }}>{c.l}</span>
        ))}
      </div>

      {/* Section header */}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 4px 0', marginTop:2 }}>
        <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1px', color:'#6C6C72', textTransform:'uppercase' }}>Unplaced · 4</span>
        <span style={{ fontSize:9.5, color:'#E9B948', fontWeight:600 }}>Auto-fill ▸</span>
      </div>

      {/* Unplaced chips — drag affordance */}
      <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
        {[
          { name:'O. Rasheed',  hours:'3a–9a', tier:'AM',  color:'#43A047' },
          { name:'K. Albright', hours:'3a–9a', tier:'AM',  color:'#43A047' },
          { name:'J. Boyko',    hours:'3a–9a', tier:'AM',  color:'#43A047' },
          { name:'M. Pinheiro', hours:'3a–9a', tier:'AM',  color:'#43A047' },
        ].map((p, i) => (
          <RosterChip key={p.name} {...p} dragging={i===0} />
        ))}
      </div>

      {/* Placed section */}
      <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 4px 0' }}>
        <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1px', color:'#6C6C72', textTransform:'uppercase' }}>Placed · 24</span>
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:4, opacity:0.7 }}>
        {[
          { name:'B. Calloway', hours:'11p–7a', tier:'Full', color:'#9CA3AF', slot:'Z1' },
          { name:'M. Joiner',   hours:'11p–7a', tier:'Full', color:'#9CA3AF', slot:'Z2' },
          { name:'T. Whitfield',hours:'11p–7a', tier:'Full', color:'#9CA3AF', slot:'Z7' },
          { name:'D. Rourke',   hours:'11p–7a', tier:'Full', color:'#9CA3AF', slot:'Z8' },
          { name:'A. Pacheco',  hours:'11p–7a', tier:'Full', color:'#9CA3AF', slot:'Z3' },
        ].map(p => (
          <RosterChip key={p.name} {...p} placed />
        ))}
        <div style={{ fontSize:10, color:'#6C6C72', textAlign:'center', padding:'2px 0' }}>+ 19 more…</div>
      </div>
    </div>
  );
}

function RosterChip({ name, hours, tier, color, slot, placed, dragging }) {
  const initials = name.split(/[. ]/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase();
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'6px 8px', borderRadius:11,
      background: dragging ? 'rgba(184,151,8,0.16)' : placed ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.05)',
      border: dragging ? '1px solid rgba(184,151,8,0.5)' : '1px solid rgba(255,255,255,0.06)',
      boxShadow: dragging ? '0 8px 16px -8px rgba(184,151,8,0.45)' : 'none',
      transform: dragging ? 'translateY(-1px) scale(1.015)' : 'none',
      cursor: 'grab',
      transition: 'all 0.15s',
    }}>
      <div style={{
        width:24, height:24, borderRadius:'50%',
        background:'linear-gradient(135deg, #3A3A3C, #1C1C1E)',
        border:'1px solid rgba(255,255,255,0.10)',
        color:'#E5E5E7', fontSize:9.5, fontWeight:800, letterSpacing:'-0.3px',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'Inter Tight, system-ui',
      }}>{initials}</div>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, lineHeight:1.15 }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#F2F2F4', letterSpacing:'-0.2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
        <span style={{ fontSize:9.5, color:'#8E8E93', fontFamily:'JetBrains Mono, monospace', letterSpacing:'0.1px' }}>{hours} · {tier}</span>
      </div>
      {placed && (
        <span style={{
          fontSize:9, fontFamily:'JetBrains Mono', fontWeight:700,
          padding:'2px 5px', borderRadius:5,
          background:'rgba(255,255,255,0.06)', color:'#C7C7CC',
        }}>{slot}</span>
      )}
      {dragging && (
        <span style={{ fontSize:9, color:'#E9B948', fontWeight:700, letterSpacing:'0.4px' }}>DRAG</span>
      )}
    </div>
  );
}

// === MARKER PAD — the novel task-entry surface ===
function MarkerPad({ slotKey, assign }) {
  const accent = SB_TOKENS.zoneColor[slotKey] || '#6B7280';
  const icon = SB_TOKENS.zoneIcon[slotKey] || '●';
  const zoneDef = SB_ZONES.find(z => z.key === slotKey);
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
      zIndex: 4,
      overflow:'hidden',
    }}>
      {/* Accent rail at left edge */}
      <div style={{
        position:'absolute', top:18, left:-1, width:3, height:48,
        borderRadius:'0 3px 3px 0',
        background: accent,
        boxShadow: `0 0 16px ${accent}88`,
      }} />

      {/* Identity */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <span style={{ fontSize:24, color:accent, lineHeight:1 }}>{icon}</span>
            <span style={{
              fontSize:11, fontWeight:800, letterSpacing:'1.6px', color: accent,
              fontFamily:'var(--font-atkinson), Inter Tight',
            }}>{zoneDef?.label}</span>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:'#F2F2F4', letterSpacing:'-0.4px', fontFamily:'Bricolage Grotesque, Inter Tight' }}>
            {zoneDef?.loc}
          </div>
          <div style={{ fontSize:10.5, color:'#8E8E93', fontFamily:'JetBrains Mono, monospace', marginTop:2 }}>
            slot · {slotKey}
          </div>
        </div>
        <span style={{ fontSize:10, color:'#9CA3AF', padding:'3px 7px', borderRadius:7, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontFamily:'JetBrains Mono' }}>
          Marker Pad
        </span>
      </div>

      {/* Assigned TM */}
      <div style={{
        background:'rgba(255,255,255,0.04)',
        border:'1px solid rgba(255,255,255,0.07)',
        borderRadius:14, padding:'10px 12px',
        display:'flex', alignItems:'center', gap:10,
      }}>
        <div style={{
          width:36, height:36, borderRadius:'50%',
          background: `linear-gradient(135deg, ${accent}, ${accent}88)`,
          color:'#fff', fontSize:13, fontWeight:800,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontFamily:'Inter Tight', letterSpacing:'-0.3px',
          boxShadow:'inset 0 1px 0 rgba(255,255,255,0.25)',
        }}>TG</div>
        <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0 }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#F2F2F4', letterSpacing:'-0.2px' }}>Tomás Guevara</span>
          <span style={{ fontSize:10.5, color:'#9CA3AF', fontFamily:'JetBrains Mono' }}>11p–7a · Full · 14 prior nights</span>
        </div>
        <button style={{
          fontSize:10.5, padding:'4px 9px', borderRadius:8,
          background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.10)',
          color:'#C7C7CC', fontWeight:600,
        }}>Change</button>
      </div>

      {/* Break selector — large, 4 dots, tappable with Pencil */}
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
          <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C6C72', textTransform:'uppercase' }}>Break Wave</span>
          <span style={{ fontSize:10, color:'#E9B948', fontWeight:600 }}>Group 2 · 1:30a</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
          {[
            { l:'Off', v:0, sub:'no break' },
            { l:'1',   v:1, sub:'12:00a' },
            { l:'2',   v:2, sub:'1:30a', active:true },
            { l:'3',   v:3, sub:'3:00a' },
          ].map(b => (
            <button key={b.v} style={{
              padding:'8px 4px', borderRadius:12,
              background: b.active ? `linear-gradient(180deg, ${accent}cc, ${accent}88)` : 'rgba(255,255,255,0.04)',
              border: b.active ? `1px solid ${accent}` : '1px solid rgba(255,255,255,0.07)',
              boxShadow: b.active ? `inset 0 1px 0 rgba(255,255,255,0.25), 0 4px 10px -4px ${accent}88` : 'none',
              color: b.active ? '#fff' : '#9CA3AF',
              display:'flex', flexDirection:'column', alignItems:'center', gap:1,
            }}>
              <span style={{ fontSize: b.l==='Off' ? 14 : 18, fontWeight:800, fontFamily:'Bricolage Grotesque', letterSpacing:'-0.4px', lineHeight:1 }}>{b.l}</span>
              <span style={{ fontSize:8.5, color: b.active ? 'rgba(255,255,255,0.85)' : '#6C6C72', fontFamily:'JetBrains Mono', letterSpacing:'0.2px' }}>{b.sub}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TASKS — the pain-point killer */}
      <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1, minHeight:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C6C72', textTransform:'uppercase' }}>Tasks · 2</span>
          <span style={{ fontSize:9.5, color:'#8E8E93' }}>Type to add · tap chip to recall</span>
        </div>

        {/* Active tasks */}
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {(assign?.tasks || []).map(t => (
            <div key={t} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'7px 10px', borderRadius:10,
              background:'rgba(255,255,255,0.05)',
              border:'1px solid rgba(255,255,255,0.08)',
            }}>
              <span style={{ width:6, height:6, borderRadius:2, background: accent, boxShadow: `0 0 6px ${accent}88` }} />
              <span style={{ fontSize:13, color:'#F2F2F4', fontWeight:600, letterSpacing:'-0.15px', flex:1 }}>{t}</span>
              <span style={{ fontSize:9, color:'#6C6C72', fontFamily:'JetBrains Mono' }}>×</span>
            </div>
          ))}
        </div>

        {/* Quick input — focused */}
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'9px 12px', borderRadius:12,
          background:'rgba(255,255,255,0.05)',
          border:`1px solid ${accent}99`,
          boxShadow: `0 0 0 3px ${accent}22, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}>
          <span style={{ fontSize:14, fontWeight:800, color:'#F2F2F4', letterSpacing:'-0.2px' }}>Pi</span>
          <span style={{
            width:1, height:14, background:'#F2F2F4',
            animation: 'sb-blink 1s steps(1) infinite',
          }} />
          <span style={{ fontSize:14, color:'rgba(242,242,244,0.35)', letterSpacing:'-0.2px' }}>t 3</span>
          <span style={{ flex:1 }} />
          <span style={{ fontSize:9.5, color:'#6C6C72', fontFamily:'JetBrains Mono' }}>↹ to accept</span>
        </div>

        {/* Recent / suggested chips */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:2 }}>
          <span style={{ fontSize:9.5, color:'#6C6C72', fontFamily:'JetBrains Mono', letterSpacing:'0.3px', padding:'3px 0 3px 4px' }}>recent</span>
          {['Pit 3', 'Sweep 5/8 HL', 'Detail elevators', 'And Zone 6', 'Pre-rinse'].map(c => (
            <button key={c} style={{
              fontSize:10.5, padding:'4px 8px', borderRadius:8,
              background:'rgba(184,151,8,0.10)',
              border:'1px solid rgba(184,151,8,0.25)',
              color:'#E9B948', fontWeight:600, letterSpacing:'-0.1px',
              fontFamily:'var(--font-atkinson), Inter Tight',
            }}>{c}</button>
          ))}
        </div>
      </div>

      {/* Footer actions */}
      <div style={{ display:'flex', gap:5, paddingTop:6, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <button style={{ ...padBtn(), color: assign?.isLocked ? '#FF9F0A' : '#C7C7CC' }}>
          {assign?.isLocked ? '🔒 Locked' : 'Lock'}
        </button>
        <button style={padBtn()}>Coverage</button>
        <button style={padBtn()}>Swap</button>
        <button style={{ ...padBtn(), background:'rgba(229,57,53,0.10)', border:'1px solid rgba(229,57,53,0.30)', color:'#FF6B65' }}>Clear</button>
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
    fontFamily: 'Inter Tight',
    cursor:'pointer',
  };
}

Object.assign(window, { SbVelvetArtboard });
