// sb-composer.jsx — Inline empty-card composer popover.
// Tap an empty card → a glass popover blooms next to the card in screen space.
// Single search field, recent unplaced TMs as chips, Enter to assign, Esc closes.
// Solves the "too many steps" pain point for the most common action.

const InlineComposer = React.memo(function InlineComposer({
  slot, anchorRect, onClose, onAssign, onOpenInspector, roster, placement,
}) {
  const { useState, useRef, useEffect, useMemo } = React;
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on outside click
  useEffect(() => {
    const onDown = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    // Defer so the opening click isn't immediately captured
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => { clearTimeout(t); window.removeEventListener('mousedown', onDown); };
  }, [onClose]);

  // Filter: unplaced first, then placed; matched by query
  const candidates = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const all = roster.map(tm => ({
      ...tm,
      slot: placement[tm.id] || null,
    }));
    let filtered = all;
    if (ql) {
      filtered = all.filter(tm =>
        tm.name.toLowerCase().includes(ql) || tm.full.toLowerCase().includes(ql)
      );
    }
    // Sort: unplaced first, then by pool (Full > PM > AM), then by name
    filtered.sort((a, b) => {
      const aPlaced = !!a.slot, bPlaced = !!b.slot;
      if (aPlaced !== bPlaced) return aPlaced ? 1 : -1;
      const poolOrder = { Full: 0, PM: 1, AM: 2 };
      const ap = poolOrder[a.pool] ?? 3;
      const bp = poolOrder[b.pool] ?? 3;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name);
    });
    return filtered.slice(0, 8);
  }, [q, roster, placement]);

  // Reset cursor when query changes
  useEffect(() => { setCursor(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'Escape')   { e.preventDefault(); onClose?.(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(candidates.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(0, c - 1)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const tm = candidates[cursor];
      if (tm) onAssign(tm);
    }
  };

  // Position: prefer above the card; if no room, below. Centered horizontally with the card.
  const W = 280, H = 290;
  const margin = 12;
  const sw = window.innerWidth;
  const sh = window.innerHeight;
  const cardCenterX = anchorRect.left + anchorRect.width / 2;
  let left = Math.max(8, Math.min(sw - W - 8, cardCenterX - W / 2));
  let top  = anchorRect.top - H - margin;
  let placedAbove = true;
  if (top < 8) {
    top = anchorRect.bottom + margin;
    placedAbove = false;
  }
  if (top + H > sh - 8) top = Math.max(8, sh - H - 8);

  // Arrow position relative to popover
  const arrowX = Math.max(20, Math.min(W - 20, cardCenterX - left));

  // Slot identity (accent + label) — derive from data
  const accent = SB_TOKENS.zoneColor[slot]
              || SB_TOKENS.auxColor[slot]
              || (slot?.startsWith('MRR') || slot?.startsWith('WRR')
                  ? SB_TOKENS.rrColor[parseInt(slot.replace(/[MW]RR/,''),10)]
                  : null)
              || '#B89708';
  const icon = SB_TOKENS.zoneIcon[slot]
            || SB_TOKENS.auxIcon[slot]
            || (slot?.startsWith('MRR') || slot?.startsWith('WRR')
                ? SB_TOKENS.rrIcon[parseInt(slot.replace(/[MW]RR/,''),10)]
                : '●');

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={`Assign team member to ${slot}`}
      style={{
        position: 'fixed', top, left, width: W, maxHeight: H,
        zIndex: 90,
        borderRadius: 16,
        background: 'rgba(28,28,30,0.86)',
        backdropFilter: 'blur(48px) saturate(200%)',
        WebkitBackdropFilter: 'blur(48px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.14),
          0 24px 50px -16px rgba(0,0,0,0.7),
          0 0 0 1px ${accent}33
        `,
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter Tight, system-ui',
        overflow: 'hidden',
        animation: `sb-composer-${placedAbove ? 'up' : 'down'} 0.22s cubic-bezier(0.16,1,0.3,1) both`,
      }}
    >
      {/* Arrow */}
      <div style={{
        position: 'absolute',
        left: arrowX - 6,
        [placedAbove ? 'bottom' : 'top']: -7,
        width: 14, height: 14, transform: 'rotate(45deg)',
        background: 'rgba(28,28,30,0.86)',
        borderRight: placedAbove ? '1px solid rgba(255,255,255,0.12)' : 'none',
        borderBottom: placedAbove ? '1px solid rgba(255,255,255,0.12)' : 'none',
        borderLeft: placedAbove ? 'none' : '1px solid rgba(255,255,255,0.12)',
        borderTop: placedAbove ? 'none' : '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(48px) saturate(200%)',
        WebkitBackdropFilter: 'blur(48px) saturate(200%)',
        zIndex: -1,
      }} />

      {/* Identity strip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 18, color: accent }}>{icon}</span>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '1.5px', color: accent, textTransform: 'uppercase', fontFamily: 'Atkinson Hyperlegible, Inter Tight' }}>
          Assign to {slot}
        </span>
        <span style={{ flex: 1 }} />
        <button onClick={onClose} aria-label="Close" style={{
          fontSize: 11, color: '#6C6C72', padding: '2px 6px',
          fontFamily: 'JetBrains Mono, monospace', borderRadius: 5,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer',
        }}>esc</button>
      </div>

      {/* Search */}
      <div style={{
        padding: '10px 14px 8px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 10px', borderRadius: 10,
          background: 'rgba(255,255,255,0.06)',
          border: `1px solid ${accent}55`,
          boxShadow: `0 0 0 3px ${accent}11`,
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search a name…"
            aria-label="Search team members"
            style={{
              background: 'transparent', border: 'none', outline: 'none', flex: 1,
              fontSize: 13.5, color: '#F2F2F4', letterSpacing: '-0.1px',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Candidate list */}
      <div className="no-scrollbar" style={{ overflowY: 'auto', flex: 1, padding: '0 6px 8px' }}>
        {candidates.length === 0 ? (
          <div style={{ padding: '14px 10px', fontSize: 11.5, color: '#6C6C72', fontStyle: 'italic', textAlign: 'center' }}>
            No matches. Press Enter to leave open.
          </div>
        ) : candidates.map((tm, i) => {
          const active = i === cursor;
          const initials = tm.name.split(/[. ]/).filter(Boolean).map(s => s[0]).join('').slice(0,2).toUpperCase();
          const poolColor = tm.pool === 'AM' ? '#43A047' : tm.pool === 'PM' ? '#FB8C00' : '#9CA3AF';
          return (
            <button
              key={tm.id}
              onClick={() => onAssign(tm)}
              onMouseEnter={() => setCursor(i)}
              style={{
                width:'100%', textAlign:'left',
                display:'flex', alignItems:'center', gap:9,
                padding: '6px 8px', borderRadius: 9, margin: '1px 0',
                background: active ? `linear-gradient(90deg, ${accent}33, ${accent}10)` : 'transparent',
                border: active ? `1px solid ${accent}55` : '1px solid transparent',
                cursor:'pointer', transition: 'background 0.1s',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: 'linear-gradient(135deg, #3A3A3C, #1C1C1E)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#E5E5E7', fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative', flexShrink: 0,
              }}>
                {initials}
                {tm.pool !== 'Full' && (
                  <span style={{ position: 'absolute', bottom: -1, right: -1, width: 7, height: 7, borderRadius: 4, background: poolColor, border: '1px solid #1C1C1E' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#F2F2F4', letterSpacing: '-0.15px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tm.name}</div>
                <div style={{ fontSize: 10, color: '#8E8E93', fontFamily: 'JetBrains Mono, monospace', marginTop: 1 }}>
                  {tm.hours} · {tm.pool}
                  {tm.slot && <span style={{ color: '#FF9F0A', marginLeft: 6 }}>at {tm.slot}</span>}
                </div>
              </div>
              {active && (
                <span style={{ fontSize: 9.5, color: accent, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>↵</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer hint */}
      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between',
        fontSize: 10, color: '#6C6C72', fontFamily: 'JetBrains Mono, monospace',
      }}>
        <span>↑↓ navigate · ↵ assign</span>
        <button onClick={onOpenInspector} style={{ fontSize: 10, color: '#9CA3AF', fontFamily: 'inherit', cursor: 'pointer' }}>
          Full inspector →
        </button>
      </div>
    </div>
  );
});

Object.assign(window, { InlineComposer });
