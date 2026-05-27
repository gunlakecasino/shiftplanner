// sb-sheet.jsx — Layout orchestrator for the ZDS deployment paper.
// Card rendering delegated to sb-cards.jsx.
// Matched pixel-for-pixel against zds.glcrops.cloud screenshots.

// ─── Header sub-pieces ────────────────────────────────────────────────────────

// Break distribution dots: 3 dark circles with counts (matches "BREAKS [4][8][4]")
function BreakDots({ assignments }) {
  const counts = [0, 0, 0];
  const allSlots = [
    ...SB_ZONES.map(z => z.key),
    ...SB_RR.flatMap(rr => [`MRR${rr.num}`, `WRR${rr.num}`]),
    ...SB_AUX.map(a => a.key),
  ];
  allSlots.forEach(k => {
    const g = assignments[k]?.breakGroup;
    if (g >= 1 && g <= 3) counts[g - 1]++;
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {counts.map((c, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(180deg, #2C2C2E 0%, #1A1A1C 100%)',
          color: '#fff',
          fontSize: 11, fontWeight: 800,
          fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
          boxShadow: 'inset 0 0.5px 0 rgba(255,255,255,0.12), inset 0 -0.5px 0 rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.10)',
          textShadow: '0 0.5px 0 rgba(0,0,0,0.4)',
        }}>{c}</span>
      ))}
    </div>
  );
}

// Group pills: smooth rounded squares — active = day-color filled with depth, others outlined
function GroupPills({ dayColor, activeGroup = 1 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.8px', color: '#9CA3AF', textTransform: 'uppercase', marginRight: 4 }}>Group</span>
      {[1, 2, 3].map(n => {
        const active = n === activeGroup;
        return (
          <span key={n} style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 24, height: 24, borderRadius: 7,
            background: active ? `linear-gradient(180deg, ${dayColor}, ${dayColor}E0)` : '#FFFFFF',
            border: active ? 'none' : '1px solid #D8D8DC',
            color: active ? '#fff' : '#9CA3AF',
            fontSize: 11.5, fontWeight: 800,
            fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
            boxShadow: active
              ? `inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 -0.5px 0 rgba(0,0,0,0.18), 0 1px 2px ${dayColor}40`
              : 'inset 0 -0.5px 0 rgba(0,0,0,0.02)',
            textShadow: active ? '0 0.5px 0 rgba(0,0,0,0.18)' : 'none',
          }}>{n}</span>
        );
      })}
    </div>
  );
}

// Day pills row — refined: active is filled rounded-square with depth, inactive is just colored letter
function DayPillsRow({ dayIdx }) {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
      {SB_TOKENS.dayShort.map((d, i) => {
        const active = i === dayIdx;
        const c = SB_TOKENS.dayColor[i];
        return (
          <span key={i} style={{
            width: 22, height: 22, borderRadius: active ? 6 : 4,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11.5, fontWeight: 700, letterSpacing: '-0.2px',
            background: active ? `linear-gradient(180deg, ${c}, ${c}E0)` : 'transparent',
            color: active ? '#fff' : '#9CA3AF',
            fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
            boxShadow: active
              ? `inset 0 0.5px 0 rgba(255,255,255,0.18), inset 0 -0.5px 0 rgba(0,0,0,0.18), 0 1px 2px ${c}40`
              : 'none',
            textShadow: active ? '0 0.5px 0 rgba(0,0,0,0.18)' : 'none',
            transition: 'all 0.18s cubic-bezier(0.16,1,0.3,1)',
          }}>{d}</span>
        );
      })}
    </div>
  );
}

// Pill button (Undo / Redo)
function PillButton({ label, disabled }) {
  return (
    <button disabled={disabled} style={{
      padding: '5px 14px', borderRadius: 6,
      border: '1px solid #E5E5E7',
      background: '#FFFFFF',
      color: disabled ? '#C7C7CC' : '#6C6C72',
      fontSize: 11, fontWeight: 600,
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      cursor: disabled ? 'default' : 'pointer',
      letterSpacing: '0.1px',
    }}>{label}</button>
  );
}

// ─── Sheet Headers ────────────────────────────────────────────────────────────

function SheetHeaderDeployment({ dayIdx, dateNum, monthYear, assignments }) {
  const dayColor = SB_TOKENS.dayColor[dayIdx];
  const dayName  = SB_TOKENS.dayLong[dayIdx];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      paddingBottom: 10, borderBottom: '1px solid #E5E5E7',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>
      {/* Left — big outlined date + day name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <OutlinedNumeral value={dateNum} size={96} color="#C7C7CC" stroke={2.2} />
        <div style={{ paddingTop: 6 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: dayColor, letterSpacing: '-0.7px', lineHeight: 1, fontStyle: 'normal' }}>
            {dayName}
          </div>
          <div style={{ fontSize: 12, color: '#6C6C72', fontWeight: 500, letterSpacing: '0.1px', marginTop: 4 }}>
            {monthYear} · Day {dayIdx + 1} of 7
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: '#3C3C43', textTransform: 'uppercase' }}>Breaks</span>
            {assignments && <BreakDots assignments={assignments} />}
          </div>
        </div>
      </div>

      {/* Right */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <DayPillsRow dayIdx={dayIdx} />
        <GroupPills dayColor={dayColor} activeGroup={1} />
        <div style={{ display: 'flex', gap: 6 }}>
          <PillButton label="Undo" disabled />
          <PillButton label="Redo" disabled />
        </div>
      </div>
    </div>
  );
}

function SheetHeaderBreak({ dayIdx, dateNum, monthYear, assignments, inRotation }) {
  const dayColor = SB_TOKENS.dayColor[dayIdx];
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      paddingBottom: 10, borderBottom: '1px solid #E5E5E7',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <OutlinedNumeral value={dateNum} size={96} color="#C7C7CC" stroke={2.2} />
        <div style={{ paddingTop: 6 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: dayColor, letterSpacing: '-0.7px', lineHeight: 1 }}>
            Break Sheet
          </div>
          <div style={{ fontSize: 12, color: '#6C6C72', fontWeight: 500, letterSpacing: '0.1px', marginTop: 4 }}>
            {SB_TOKENS.dayLong[dayIdx]} · {monthYear}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#111', letterSpacing: '0.3px' }}>{inRotation}</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: '#3C3C43', textTransform: 'uppercase' }}>In Rotation</span>
            <span style={{ width: 1, height: 12, background: '#E5E5E7' }} />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', color: '#3C3C43', textTransform: 'uppercase' }}>Breaks</span>
            {assignments && <BreakDots assignments={assignments} />}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#3C3C43', letterSpacing: '1.2px', textTransform: 'uppercase' }}>By Break Wave</span>
        <DayPillsRow dayIdx={dayIdx} />
        <div style={{ display: 'flex', gap: 6 }}>
          <PillButton label="Undo" disabled />
          <PillButton label="Redo" disabled />
        </div>
      </div>
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function SheetFooter({ pageNum, totalPages = 14 }) {
  return (
    <div style={{
      paddingTop: 7, borderTop: '1px solid #E5E5E7',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: 10.5, color: '#9CA3AF', letterSpacing: '0.1px',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
    }}>
      <span><strong style={{ color: '#3C3C43', fontWeight: 700 }}>OMS</strong> © Weekly Zone Deployment Book · <strong style={{ color: '#3C3C43', fontWeight: 700, letterSpacing: '1.5px' }}>GRAVES</strong></span>
      <span style={{ color: '#9CA3AF' }}>v3.4</span>
      <span>— {pageNum} of {totalPages} —</span>
    </div>
  );
}

// ─── Main deployment sheet ────────────────────────────────────────────────────

function DeploymentSheet({
  assignments = SB_ASSIGNMENTS,
  selectedKey, onCardClick,
  stagedTm, onDropTm,
  dayIdx = 5, dateNum = 5, monthYear = 'March 2026',
  stats, conflicts,
}) {
  const handleClick = (key, event) => {
    if (stagedTm && onDropTm) onDropTm(key, event);
    else onCardClick?.(key, event);
  };
  const isDropTarget = (key) => !!stagedTm && !assignments[key]?.tmName;
  const hasConflict = (key) => !!conflicts && conflicts.has(key);

  const zonesFilled = SB_ZONES.filter(z => assignments[z.key]?.tmName).length;
  const rrFilled    = SB_RR.reduce((n, rr) =>
    n + (assignments[`MRR${rr.num}`]?.tmName ? 1 : 0) + (assignments[`WRR${rr.num}`]?.tmName ? 1 : 0), 0);
  const auxFilled   = SB_AUX.filter(a => assignments[a.key]?.tmName).length;

  return (
    <div style={{
      width: SB_TOKENS.sheetW, height: SB_TOKENS.sheetH,
      background: '#FFFFFF',
      boxShadow: '0 0 0 1px #C8C8CC, 0 25px 80px -20px rgba(0,0,0,0.28), 0 12px 32px -10px rgba(0,0,0,0.18)',
      borderRadius: 4,
      overflow: 'hidden',
      padding: '14px 18px 10px',
      display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      flexShrink: 0,
    }}>
      <SheetHeaderDeployment dayIdx={dayIdx} dateNum={dateNum} monthYear={monthYear} assignments={assignments} />

      {/* ── ZONES ── */}
      <SbSectionHeader label="Zones" count={zonesFilled} total={10} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {SB_ZONES.map(z => {
          const a = assignments[z.key];
          return (
            <ZoneCard
              key={z.key}
              slotKey={z.key}
              accent={SB_TOKENS.zoneColor[z.key]}
              icon={SB_TOKENS.zoneIcon[z.key]}
              label={z.label}
              badge={a?.breakGroup}
              tmName={a?.tmName}
              tasks={a?.tasks}
              location={z.loc}
              empty={!a?.tmName}
              selected={selectedKey === z.key}
              isDropTarget={isDropTarget(z.key)}
              hasConflict={hasConflict(z.key)}
              stagedTmName={stagedTm?.name}
              onClick={(e) => handleClick(z.key, e)}
              height={130}
            />
          );
        })}
      </div>

      {/* ── RESTROOMS ── */}
      <SbSectionHeader label="Restrooms" count={rrFilled} total={10} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {SB_RR.map(rr => (
          <RestroomCard
            key={rr.num}
            def={rr}
            mA={assignments[`MRR${rr.num}`]}
            wA={assignments[`WRR${rr.num}`]}
            selectedKey={selectedKey}
            onSideClick={handleClick}
            isDropTargetM={isDropTarget(`MRR${rr.num}`)}
            isDropTargetW={isDropTarget(`WRR${rr.num}`)}
            hasConflictM={hasConflict(`MRR${rr.num}`)}
            hasConflictW={hasConflict(`WRR${rr.num}`)}
            stagedTmName={stagedTm?.name}
            height={138}
          />
        ))}
      </div>

      {/* ── AUXILIARY ── */}
      <SbSectionHeader label="Auxiliary" count={auxFilled} total={6} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {SB_AUX.map(ax => {
          const a = assignments[ax.key];
          return (
            <AuxCard
              key={ax.key}
              slotKey={ax.key}
              accent={SB_TOKENS.auxColor[ax.key] || '#6B7280'}
              icon={SB_TOKENS.auxIcon[ax.key]}
              label={ax.label}
              badge={a?.breakGroup}
              tmName={a?.tmName}
              tasks={a?.tasks}
              empty={!a?.tmName}
              selected={selectedKey === ax.key}
              isDropTarget={isDropTarget(ax.key)}
              hasConflict={hasConflict(ax.key)}
              stagedTmName={stagedTm?.name}
              onClick={(e) => handleClick(ax.key, e)}
              height={128}
            />
          );
        })}
      </div>

      {/* ── NOTES AND SIDE TASKS ── */}
      <div style={{ marginTop: 7, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', color: '#3C3C43', marginBottom: 5 }}>Notes and Side Tasks</div>
        <div style={{ flex: 1, border: '1px solid #E5E5E7', borderRadius: 3, background: '#FFFFFF', minHeight: 30 }} />
      </div>

      <SheetFooter pageNum={1 + dayIdx * 2} totalPages={14} />
    </div>
  );
}

// ─── Break Sheet ──────────────────────────────────────────────────────────────

function BreakSheet({ assignments, dayIdx, dateNum, monthYear }) {
  const inRotation = Object.values(assignments).filter(a => a?.tmName && a.breakGroup >= 1).length;
  const pmFilled   = SB_OVERLAPS.pm.filter(k => assignments[k]?.tmName).length;
  const amFilled   = SB_OVERLAPS.am.filter(k => assignments[k]?.tmName).length;

  return (
    <div style={{
      width: SB_TOKENS.sheetW, height: SB_TOKENS.sheetH,
      background: '#FFFFFF',
      boxShadow: '0 0 0 1px #C8C8CC, 0 25px 80px -20px rgba(0,0,0,0.28)',
      borderRadius: 4, overflow: 'hidden',
      padding: '18px 22px 12px',
      display: 'flex', flexDirection: 'column',
      boxSizing: 'border-box',
      fontFamily: 'Atkinson Hyperlegible, Inter, system-ui',
      flexShrink: 0,
    }}>
      <SheetHeaderBreak dayIdx={dayIdx} dateNum={dateNum} monthYear={monthYear} assignments={assignments} inRotation={inRotation} />

      {/* Break columns */}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        {[1, 2, 3].map(n => (
          <BreakColumn
            key={n}
            num={n}
            assignments={assignments}
            accent={['#111111', '#6C6C72', '#C7C7CC'][n - 1]}
          />
        ))}
      </div>

      {/* Push overlaps to bottom */}
      <div style={{ flex: 1, minHeight: 12 }} />

      {/* Overlaps */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '1.6px', textTransform: 'uppercase', color: '#3C3C43' }}>Overlaps</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3C3C43', letterSpacing: '0.6px' }}>{pmFilled + amFilled} / 12 FILLED</span>
        </div>
        <div style={{ borderTop: '1px solid #E5E5E7', paddingTop: 4 }}>
          <OverlapTimeRow timeLabel="11p – 1a" slotKeys={SB_OVERLAPS.pm} assignments={assignments} />
          <OverlapTimeRow timeLabel="5a – 7a"  slotKeys={SB_OVERLAPS.am} assignments={assignments} />
        </div>
      </div>

      <div style={{ marginTop: 6 }}>
        <SheetFooter pageNum={2 + dayIdx * 2} totalPages={14} />
      </div>
    </div>
  );
}

Object.assign(window, { DeploymentSheet, BreakSheet, SheetHeaderDeployment, SheetHeaderBreak, BreakDots, SheetFooter });
