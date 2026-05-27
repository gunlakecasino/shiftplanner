// ⌘K Command Palette — power-user surface.
// Parses commands like:
//   "Egbert Z9SR"          → assign B. Egbert to Z9SR
//   "Pit 3 @ Z5"           → add task "Pit 3" to Z5
//   "Z5"                   → jump to Z5
//   "task pit 3"           → add task to currently selected slot
//   "lock z1"              → toggle lock
//   ""                     → show all slots / TMs as browsable list

function SbCmdK({ close, assignments, assignTm, addTaskToSlot, selectCard }) {
  const { useState, useMemo, useRef, useEffect } = React;
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const dialogRef = useRef(null);

  // Focus input on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Focus trap — keep Tab cycling within the dialog
  useEffect(() => {
    const trap = (e) => {
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button, input, [tabindex]:not([tabindex="-1"])'
      );
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', trap);
    return () => window.removeEventListener('keydown', trap);
  }, []);

  // All slot keys
  const allSlotKeys = useMemo(() => [
    ...SB_ZONES.map(z => ({ key: z.key, label: z.label, loc: z.loc, kind: 'zone' })),
    ...SB_RR.flatMap(rr => [
      { key: `MRR${rr.num}`, label: `MRR${rr.num}`, loc: `${rr.loc} · Men's`, kind: 'rr' },
      { key: `WRR${rr.num}`, label: `WRR${rr.num}`, loc: `${rr.loc} · Women's`, kind: 'rr' },
    ]),
    ...SB_AUX.map(a => ({ key: a.key, label: a.label, loc: a.loc, kind: 'aux' })),
  ], []);

  // Parse + rank results
  const results = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const items = [];

    if (!ql) {
      // Default: top suggestions
      items.push({ type: 'header', text: 'Quick actions' });
      items.push({ type: 'cmd', icon:'⚙', label:'Auto-fill remaining 4 slots', sub:'AI · Draft Mode', accent:'#E9B948', action: () => { close(); } });
      items.push({ type: 'cmd', icon:'✦', label:'Generate nightly brief', sub:'Grok · grave shift summary', accent:'#C39DFF', action: () => { close(); } });
      items.push({ type: 'cmd', icon:'⤓', label:'Publish Zone Deployment Book', sub:'PDF · post for team', accent:'#43A047', action: () => { close(); } });
      items.push({ type: 'header', text: 'Recent tasks · tap to add to selection' });
      SB_RECENT_TASKS.slice(0, 6).forEach(t => {
        items.push({ type: 'task', icon:'⊕', label: t, sub:'add to selection', action: (sel) => { addTaskToSlot(sel, t); close(); } });
      });
      return items;
    }

    // ── "task pit 3" → add task to selection ──
    if (ql.startsWith('task ')) {
      const taskText = q.slice(5).trim();
      if (taskText) {
        items.push({ type: 'header', text: 'Add task to current selection' });
        items.push({ type: 'task', icon:'⊕', label: taskText, sub:'add to selected slot', accent:'#E9B948', action: (sel) => { addTaskToSlot(sel, taskText); close(); } });
      }
    }

    // ── "X @ SLOT" → add task X to slot ──
    const atMatch = q.match(/^(.+)\s+@\s*(\S+)$/i);
    if (atMatch) {
      const [, taskText, slotHint] = atMatch;
      const slot = allSlotKeys.find(s => s.key.toLowerCase() === slotHint.toLowerCase());
      if (slot) {
        items.push({ type: 'header', text: 'Add task to specific slot' });
        items.push({ type: 'task', icon:'⊕', label: `${taskText.trim()} → ${slot.key}`, sub: slot.loc, accent: SB_TOKENS.zoneColor[slot.key] || '#E9B948', action: () => { addTaskToSlot(slot.key, taskText.trim()); close(); } });
      }
    }

    // ── TM name match (for assignment) ──
    const tmMatches = SB_ROSTER.filter(t =>
      t.name.toLowerCase().includes(ql) ||
      t.full.toLowerCase().includes(ql)
    ).slice(0, 5);

    // Try to parse "TmName SLOT"
    const tokens = q.trim().split(/\s+/);
    const lastTok = tokens[tokens.length - 1];
    const possibleSlot = allSlotKeys.find(s => s.key.toLowerCase() === lastTok.toLowerCase());
    if (possibleSlot && tokens.length > 1) {
      const tmHint = tokens.slice(0, -1).join(' ').toLowerCase();
      const tm = SB_ROSTER.find(t =>
        t.name.toLowerCase().includes(tmHint) ||
        t.full.toLowerCase().includes(tmHint)
      );
      if (tm) {
        items.push({ type: 'header', text: 'Assign' });
        items.push({ type: 'assign', icon:'→', label: `${tm.full} → ${possibleSlot.key}`, sub: possibleSlot.loc,
          accent: SB_TOKENS.zoneColor[possibleSlot.key] || '#E9B948',
          action: () => { assignTm(possibleSlot.key, tm); close(); } });
      }
    }

    if (tmMatches.length) {
      items.push({ type: 'header', text: 'Team members' });
      tmMatches.forEach(tm => {
        items.push({ type: 'tm', icon:'◉', label: tm.full, sub: `${tm.hours} · ${tm.pool}`, accent:'#9CA3AF',
          action: (sel) => { assignTm(sel, tm); close(); } });
      });
    }

    // ── Slot matches ──
    const slotMatches = allSlotKeys.filter(s =>
      s.key.toLowerCase().includes(ql) || s.label.toLowerCase().includes(ql) || s.loc.toLowerCase().includes(ql)
    ).slice(0, 5);
    if (slotMatches.length) {
      items.push({ type: 'header', text: 'Jump to slot' });
      slotMatches.forEach(s => {
        items.push({ type: 'slot', icon: SB_TOKENS.zoneIcon[s.key] || SB_TOKENS.auxIcon[s.key] || '●',
          label: s.label, sub: s.loc,
          accent: SB_TOKENS.zoneColor[s.key] || SB_TOKENS.auxColor[s.key] || '#9CA3AF',
          action: () => { selectCard(s.key); close(); } });
      });
    }

    if (!items.length) {
      items.push({ type: 'header', text: 'No matches' });
      items.push({ type: 'hint', label: `Try: name + slot · task <text> · Z3, MRR7, ADM` });
    }

    return items;
  }, [q]);

  const selectableItems = results.filter(r => r.type !== 'header' && r.type !== 'hint');
  const selectableIndices = results.map((r, i) => (r.type !== 'header' && r.type !== 'hint') ? i : -1).filter(i => i >= 0);
  const activeRowIdx = selectableIndices[cursor] ?? -1;

  useEffect(() => { setCursor(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(selectableItems.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const item = selectableItems[cursor];
      if (item?.action) {
        // For task/tm actions that need current selection, we don't know it here;
        // fall back to a sensible default. Parent already routes through addTaskToSlot
        // which uses selectedKey via its closure.
        item.action?.();
      }
    }
  };

  return (
    <div
      onClick={close}
      role="presentation"
      style={{
        position:'absolute', inset:0,
        background:'rgba(0,0,0,0.55)',
        backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)',
        zIndex: 100,
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        paddingTop: 140,
        fontFamily:'Inter Tight, system-ui',
        animation:'sb-fade-in 0.15s ease-out',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette — assign, add tasks, jump to slot"
        onClick={e => e.stopPropagation()}
        style={{
        width: 640, maxHeight: 580,
        borderRadius: 20,
        background:'rgba(28,28,30,0.85)',
        backdropFilter:'blur(60px) saturate(180%)',
        WebkitBackdropFilter:'blur(60px) saturate(180%)',
        border:'1px solid rgba(255,255,255,0.14)',
        boxShadow:`
          inset 0 1px 0 rgba(255,255,255,0.14),
          0 30px 80px -20px rgba(0,0,0,0.7),
          0 0 0 1px rgba(184,151,8,0.18)
        `,
        display:'flex', flexDirection:'column',
        overflow:'hidden',
      }}>
        {/* Input */}
        <div style={{
          padding:'14px 18px 12px',
          borderBottom:'1px solid rgba(255,255,255,0.08)',
          display:'flex', alignItems:'center', gap:12,
        }}>
          <span style={{
            fontFamily:'JetBrains Mono', fontSize:11, fontWeight:700,
            color:'#E9B948', padding:'3px 8px', borderRadius:7,
            background:'rgba(184,151,8,0.14)', border:'1px solid rgba(184,151,8,0.30)',
            letterSpacing:'0.4px',
          }}>⌘K</span>
          <input
            ref={inputRef}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={true}
            aria-label="Command search"
            value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Type a name, slot, or task… (e.g. 'Egbert Z9SR' or 'Pit 3 @ Z5')"
            style={{
              flex:1, background:'transparent', border:'none', outline:'none',
              fontSize:18, fontWeight:600, color:'#F2F2F4', letterSpacing:'-0.3px',
              fontFamily:'inherit',
            }}
          />
          <span style={{ fontSize:10.5, color:'#6C6C72', fontFamily:'JetBrains Mono' }}>esc</span>
        </div>

        {/* Results */}
        <div className="no-scrollbar" style={{ overflowY:'auto', maxHeight: 480, padding:'6px 0' }}>
          {results.map((r, i) => {
            if (r.type === 'header') {
              return (
                <div key={i} style={{
                  padding:'10px 18px 4px',
                  fontSize:9.5, fontWeight:800, letterSpacing:'1.4px', color:'#6C6C72',
                  textTransform:'uppercase',
                }}>{r.text}</div>
              );
            }
            if (r.type === 'hint') {
              return (
                <div key={i} style={{ padding:'8px 18px', fontSize:12, color:'#9CA3AF', fontStyle:'italic' }}>{r.label}</div>
              );
            }
            const active = i === activeRowIdx;
            return (
              <button key={i}
                onClick={() => r.action?.()}
                onMouseEnter={() => {
                  const idx = selectableIndices.indexOf(i);
                  if (idx >= 0) setCursor(idx);
                }}
                style={{
                  width:'100%', textAlign:'left',
                  padding:'10px 18px',
                  display:'flex', alignItems:'center', gap:12,
                  background: active ? 'linear-gradient(90deg, rgba(184,151,8,0.18), rgba(184,151,8,0.06))' : 'transparent',
                  borderLeft: active ? '2px solid #E9B948' : '2px solid transparent',
                  cursor:'pointer', transition:'background 0.1s',
                }}>
                <span style={{
                  width:26, height:26, borderRadius:7,
                  background:'rgba(255,255,255,0.04)',
                  border:'1px solid rgba(255,255,255,0.08)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color: r.accent || '#9CA3AF',
                  fontSize:13, fontWeight:700, flexShrink:0,
                }}>{r.icon}</span>
                <div style={{ display:'flex', flexDirection:'column', flex:1, minWidth:0, lineHeight:1.2 }}>
                  <span style={{ fontSize:14, fontWeight:700, color:'#F2F2F4', letterSpacing:'-0.2px' }}>{r.label}</span>
                  {r.sub && <span style={{ fontSize:11, color:'#8E8E93', fontFamily:'JetBrains Mono' }}>{r.sub}</span>}
                </div>
                {active && (
                  <span style={{
                    fontSize:9.5, color:'#E9B948', fontFamily:'JetBrains Mono',
                    padding:'3px 7px', borderRadius:6,
                    background:'rgba(184,151,8,0.12)', border:'1px solid rgba(184,151,8,0.25)',
                    fontWeight:700,
                  }}>↵</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint bar */}
        <div style={{
          padding:'8px 18px',
          borderTop:'1px solid rgba(255,255,255,0.08)',
          display:'flex', justifyContent:'space-between',
          fontSize:10.5, color:'#6C6C72', fontFamily:'JetBrains Mono',
        }}>
          <div style={{ display:'flex', gap:14 }}>
            <span>↑↓ navigate</span>
            <span>↵ select</span>
            <span>esc close</span>
          </div>
          <span style={{ color:'#9CA3AF' }}>name slot · task @ slot · zone key</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { SbCmdK });
