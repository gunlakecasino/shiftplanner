// === Variant B · "Blueprint" — Architectural Document OS ===
// Cool slate substrate, dotted blueprint grid, near-flat chrome with
// hairline rules, Properties inspector on right, novel: type-in-card
// task entry (zero modal, zero palette detour) demonstrated via an
// architectural callout zoom over Z3.
//
// Sized for iPad Pro 12.9" landscape: 1366 × 1024.

const SbBlueprintArtboard = () => {
  const selectedKey = 'Z3';
  const selectedAssign = SB_ASSIGNMENTS[selectedKey];
  const accent = SB_TOKENS.zoneColor[selectedKey];

  return (
    <div style={{
      width: 1366, height: 1024,
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'Inter Tight, Inter, system-ui',
      // Blueprint substrate — cool deep slate
      background: `
        radial-gradient(ellipse 60% 60% at 50% 0%, rgba(110,168,255,0.05), transparent 70%),
        linear-gradient(180deg, #0F141B 0%, #0A0E14 100%)
      `,
      color: '#E5E7EB',
    }}>
      {/* Blueprint dot grid */}
      <div style={{
        position:'absolute', inset:0,
        backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1.5px)',
        backgroundSize: '24px 24px',
        backgroundPosition: '0 0',
        pointerEvents: 'none',
      }} />

      {/* Horizontal architect-style measure rules */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:24,
        borderBottom:'1px solid rgba(255,255,255,0.04)',
        display:'flex', alignItems:'flex-end', fontSize:8.5,
        color:'rgba(255,255,255,0.18)', fontFamily:'JetBrains Mono, monospace',
        paddingLeft: 280, paddingRight: 320, gap: 0,
      }}>
        {Array.from({length:30}).map((_, i) => (
          <span key={i} style={{
            flex:1, borderLeft: i % 5 === 0 ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.05)',
            height: i % 5 === 0 ? 8 : 4, lineHeight:1, paddingLeft:2,
          }}>{i % 5 === 0 ? i*4 : ''}</span>
        ))}
      </div>
      <div style={{
        position:'absolute', top:24, left:0, width:24, bottom:78,
        borderRight:'1px solid rgba(255,255,255,0.04)',
        display:'flex', flexDirection:'column', alignItems:'flex-end',
        paddingTop: 64, paddingBottom: 0,
      }}>
        {Array.from({length:20}).map((_, i) => (
          <span key={i} style={{
            flex:1, borderTop: i % 5 === 0 ? '1px solid rgba(255,255,255,0.18)' : '1px solid rgba(255,255,255,0.05)',
            width: i % 5 === 0 ? 8 : 4,
          }} />
        ))}
      </div>

      {/* ── TOP BAR — flatter, hairlined ── */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:54,
        background: 'rgba(15,20,27,0.85)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
        borderBottom:'1px solid rgba(255,255,255,0.08)',
        display:'flex', alignItems:'center', padding:'0 20px 0 24px', gap:20,
        zIndex:5,
      }}>
        {/* Logo + breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{
            width:28, height:28, borderRadius:7,
            background:'#0A0E14',
            border:'1px solid #2A3140',
            display:'flex', alignItems:'center', justifyContent:'center',
            position:'relative',
          }}>
            <span style={{
              position:'absolute', inset:5,
              border:'1.5px solid #6EA8FF',
              borderRadius:3,
              boxShadow:'inset 0 0 6px rgba(110,168,255,0.3)',
            }} />
            <span style={{ position:'absolute', width:5, height:5, borderRadius:'50%', background:'#6EA8FF', boxShadow:'0 0 6px #6EA8FF' }} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
            <span style={{ fontSize:12.5, fontWeight:700, color:'#E5E7EB', letterSpacing:'-0.2px' }}>
              Shift Builder<span style={{ color:'#6C7280', fontWeight:500, marginLeft:6 }}>/ Grave / Wed 03·05</span>
            </span>
            <span style={{ fontSize:10, color:'#6C7280', letterSpacing:'0.3px', fontFamily:'JetBrains Mono, monospace' }}>
              GLCR.IM · v0.3.0 · supabase·live
            </span>
          </div>
        </div>

        {/* Day scrubber — flat */}
        <div style={{ display:'flex', alignItems:'center', gap:0, border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, overflow:'hidden', marginLeft: 20 }}>
          {SB_TOKENS.dayShort.map((d, i) => {
            const active = i === 5;
            const c = SB_TOKENS.dayColor[i];
            return (
              <button key={i} style={{
                padding: active ? '5px 14px' : '5px 10px',
                background: active ? c : 'transparent',
                borderRight: i < 6 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                color: active ? '#fff' : '#9CA3AF',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11.5, fontWeight: active ? 700 : 500, letterSpacing:'0.4px',
              }}>
                {active ? <>W·05</> : d}
              </button>
            );
          })}
        </div>

        <span style={{ flex:1 }} />

        {/* Status meters */}
        <div style={{ display:'flex', alignItems:'center', gap:12, fontSize:10.5, fontFamily:'JetBrains Mono, monospace' }}>
          <Meter label="PLACED" v="28/35" pct={0.8} />
          <Meter label="BREAKS" v="3/3" pct={1} good />
          <Meter label="OPEN" v="4" warn />
        </div>

        {/* ⌘K */}
        <button style={{
          height:30, padding:'0 10px 0 14px', borderRadius:8,
          background:'rgba(255,255,255,0.04)',
          border:'1px solid rgba(255,255,255,0.10)',
          color:'#C7C7CC', fontSize:11.5, fontWeight:500,
          display:'inline-flex', alignItems:'center', gap:8, fontFamily:'Inter Tight',
        }}>
          Command
          <span style={{
            display:'inline-flex', gap:2, padding:'2px 5px', borderRadius:4,
            background:'rgba(255,255,255,0.06)', fontFamily:'JetBrains Mono', fontSize:10, fontWeight:600,
          }}>⌘K</span>
        </button>

        {/* Draft */}
        <button style={{
          height:30, padding:'0 12px', borderRadius:8,
          background:'rgba(110,168,255,0.10)',
          border:'1px solid rgba(110,168,255,0.30)',
          color:'#6EA8FF', fontSize:11.5, fontWeight:700,
          display:'inline-flex', alignItems:'center', gap:6, fontFamily:'JetBrains Mono',
          letterSpacing:'0.3px',
        }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#6EA8FF', boxShadow:'0 0 6px #6EA8FF' }} />
          DRAFT · 3
        </button>

        {/* Publish */}
        <button style={{
          height:30, padding:'0 14px', borderRadius:8,
          background:'#E5E7EB',
          color:'#0A0E14', fontSize:12, fontWeight:700, letterSpacing:'-0.1px',
          fontFamily:'Inter Tight',
        }}>
          Publish PDF
        </button>
      </div>

      {/* ── ROSTER PANEL — left ── */}
      <BlueprintRoster />

      {/* ── INSPECTOR — right ── */}
      <BlueprintInspector slotKey={selectedKey} assign={selectedAssign} accent={accent} />

      {/* ── PAPER SHEET — centered ── */}
      <div style={{
        position:'absolute',
        left: '50%', top: 'calc(50% + 6px)',
        transform: 'translate(-50%, -50%) scale(0.835)',
        transformOrigin: 'center center',
        filter: 'drop-shadow(0 30px 60px rgba(0,0,0,0.5))',
      }}>
        <div style={{ position:'relative' }}>
          <DeploymentSheet selectedKey={selectedKey} dayIdx={5} dateNum={5} />

          {/* Architectural callout to Z3 — the "type-in-card" novel UX */}
          {/* Z3 lives in the first row, 3rd column of the zone grid.
              At 1:1 sheet coords: zones start around y≈148, cards are ~66h with 5px gap;
              columns are 5 wide across ~1020 inner width. We'll just position
              relative to the sheet element. */}
          <TypeInCardCallout />
        </div>
      </div>

      {/* ── BOTTOM STATUS BAR ── */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, height:30,
        background:'rgba(10,14,20,0.85)',
        backdropFilter:'blur(20px)',
        borderTop:'1px solid rgba(255,255,255,0.06)',
        display:'flex', alignItems:'center', padding:'0 16px', gap:16,
        fontSize:10.5, color:'#6C7280', fontFamily:'JetBrains Mono, monospace',
        letterSpacing:'0.3px', zIndex:5,
      }}>
        <span><span style={{ color:'#22C55E' }}>● </span>live · supabase</span>
        <span style={{ color:'#374151' }}>│</span>
        <span>cursor <span style={{ color:'#E5E7EB' }}>Z3 / Food Court North</span></span>
        <span style={{ color:'#374151' }}>│</span>
        <span><span style={{ color:'#6EA8FF' }}>tab</span> autocomplete · <span style={{ color:'#6EA8FF' }}>/</span> command · <span style={{ color:'#6EA8FF' }}>esc</span> deselect</span>
        <span style={{ flex:1 }} />
        <span>4 unplaced</span>
        <span style={{ color:'#374151' }}>│</span>
        <span>28 / 35</span>
        <span style={{ color:'#374151' }}>│</span>
        <span>Day 6 / 7</span>
        <span style={{ color:'#374151' }}>│</span>
        <span style={{ color:'#9CA3AF' }}>brian.c@glcr</span>
      </div>
    </div>
  );
};

function Meter({ label, v, pct, good, warn }) {
  const c = warn ? '#E53935' : good ? '#22C55E' : '#6EA8FF';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ color:'#6C7280', letterSpacing:'0.4px' }}>{label}</span>
      <span style={{ color:c, fontWeight:700 }}>{v}</span>
      {typeof pct === 'number' && (
        <span style={{ width:36, height:3, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden', display:'inline-block' }}>
          <span style={{ display:'block', width:`${pct*100}%`, height:'100%', background:c }} />
        </span>
      )}
    </div>
  );
}

// === Roster panel ===
function BlueprintRoster() {
  return (
    <div style={{
      position:'absolute', top:54, left:24, width:240, bottom:30,
      background:'rgba(15,20,27,0.55)',
      backdropFilter:'blur(20px)',
      borderRight:'1px solid rgba(255,255,255,0.06)',
      display:'flex', flexDirection:'column',
      zIndex:4,
    }}>
      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'1px solid rgba(255,255,255,0.06)', fontFamily:'JetBrains Mono' }}>
        {[
          { l:'Roster · 32', a:true },
          { l:'Unplaced · 4', warn:true },
          { l:'History' },
        ].map((t, i) => (
          <button key={i} style={{
            padding:'10px 12px', fontSize:10.5,
            color: t.a ? '#E5E7EB' : t.warn ? '#FF6B65' : '#6C7280',
            background: t.a ? 'rgba(110,168,255,0.06)' : 'transparent',
            borderBottom: t.a ? '2px solid #6EA8FF' : '2px solid transparent',
            fontWeight: t.a ? 700 : 500, letterSpacing:'0.2px',
          }}>{t.l}</button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding:'10px 12px 8px' }}>
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'7px 10px', borderRadius:6,
          background:'rgba(255,255,255,0.03)',
          border:'1px solid rgba(255,255,255,0.08)',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6C7280" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <span style={{ fontSize:11.5, color:'#6C7280', fontFamily:'JetBrains Mono', letterSpacing:'0.2px' }}>name, slot, or task…</span>
          <span style={{ flex:1 }} />
          <span style={{ fontSize:9.5, color:'#374151', fontFamily:'JetBrains Mono', padding:'1px 4px', borderRadius:3, border:'1px solid rgba(255,255,255,0.06)' }}>/</span>
        </div>
      </div>

      {/* Filter group */}
      <div style={{ padding:'0 12px 10px', display:'flex', gap:4, flexWrap:'wrap' }}>
        {[
          { l:'Full', n:22, a:true },
          { l:'PM',   n:4 },
          { l:'AM',   n:6 },
        ].map(c => (
          <span key={c.l} style={{
            fontSize:10, padding:'3px 7px', borderRadius:4,
            background: c.a ? 'rgba(110,168,255,0.10)' : 'rgba(255,255,255,0.03)',
            border: `1px solid ${c.a ? 'rgba(110,168,255,0.30)' : 'rgba(255,255,255,0.06)'}`,
            color: c.a ? '#6EA8FF' : '#9CA3AF',
            fontWeight: c.a ? 700 : 500,
            fontFamily:'JetBrains Mono', letterSpacing:'0.2px',
          }}>{c.l} · {c.n}</span>
        ))}
      </div>

      {/* Section: Unplaced */}
      <div style={{
        padding:'6px 12px',
        background:'rgba(229,57,53,0.04)',
        borderTop:'1px solid rgba(229,57,53,0.20)',
        borderBottom:'1px solid rgba(229,57,53,0.10)',
        display:'flex', justifyContent:'space-between', alignItems:'center',
      }}>
        <span style={{ fontSize:9.5, color:'#FF8E8A', fontWeight:700, letterSpacing:'1.2px', fontFamily:'JetBrains Mono' }}>UNPLACED · 4</span>
        <span style={{ fontSize:9, color:'#6EA8FF', fontFamily:'JetBrains Mono', textTransform:'uppercase' }}>auto-fill ▸</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column' }}>
        {[
          { name:'Omar Rasheed',    hours:'3a–9a', tier:'AM', skill:'tables' },
          { name:'Kelsey Albright', hours:'3a–9a', tier:'AM', skill:'restrooms' },
          { name:'Joel Boyko',      hours:'3a–9a', tier:'AM', skill:'slots' },
          { name:'Mira Pinheiro',   hours:'3a–9a', tier:'AM', skill:'support' },
        ].map((p, i) => (
          <BlueprintNameRow key={p.name} {...p} dragging={i===0} />
        ))}
      </div>

      {/* Section: Placed */}
      <div style={{ padding:'10px 12px 4px', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
        <span style={{ fontSize:9.5, color:'#6C7280', fontWeight:700, letterSpacing:'1.2px', fontFamily:'JetBrains Mono' }}>PLACED · 24</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', opacity:0.85, flex:1, overflow:'hidden' }}>
        {[
          { name:'Brandon Calloway', hours:'11p–7a', tier:'Lead', placed:'Z1' },
          { name:'Marcus Joiner',    hours:'11p–7a', tier:'Sr',   placed:'Z2' },
          { name:'Tasha Whitfield',  hours:'11p–7a', tier:'Full', placed:'Z7' },
          { name:'Devon Rourke',     hours:'11p–7a', tier:'Full', placed:'Z8' },
          { name:'Andre Pacheco',    hours:'11p–7a', tier:'Full', placed:'Z3', focused:true },
          { name:'Tomás Guevara',    hours:'11p–7a', tier:'Full', placed:'Z5' },
          { name:'Aisha Nasiri',     hours:'11p–7a', tier:'Full', placed:'Z6' },
          { name:'Hector Aragón',    hours:'11p–7a', tier:'Full', placed:'Z9' },
        ].map(p => <BlueprintNameRow key={p.name} {...p} />)}
        <div style={{ padding:'4px 12px', fontSize:9.5, color:'#374151', fontFamily:'JetBrains Mono' }}>+ 16 more…</div>
      </div>
    </div>
  );
}

function BlueprintNameRow({ name, hours, tier, skill, placed, dragging, focused }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:8,
      padding:'7px 12px',
      background: focused ? 'rgba(110,168,255,0.08)' : dragging ? 'rgba(255,255,255,0.04)' : 'transparent',
      borderLeft: focused ? '2px solid #6EA8FF' : dragging ? '2px solid #6EA8FF' : '2px solid transparent',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      cursor:'grab',
    }}>
      <span style={{
        width:18, height:18, borderRadius:3,
        background: 'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.10)',
        color:'#9CA3AF', fontSize:8.5, fontWeight:700, letterSpacing:'-0.1px',
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'JetBrains Mono', flexShrink:0,
      }}>{name.split(' ').map(s => s[0]).join('').slice(0,2)}</span>
      <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15, flex:1, minWidth:0 }}>
        <span style={{ fontSize:11.5, fontWeight:600, color: focused ? '#E5E7EB' : '#C7C7CC', letterSpacing:'-0.1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
        <span style={{ fontSize:9, color:'#6C7280', fontFamily:'JetBrains Mono', letterSpacing:'0.1px' }}>{hours} · {tier}{skill && <> · {skill}</>}</span>
      </div>
      {placed && (
        <span style={{
          fontSize:9.5, fontFamily:'JetBrains Mono', fontWeight:700,
          padding:'2px 5px', borderRadius:3, background:'rgba(255,255,255,0.04)',
          color: focused ? '#6EA8FF' : '#9CA3AF',
          border: focused ? '1px solid rgba(110,168,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
        }}>{placed}</span>
      )}
      {dragging && (
        <span style={{ fontSize:9, color:'#6EA8FF', fontWeight:700, fontFamily:'JetBrains Mono', letterSpacing:'0.4px' }}>DRAG</span>
      )}
    </div>
  );
}

// === Properties inspector ===
function BlueprintInspector({ slotKey, assign, accent }) {
  const zoneDef = SB_ZONES.find(z => z.key === slotKey);
  const icon = SB_TOKENS.zoneIcon[slotKey];
  return (
    <div style={{
      position:'absolute', top:54, right:0, width:308, bottom:30,
      background:'rgba(15,20,27,0.55)',
      backdropFilter:'blur(20px)',
      borderLeft:'1px solid rgba(255,255,255,0.06)',
      display:'flex', flexDirection:'column',
      zIndex:4,
    }}>
      {/* Slot header */}
      <div style={{
        padding:'12px 16px 10px',
        borderBottom:'1px solid rgba(255,255,255,0.06)',
        position:'relative',
      }}>
        <div style={{ position:'absolute', top:0, left:0, bottom:0, width:3, background: accent, boxShadow:`0 0 12px ${accent}88` }} />
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
          <span style={{ fontSize:18, color:accent, lineHeight:1 }}>{icon}</span>
          <span style={{
            fontSize:10.5, fontWeight:800, letterSpacing:'1.6px', color:accent,
            fontFamily:'JetBrains Mono',
          }}>{slotKey}</span>
          <span style={{ flex:1 }} />
          <span style={{ fontSize:9, color:'#6C7280', fontFamily:'JetBrains Mono', padding:'2px 5px', borderRadius:3, border:'1px solid rgba(255,255,255,0.08)' }}>SLOT · ZONE</span>
        </div>
        <div style={{ fontSize:20, fontWeight:700, color:'#E5E7EB', letterSpacing:'-0.4px', fontFamily:'Inter Tight' }}>
          {zoneDef?.label}
        </div>
        <div style={{ fontSize:11.5, color:'#9CA3AF', marginTop:2 }}>
          {zoneDef?.loc}
        </div>
      </div>

      {/* Property list */}
      <div style={{ display:'flex', flexDirection:'column' }}>
        <Prop label="ASSIGNED">
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{
              width:22, height:22, borderRadius:'50%',
              background:`linear-gradient(135deg, ${accent}, ${accent}99)`,
              color:'#fff', fontSize:9.5, fontWeight:800,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontFamily:'Inter Tight',
            }}>AP</span>
            <div style={{ display:'flex', flexDirection:'column', lineHeight:1.15 }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#E5E7EB', letterSpacing:'-0.2px' }}>Andre Pacheco</span>
              <span style={{ fontSize:9.5, color:'#6C7280', fontFamily:'JetBrains Mono' }}>tm14 · 11p–7a · Full</span>
            </div>
          </div>
        </Prop>

        <Prop label="SOURCE" value="Engine · score 0.82" valueColor="#9CA3AF" mono />
        <Prop label="HISTORY" value="14 prior nights · 0 swaps" valueColor="#9CA3AF" mono />

        {/* Break group selector — radio strip */}
        <div style={{ padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C7280', textTransform:'uppercase', fontFamily:'JetBrains Mono', marginBottom:6 }}>Break Wave</div>
          <div style={{ display:'flex', gap:0, border:'1px solid rgba(255,255,255,0.08)', borderRadius:6, overflow:'hidden' }}>
            {['Off', '1', '2', '3'].map((b, i) => {
              const active = b === '3';
              return (
                <button key={b} style={{
                  flex:1, padding:'7px 0',
                  background: active ? `${accent}` : 'transparent',
                  color: active ? '#fff' : '#9CA3AF',
                  borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  fontSize: 12, fontWeight: 700, letterSpacing:'-0.1px',
                  fontFamily:'JetBrains Mono',
                }}>{b}</button>
              );
            })}
          </div>
          <div style={{ fontSize:9.5, color:'#6C7280', marginTop:5, fontFamily:'JetBrains Mono' }}>Group 3 · break at 3:00a</div>
        </div>

        {/* TASKS — the novel-entry feature */}
        <div style={{ padding:'10px 16px', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6 }}>
            <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C7280', textTransform:'uppercase', fontFamily:'JetBrains Mono' }}>Tasks · 1</span>
            <span style={{ fontSize:9, color:'#6EA8FF', fontFamily:'JetBrains Mono' }}>type on card ▸</span>
          </div>
          <div style={{
            display:'flex', alignItems:'center', gap:6,
            padding:'6px 10px', borderRadius:5,
            background:'rgba(255,255,255,0.02)',
            border:'1px solid rgba(255,255,255,0.06)',
            marginBottom:4,
          }}>
            <span style={{ width:6, height:6, borderRadius:1, background:accent, flexShrink:0 }} />
            <span style={{ fontSize:11.5, color:'#E5E7EB', fontWeight:500, letterSpacing:'-0.1px', flex:1 }}>Pre-rinse FC dish</span>
            <span style={{ fontSize:9, color:'#6C7280', fontFamily:'JetBrains Mono' }}>esc · del</span>
          </div>
          <div style={{ fontSize:9.5, color:'#6C7280', fontFamily:'JetBrains Mono', lineHeight:1.4, marginTop:4 }}>
            Single-tap card to focus.<br/>Type any text to add a task.<br/>
            <span style={{ color:'#6EA8FF' }}>/break 2</span>{' · '}
            <span style={{ color:'#6EA8FF' }}>/lock</span>{' · '}
            <span style={{ color:'#6EA8FF' }}>/swap</span>
          </div>
        </div>

        <Prop label="COVERAGE" value="—" valueColor="#6C7280" mono />
        <Prop label="LOCKED" value="false" valueColor="#9CA3AF" mono />
      </div>

      {/* Actions */}
      <div style={{ marginTop:'auto', padding:12, borderTop:'1px solid rgba(255,255,255,0.06)', display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
        <button style={inspBtn()}>Lock</button>
        <button style={inspBtn()}>Coverage</button>
        <button style={inspBtn()}>Swap with…</button>
        <button style={{ ...inspBtn(), background:'rgba(229,57,53,0.08)', borderColor:'rgba(229,57,53,0.30)', color:'#FF8E8A' }}>Clear slot</button>
      </div>
    </div>
  );
}

function Prop({ label, value, valueColor = '#E5E7EB', mono, children }) {
  return (
    <div style={{
      padding:'10px 16px',
      borderBottom:'1px solid rgba(255,255,255,0.04)',
      display:'flex', flexDirection:'column', gap:4,
    }}>
      <span style={{ fontSize:9.5, fontWeight:700, letterSpacing:'1.4px', color:'#6C7280', textTransform:'uppercase', fontFamily:'JetBrains Mono' }}>{label}</span>
      {children || (
        <span style={{
          fontSize:11.5, color: valueColor,
          fontFamily: mono ? 'JetBrains Mono, monospace' : 'Inter Tight',
          letterSpacing: mono ? '0.1px' : '-0.1px',
          fontWeight: 500,
        }}>{value}</span>
      )}
    </div>
  );
}

function inspBtn() {
  return {
    height:30, borderRadius:6,
    background:'rgba(255,255,255,0.04)',
    border:'1px solid rgba(255,255,255,0.10)',
    color:'#C7C7CC', fontSize:11, fontWeight:600,
    fontFamily:'Inter Tight', letterSpacing:'-0.1px',
  };
}

// === The "type-in-card" architectural callout ===
// Floats next to where Z3 sits on the scaled sheet, with a hairline pointer.
// Shows what Z3 looks like at 2× while a task is being typed.
function TypeInCardCallout() {
  const accent = SB_TOKENS.zoneColor.Z3;
  // The sheet itself is 1056×816 at this layer. Z3 is row 1, col 3 in the
  // zones grid that starts ~y=124 with cards 66h. Card width ≈ 200, gap 5.
  // First card left ≈ 18 (padding). 3rd card x ≈ 18 + 2*(200+5) = 428.
  // Card center: (428+100, 124+33) = (528, 157).
  return (
    <>
      {/* Highlight ring on Z3 in the actual sheet */}
      <div style={{
        position:'absolute', left: 426, top: 122,
        width: 204, height: 70,
        border: `2px solid ${accent}`,
        borderRadius: 4,
        boxShadow: `0 0 0 6px ${accent}22, 0 8px 24px -6px ${accent}88`,
        pointerEvents:'none',
        zIndex: 2,
      }} />

      {/* Connector hairline going up-right */}
      <svg style={{ position:'absolute', left:528, top:120, width: 340, height: 50, overflow:'visible', pointerEvents:'none', zIndex:2 }}>
        <path d={`M 0 35 L 80 -15 L 320 -15`} stroke={accent} strokeWidth="1.5" fill="none" strokeDasharray="0" />
        <circle cx="0" cy="35" r="3" fill={accent} />
        <circle cx="320" cy="-15" r="3" fill={accent} />
      </svg>

      {/* Callout — magnified Z3 in typing state */}
      <div style={{
        position:'absolute', left: 728, top: 8,
        width: 380,
        background:'#FFFFFF',
        border:`1px solid ${accent}`,
        borderRadius: 6,
        boxShadow:`0 16px 48px -12px ${accent}66, 0 0 0 4px ${accent}22`,
        overflow:'hidden',
        fontFamily:'var(--font-atkinson), Inter Tight',
        zIndex: 3,
      }}>
        {/* Color bar */}
        <div style={{ height:6, background: accent }} />

        <div style={{ padding:'10px 14px 12px' }}>
          {/* Header row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${accent}33`, paddingBottom:6, marginBottom:8 }}>
            <span style={{ display:'flex', alignItems:'center', gap:6, color:accent }}>
              <span style={{ fontSize:18 }}>▲</span>
              <span style={{ fontSize:14, fontWeight:800, letterSpacing:'0.5px' }}>ZONE 3</span>
              <span style={{ fontSize:10, color:'#6B7280', fontWeight:500, letterSpacing:'0.3px', marginLeft:6 }}>Food Court North</span>
            </span>
            <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:'#1D1D1F', color:'#fff', fontWeight:800, letterSpacing:'-0.2px' }}>3</span>
          </div>

          {/* Name */}
          <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:6 }}>
            <span style={{ fontSize:22, fontWeight:800, color:'#111', letterSpacing:'-0.4px' }}>Andre Pacheco</span>
          </div>

          {/* Task line — being typed */}
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ width:7, height:7, borderRadius:2, background:accent }} />
              <span style={{ fontSize:13, color:'#111', fontWeight:500, letterSpacing:'-0.1px' }}>Pre-rinse FC dish</span>
            </div>
            <div style={{
              display:'flex', alignItems:'center', gap:6,
              padding:'5px 8px', margin:'0 -4px',
              borderRadius: 4,
              background: `${accent}10`,
              border: `1px dashed ${accent}80`,
            }}>
              <span style={{ width:7, height:7, borderRadius:2, background:accent, opacity:0.6 }} />
              <span style={{ fontSize:13, color:'#111', fontWeight:500, letterSpacing:'-0.1px' }}>And Zone</span>
              <span style={{
                width:1.5, height:14, background:'#111',
                animation: 'sb-blink 1s steps(1) infinite', display:'inline-block',
              }} />
              <span style={{ fontSize:13, color:'#999', fontWeight:500, letterSpacing:'-0.1px' }}> 4 pre-rinse</span>
              <span style={{ flex:1 }} />
              <span style={{ fontSize:9.5, color:'#6B7280', fontFamily:'JetBrains Mono', letterSpacing:'0.2px' }}>↹ accept</span>
            </div>
          </div>
        </div>

        {/* Callout label — architect tag */}
        <div style={{
          background: '#F8FAFC',
          borderTop:`1px solid ${accent}33`,
          padding:'7px 14px',
          display:'flex', alignItems:'center', gap:8,
          fontFamily:'JetBrains Mono, monospace',
        }}>
          <span style={{
            display:'inline-flex', alignItems:'center', justifyContent:'center',
            width:18, height:18, borderRadius:9,
            background: accent, color:'#fff',
            fontSize:10, fontWeight:800,
          }}>A</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:'#0F141B', letterSpacing:'0.3px' }}>TYPE-IN-CARD</span>
          <span style={{ fontSize:10, color:'#6B7280', letterSpacing:'0.2px' }}>· tap selects, just start typing</span>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SbBlueprintArtboard });
