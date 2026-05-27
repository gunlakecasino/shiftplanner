// sb-cards.jsx — Production-fidelity card components for ZDS ShiftBuilder
// Matched pixel-for-pixel against zds.glcrops.cloud screenshots.
// React.memo on all leaves. ARIA throughout.

// ─── Primitives ───────────────────────────────────────────────────────────────

// Outlined italic numeral (the giant date "31" in the header)
// Uses SVG so it renders reliably regardless of html2canvas / webkit-text-stroke quirks.
const OutlinedNumeral = React.memo(function OutlinedNumeral({ value, size = 92, color = '#C7C7CC', stroke = 2 }) {
  const text = String(value);
  // Approximate width: italic numerals are about 0.6x font-size each
  const w = Math.max(text.length * size * 0.62, size * 0.62);
  const h = size * 1.0;
  return (
    <svg
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'inline-block', flexShrink: 0 }}
      aria-hidden="true"
    >
      <text
        x={w / 2}
        y={h * 0.85}
        textAnchor="middle"
        fontFamily="Bricolage Grotesque, Atkinson Hyperlegible, system-ui"
        fontSize={size}
        fontWeight={900}
        fontStyle="italic"
        letterSpacing={-3}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        paintOrder="stroke"
      >{text}</text>
    </svg>
  );
});

// Solid italic numeral (column "1/2/3" headers in break sheet)
const SolidNumeral = React.memo(function SolidNumeral({ value, size = 44, color = '#111' }) {
  return (
    <span style={{
      fontFamily: 'Bricolage Grotesque, Atkinson Hyperlegible, system-ui',
      fontSize: size, fontWeight: 900, fontStyle: 'italic',
      lineHeight: 0.85, letterSpacing: '-2px',
      color, display: 'inline-block',
    }}>{value}</span>
  );
});

// Detect if a task is a sweep/route (contains " / " — gets accent highlight)
function isSweepTask(t) {
  return typeof t === 'string' && /\s\/\s/.test(t);
}
function isAndZoneTask(t) {
  return typeof t === 'string' && /^[Aa]nd\s+[Zz]one?\s+\w+/i.test(t);
}

// Parse "And Zone N" from tasks → banner metadata
function parseAndZone(tasks) {
  if (!tasks?.length) return null;
  for (const t of tasks) {
    const m = String(t).match(/^[Aa]nd\s+[Zz]one\s*(\d+)/);
    if (m) {
      const key = `Z${m[1]}`;
      const accent = SB_TOKENS.zoneColor[key] || '#6B7280';
      return { label: `AND ZONE ${m[1]}`, accent };
    }
    const m2 = String(t).match(/^[Aa]nd\s+(Z\w+)/i);
    if (m2) {
      const key = m2[1].toUpperCase();
      const accent = SB_TOKENS.zoneColor[key] || SB_TOKENS.auxColor[key] || '#6B7280';
      return { label: `AND ${key}`, accent };
    }
  }
  return null;
}

// Break badge — refined geometry: gradient depth, soft shadow, smoother corners
const SbBreakBadge = React.memo(function SbBreakBadge({ value }) {
  const isOff = !value;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 22, height: 17, padding: '0 5px',
      fontSize: 10.5, fontWeight: 800,
      background: isOff
        ? 'linear-gradient(180deg, #D1D1D6, #C2C2C7)'
        : 'linear-gradient(180deg, #2A2A2D, #1A1A1C)',
      color: '#fff',
      borderRadius: 4,
      letterSpacing: '-0.2px',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      flexShrink: 0,
      lineHeight: 1,
      boxShadow: isOff
        ? 'inset 0 0.5px 0 rgba(255,255,255,0.5), inset 0 -0.5px 0 rgba(0,0,0,0.05), 0 1px 1px rgba(0,0,0,0.04)'
        : 'inset 0 0.5px 0 rgba(255,255,255,0.10), inset 0 -0.5px 0 rgba(0,0,0,0.25), 0 1px 1px rgba(0,0,0,0.12)',
      textShadow: isOff ? 'none' : '0 0.5px 0 rgba(0,0,0,0.3)',
    }}>
      {isOff ? '–' : value}
    </span>
  );
});

// Sweep/route task — amber band with left bar (matches "Sweep 5 / 8 / HL")
const SweepBand = React.memo(function SweepBand({ text }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      background: 'linear-gradient(90deg, #FFF8EC 0%, #FFFDF7 100%)',
      borderRadius: 2,
      padding: '2px 6px 2px 0',
      marginTop: 1,
    }}>
      <span style={{
        width: 3, alignSelf: 'stretch',
        background: '#E0A040',
        marginRight: 6, flexShrink: 0,
        minHeight: 14,
      }} />
      <span style={{
        fontSize: 12, color: '#5F4515', fontWeight: 500,
        letterSpacing: '0.1px', lineHeight: 1.3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{text}</span>
    </div>
  );
});

// Plain task line
const PlainTask = React.memo(function PlainTask({ text }) {
  return (
    <div style={{
      fontSize: 12, color: '#3C3C43',
      letterSpacing: '0.05px', lineHeight: 1.35,
      display: 'block',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }}>{text}</div>
  );
});

// Bottom "AND ZONE X" banner
const AndBanner = React.memo(function AndBanner({ label, accent }) {
  return (
    <div style={{
      height: 22, background: accent,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <span style={{
        fontSize: 9.5, fontWeight: 800, color: '#fff',
        letterSpacing: '1.2px', textTransform: 'uppercase',
        fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      }}>{label}</span>
    </div>
  );
});

// ─── Zone Card ────────────────────────────────────────────────────────────────

const ZoneCard = React.memo(function ZoneCard({
  slotKey, accent, icon, label,
  badge, tmName, tasks, location,
  empty, selected, isDropTarget, hasConflict, stagedTmName,
  onClick, height = 140,
}) {
  const hasName = !!tmName && !empty;
  const taskList = (tasks || []).filter(t => !isAndZoneTask(t));

  return (
    <button
      onClick={(e) => onClick?.(e)}
      aria-label={`${label}: ${hasName ? tmName : 'Unassigned'}. Break group ${badge || 'none'}.`}
      aria-pressed={selected}
      data-comment-anchor={`slot-${slotKey}`}
      style={{
        position: 'relative',
        width: '100%', height,
        background: isDropTarget ? `${accent}0A` : empty ? '#F5F5F7' : '#FFFFFF',
        border: isDropTarget
          ? `1.5px dashed ${accent}`
          : hasConflict
          ? '1.5px solid #E53935'
          : selected
          ? `1px solid ${accent}`
          : empty
          ? '1px dashed #C7C7CC'
          : '1px solid #D8D8DC',
        borderRadius: 4, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: hasConflict
          ? '0 0 0 3px rgba(229,57,53,0.18), 0 4px 14px -4px rgba(229,57,53,0.35)'
          : selected
          ? `0 0 0 2px ${accent}33, 0 4px 14px -4px ${accent}33`
          : isDropTarget
          ? `0 0 16px -4px ${accent}88`
          : 'none',
        cursor: 'pointer', textAlign: 'left', padding: 0,
        transition: 'box-shadow 0.12s, border-color 0.12s, background 0.12s',
        animation: isDropTarget ? 'sb-pulse 1.4s ease-in-out infinite' : 'none',
        fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      }}
    >
      {/* Conflict pip — small red dot top-right */}
      {hasConflict && (
        <span style={{
          position:'absolute', top:6, right:6, zIndex:2,
          width:8, height:8, borderRadius:'50%',
          background:'#E53935', boxShadow:'0 0 0 2px #fff, 0 0 6px rgba(229,57,53,0.45)',
        }} aria-label="Conflict: TM placed in multiple slots" />
      )}

      {/* 3px accent top bar */}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      {/* Header row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px',
        borderBottom: `1px solid ${accent}1A`,
        minHeight: 22, flexShrink: 0,
        background: empty ? 'transparent' : '#FFFFFF',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: accent, lineHeight: 1 }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{label}</span>
        </div>
        <SbBreakBadge value={badge} />
      </div>

      {/* Card body */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        padding: '7px 9px 8px', minHeight: 0, overflow: 'hidden',
      }}>
        {/* Name (top section) */}
        {hasName ? (
          <span style={{
            fontSize: 28, fontWeight: 800, color: '#111',
            letterSpacing: '-0.6px', lineHeight: 1.0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'block',
          }}>{tmName}</span>
        ) : isDropTarget ? (
          <span style={{ fontSize: 13, color: accent, fontWeight: 700, fontStyle: 'italic', lineHeight: 1.3 }}>
            ↳ {stagedTmName}
          </span>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF', letterSpacing: '0.2px', lineHeight: 1.3, display: 'block' }}>
            — Unassigned —
          </span>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Tasks + location stacked at bottom */}
        {!isDropTarget && (taskList.length > 0 || location) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {taskList.map((t, i) =>
              isSweepTask(t)
                ? <SweepBand key={i} text={t} />
                : <PlainTask key={i} text={t} />
            )}
            {location && hasName && taskList.length === 0 && (
              <span style={{ fontSize: 12, color: '#6C6C72', letterSpacing: '0.05px', lineHeight: 1.35 }}>
                {location}
              </span>
            )}
          </div>
        )}

        {/* Location-only when no name */}
        {!hasName && !isDropTarget && location && taskList.length === 0 && (
          <span style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: '0.05px', lineHeight: 1.35, marginTop: 'auto' }}>
            {location}
          </span>
        )}
      </div>
    </button>
  );
});

// ─── Restroom Card ────────────────────────────────────────────────────────────

const RRSide = React.memo(function RRSide({
  label, assign, accent, isSelected, isDropTarget, stagedTmName, onClick,
}) {
  const has = !!assign?.tmName;
  const showGhost = isDropTarget && !has;
  // Restroom tasks: each rendered as a plain location line; sweep gets the band
  const taskList = (assign?.tasks || []).filter(t => !isAndZoneTask(t));

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      aria-label={`${label}: ${has ? assign.tmName : 'Unassigned'}`}
      aria-pressed={isSelected}
      style={{
        background: showGhost ? `${accent}0A` : '#fff',
        padding: '5px 7px 7px', width: '100%', textAlign: 'left',
        cursor: 'pointer', fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
        border: isSelected ? `1.5px solid ${accent}` : isDropTarget ? `1.5px dashed ${accent}` : 'none',
        borderRadius: 2,
        outline: 'none', transition: 'background 0.1s',
        overflow: 'hidden', height: '100%',
        display: 'flex', flexDirection: 'column', minWidth: 0,
      }}
    >
      {/* MEN'S / WOMEN'S label + break badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.8px', color: '#6C6C72', textTransform: 'uppercase', flexShrink: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <SbBreakBadge value={assign?.breakGroup} />
      </div>

      {/* Name */}
      {showGhost ? (
        <span style={{ fontSize: 12, color: accent, fontWeight: 700, fontStyle: 'italic' }}>↳ {stagedTmName}</span>
      ) : has ? (
        <span style={{ fontSize: 19, fontWeight: 800, color: '#111', letterSpacing: '-0.3px', lineHeight: 1.0, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {assign.tmName}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: '#9CA3AF', letterSpacing: '0.2px', fontWeight: 500 }}>— Unassigned —</span>
      )}

      <div style={{ flex: 1 }} />

      {/* Tasks at bottom */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {taskList.map((t, i) =>
          isSweepTask(t)
            ? <SweepBand key={i} text={t} />
            : (
              <span key={i} style={{ fontSize: 11, color: '#3C3C43', lineHeight: 1.35, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t}</span>
            )
        )}
      </div>
    </button>
  );
});

const RestroomCard = React.memo(function RestroomCard({
  def, mA, wA,
  selectedKey, onSideClick,
  isDropTargetM, isDropTargetW, stagedTmName,
  focused, height = 200,
}) {
  const accent = SB_TOKENS.rrColor[def.num];
  const icon   = SB_TOKENS.rrIcon[def.num];
  const mKey   = `MRR${def.num}`;
  const wKey   = `WRR${def.num}`;

  const andZone = parseAndZone([...(mA?.tasks || []), ...(wA?.tasks || [])]);

  return (
    <div
      data-comment-anchor={`rr-${def.num}`}
      style={{
        position: 'relative',
        background: '#FFFFFF',
        border: `1px solid ${focused ? accent : '#D8D8DC'}`,
        borderRadius: 4, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        height,
        boxShadow: focused ? `0 0 0 1.5px ${accent}66` : 'none',
        fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      }}
    >
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />

      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '4px 8px', borderBottom: `1px solid ${accent}1A`, color: accent, lineHeight: 1,
        flexShrink: 0, minHeight: 22,
      }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{def.label}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1 }}>
        <div style={{ borderRight: '1px solid #F2F2F4' }}>
          <RRSide
            label="MEN'S" assign={mA} accent={accent}
            isSelected={selectedKey === mKey}
            isDropTarget={isDropTargetM}
            stagedTmName={stagedTmName}
            onClick={(e) => onSideClick(mKey, e)}
          />
        </div>
        <div>
          <RRSide
            label="WOMEN'S" assign={wA} accent={accent}
            isSelected={selectedKey === wKey}
            isDropTarget={isDropTargetW}
            stagedTmName={stagedTmName}
            onClick={(e) => onSideClick(wKey, e)}
          />
        </div>
      </div>

      {andZone && <AndBanner label={andZone.label} accent={andZone.accent} />}
    </div>
  );
});

// ─── Auxiliary Card ───────────────────────────────────────────────────────────

const AuxCard = React.memo(function AuxCard({
  slotKey, accent, icon, label,
  badge, tmName, tasks, empty,
  selected, isDropTarget, hasConflict, stagedTmName,
  onClick, height = 140,
}) {
  const hasName = !!tmName && !empty;
  const taskList = (tasks || []).filter(t => !isAndZoneTask(t));

  return (
    <button
      onClick={(e) => onClick?.(e)}
      aria-label={`${label}: ${hasName ? tmName : 'Unassigned'}. Break group ${badge || 'none'}.`}
      aria-pressed={selected}
      data-comment-anchor={`slot-${slotKey}`}
      style={{
        position: 'relative',
        width: '100%', height,
        background: isDropTarget ? `${accent}0A` : empty ? '#F5F5F7' : '#FFFFFF',
        border: isDropTarget
          ? `1.5px dashed ${accent}`
          : hasConflict ? '1.5px solid #E53935'
          : selected ? `1px solid ${accent}`
          : empty ? '1px dashed #C7C7CC' : '1px solid #D8D8DC',
        borderRadius: 4, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: hasConflict
          ? '0 0 0 3px rgba(229,57,53,0.18), 0 4px 14px -4px rgba(229,57,53,0.35)'
          : selected ? `0 0 0 2px ${accent}33, 0 4px 14px -4px ${accent}33` : 'none',
        cursor: 'pointer', textAlign: 'left', padding: 0,
        transition: 'box-shadow 0.12s, border-color 0.12s',
        animation: isDropTarget ? 'sb-pulse 1.4s ease-in-out infinite' : 'none',
        fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      }}
    >
      {hasConflict && (
        <span style={{
          position:'absolute', top:6, right:6, zIndex:2,
          width:8, height:8, borderRadius:'50%',
          background:'#E53935', boxShadow:'0 0 0 2px #fff, 0 0 6px rgba(229,57,53,0.45)',
        }} aria-label="Conflict" />
      )}
      <div style={{ height: 3, background: accent, flexShrink: 0 }} />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 8px', borderBottom: `1px solid ${accent}1A`, minHeight: 22, flexShrink: 0,
        background: empty ? 'transparent' : '#FFFFFF',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: accent }}>
          <span style={{ fontSize: 12, lineHeight: 1 }}>{icon}</span>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase' }}>{label}</span>
        </div>
        <SbBreakBadge value={badge} />
      </div>
      <div style={{ flex: 1, padding: '7px 9px 8px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {hasName ? (
          <span style={{ fontSize: 26, fontWeight: 800, color: '#111', letterSpacing: '-0.5px', lineHeight: 1.0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tmName}
          </span>
        ) : isDropTarget ? (
          <span style={{ fontSize: 13, color: accent, fontWeight: 700, fontStyle: 'italic' }}>↳ {stagedTmName}</span>
        ) : (
          <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.2px' }}>— Unassigned —</span>
        )}
        <div style={{ flex: 1 }} />
        {!isDropTarget && taskList.map((t, i) =>
          isSweepTask(t)
            ? <SweepBand key={i} text={t} />
            : <PlainTask key={i} text={t} />
        )}
      </div>
    </button>
  );
});

// ─── Section Header ───────────────────────────────────────────────────────────

const SbSectionHeader = React.memo(function SbSectionHeader({ label, count, total }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      margin: '8px 0 5px',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', color: '#3C3C43', flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, height: 1, background: '#E5E5E7' }} />
      <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3C3C43', letterSpacing: '0.6px', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {count} / {total} FILLED
      </span>
    </div>
  );
});

// ─── Break Sheet Components ───────────────────────────────────────────────────

// Outlined slot-key badge pill (used in break sheet column rows)
const SlotKeyBadge = React.memo(function SlotKeyBadge({ slotKey, accent }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 4,
      border: `1.2px solid ${accent}`,
      color: accent, background: '#FFFFFF',
      fontSize: 10, fontWeight: 800, letterSpacing: '0.5px',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1.15,
      textTransform: 'uppercase',
    }}>{slotKey}</span>
  );
});

// M / W indicator (gray small letter after RR badge)
const SideDot = React.memo(function SideDot({ side }) {
  return (
    <span style={{
      fontSize: 11, color: '#9CA3AF', fontWeight: 600,
      flexShrink: 0, marginLeft: 4,
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>{side}</span>
  );
});

// A single person row in a break column — with dashed leader line
const BreakPersonRow = React.memo(function BreakPersonRow({ name, slotKey, accent, side }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '4px 0',
      gap: 4,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#111', letterSpacing: '-0.1px', whiteSpace: 'nowrap', fontFamily: 'Atkinson Hyperlegible, Inter, system-ui', flexShrink: 0 }}>
        {name}
      </span>
      {/* Dashed leader line */}
      <span style={{
        flex: 1, height: 0,
        borderTop: '1px dashed #C7C7CC',
        margin: '0 4px',
        minWidth: 8,
      }} />
      <SlotKeyBadge slotKey={slotKey} accent={accent || '#6B7280'} />
      {side && <SideDot side={side} />}
    </div>
  );
});

// A sub-section within a break column (ZONES / RESTROOMS / AUXILIARY)
const BreakSubSection = React.memo(function BreakSubSection({ label, rows }) {
  if (!rows?.length) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '1.4px', textTransform: 'uppercase', color: '#9CA3AF', padding: '6px 0 2px', fontFamily: 'Atkinson Hyperlegible, Inter, system-ui' }}>
        {label}
      </div>
      {rows.map((r, i) => (
        <BreakPersonRow key={i} name={r.name} slotKey={r.slotKey} accent={r.accent} side={r.side} />
      ))}
    </div>
  );
});

// Full break column — BREAK 1 / 2 / 3
const BreakColumn = React.memo(function BreakColumn({ num, assignments, accent }) {
  const headerAccent = accent || ['#111111', '#6C6C72', '#C7C7CC'][num - 1];

  const zoneRows = SB_ZONES
    .filter(z => assignments[z.key]?.tmName && assignments[z.key]?.breakGroup === num)
    .map(z => ({
      name: assignments[z.key].tmName,
      slotKey: z.label,
      accent: SB_TOKENS.zoneColor[z.key],
    }));

  const rrRows = [];
  SB_RR.forEach(rr => {
    const mA = assignments[`MRR${rr.num}`];
    const wA = assignments[`WRR${rr.num}`];
    if (mA?.tmName && mA.breakGroup === num) {
      rrRows.push({ name: mA.tmName, slotKey: `${rr.label} M`, accent: SB_TOKENS.rrColor[rr.num], side: 'M' });
    }
    if (wA?.tmName && wA.breakGroup === num) {
      rrRows.push({ name: wA.tmName, slotKey: `${rr.label} W`, accent: SB_TOKENS.rrColor[rr.num], side: 'W' });
    }
  });

  const auxRows = SB_AUX
    .filter(a => assignments[a.key]?.tmName && assignments[a.key]?.breakGroup === num)
    .map(a => ({
      name: assignments[a.key].tmName,
      slotKey: a.label,
      accent: SB_TOKENS.auxColor[a.key] || '#6B7280',
    }));

  const total = zoneRows.length + rrRows.length + auxRows.length;

  return (
    <div style={{
      flex: 1, minWidth: 0,
      border: '1px solid #E5E5E7',
      borderTop: `3px solid ${headerAccent}`,
      borderRadius: 4,
      overflow: 'hidden',
      background: '#fff',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>
      {/* Column header */}
      <div style={{
        padding: '12px 14px 8px',
        display: 'flex', alignItems: 'baseline', gap: 10,
      }}>
        <SolidNumeral value={num} size={40} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#111', letterSpacing: '0.4px', textTransform: 'uppercase' }}>BREAK {num}</span>
          <span style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{total} people</span>
        </div>
      </div>
      {/* Rows */}
      <div style={{ padding: '0 14px 12px' }}>
        <BreakSubSection label="Zones" rows={zoneRows} />
        <BreakSubSection label="Restrooms" rows={rrRows} />
        <BreakSubSection label="Auxiliary" rows={auxRows} />
        {total === 0 && (
          <span style={{ fontSize: 11, color: '#C7C7CC', fontStyle: 'italic' }}>No assignments in this group</span>
        )}
      </div>
    </div>
  );
});

// ─── Overlap Cell ─────────────────────────────────────────────────────────────

const OverlapCell = React.memo(function OverlapCell({
  fullKey, assign, description,
  selected, isDropTarget, stagedTmName, onClick,
}) {
  const has = !!assign?.tmName;
  const showGhost = isDropTarget && !has;
  return (
    <button
      onClick={onClick}
      aria-label={`${fullKey}: ${has ? assign.tmName : 'Open'}`}
      aria-pressed={selected}
      data-comment-anchor={`slot-${fullKey}`}
      style={{
        background: showGhost ? 'rgba(184,151,8,0.06)' : has ? '#fff' : '#FAFAFA',
        border: isDropTarget ? '1.5px dashed #B89708' : selected ? '1.5px solid #1976D2' : '1px solid #E5E5E7',
        borderRadius: 4,
        padding: '7px 10px',
        display: 'flex', flexDirection: 'column', gap: 2,
        minHeight: 50, width: '100%', textAlign: 'left', cursor: 'pointer',
        boxShadow: selected ? '0 0 0 1px #1976D266' : 'none',
        fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
        transition: 'all 0.12s',
      }}
    >
      {showGhost ? (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#B89708', fontStyle: 'italic' }}>↳ {stagedTmName}</span>
      ) : has ? (
        <span style={{ fontSize: 15, fontWeight: 800, color: '#111', letterSpacing: '-0.2px', lineHeight: 1.0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assign.tmName}</span>
      ) : (
        <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500, letterSpacing: '0.2px' }}>— Unassigned —</span>
      )}
      {description && (
        <span style={{ fontSize: 11, color: has ? '#3C3C43' : '#9CA3AF', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {description}
        </span>
      )}
    </button>
  );
});

const OverlapTimeRow = React.memo(function OverlapTimeRow({
  timeLabel, slotKeys, assignments, selectedKey, isDropTargetFn, stagedTmName, onCellClick,
}) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '4px 0', alignItems: 'stretch' }}>
      <div style={{
        width: 56, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
        padding: '0 6px',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6C6C72', letterSpacing: '0.2px', fontFamily: 'Atkinson Hyperlegible, Inter, system-ui' }}>
          {timeLabel}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 5, flex: 1 }}>
        {slotKeys.map(k => (
          <OverlapCell
            key={k}
            fullKey={k}
            assign={assignments[k]}
            description={(typeof SB_OVERLAP_DESCRIPTIONS !== 'undefined') ? SB_OVERLAP_DESCRIPTIONS[k] : null}
            selected={selectedKey === k}
            isDropTarget={isDropTargetFn?.(k)}
            stagedTmName={stagedTmName}
            onClick={() => onCellClick?.(k)}
          />
        ))}
      </div>
    </div>
  );
});

Object.assign(window, {
  SbBreakBadge, ZoneCard, RestroomCard, AuxCard,
  SbSectionHeader, OverlapCell, OverlapTimeRow,
  BreakColumn, SlotKeyBadge,
  OutlinedNumeral, SolidNumeral, SweepBand, AndBanner,
  parseAndZone, isSweepTask, isAndZoneTask,
});
