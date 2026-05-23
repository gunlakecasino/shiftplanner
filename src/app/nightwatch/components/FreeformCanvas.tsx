'use client';

import { useState, useRef, useEffect } from 'react';
import type { Observation, CommittedStroke, ShiftMode } from '@/lib/nightwatch/types';

const CANVAS_W = 1500;
const CANVAS_H = 600;

interface DrawnStroke {
  id: string;
  d: string;
  color: string;
  w: number;
}

interface FreeformCanvasProps {
  strokes: CommittedStroke[];
  observations: Observation[];
  currentMin: number;
  mode: ShiftMode;
  selectedObsId: string | null;
  onSelectObs: (id: string | null) => void;
  onStrokeCommit?: (pathData: string, color: string, width: number) => void;
  inkColor: string;
  bgPattern: 'dots' | 'grid' | 'blank';
  showGuides: boolean;
  animateStrokes: boolean;
}

export default function FreeformCanvas({
  strokes, observations, mode,
  selectedObsId, onSelectObs, onStrokeCommit,
  inkColor, bgPattern, showGuides, animateStrokes,
}: FreeformCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef  = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState<DrawnStroke[]>([]);
  const [drawing, setDrawing] = useState<{ d: string; color: string; w: number } | null>(null);
  const [strokesVisible, setStrokesVisible] = useState(animateStrokes ? 0 : strokes.length);

  // Animate pre-baked strokes on mount
  useEffect(() => {
    if (!animateStrokes) { setStrokesVisible(strokes.length); return; }
    setStrokesVisible(0);
    let i = 0;
    const tick = () => {
      i++;
      setStrokesVisible(i);
      if (i < strokes.length) setTimeout(tick, 220);
    };
    setTimeout(tick, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use SVG's own coordinate transform so preserveAspectRatio slice offsets are handled correctly.
  const canvasPoint = (e: React.MouseEvent): { x: number; y: number } => {
    const svg = svgRef.current!;
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: svgPt.x, y: svgPt.y };
  };

  const startDraw = (e: React.MouseEvent) => {
    if (e.button !== 0 || mode !== 'live') return;
    const pt = canvasPoint(e);
    setDrawing({ d: `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, color: inkColor, w: 1.8 });
  };
  const moveDraw = (e: React.MouseEvent) => {
    if (!drawing) return;
    const pt = canvasPoint(e);
    setDrawing(d => d ? { ...d, d: d.d + ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}` } : null);
  };
  const endDraw = () => {
    if (!drawing || drawing.d.length < 10) { setDrawing(null); return; }
    setDrawn(prev => [...prev, { id: `u${Date.now()}`, ...drawing }]);
    onStrokeCommit?.(drawing.d, drawing.color, drawing.w);
    setDrawing(null);
  };

  const selectedObs = selectedObsId ? observations.find(o => o.id === selectedObsId) : null;

  return (
    <div
      className={`nw-canvas-wrap nw-canvas-bg-${bgPattern}`}
      ref={wrapRef}
      onClick={() => onSelectObs(null)}
    >
      {/* SVG layer */}
      <svg
        ref={svgRef}
        className="nw-canvas-svg"
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid slice"
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
      >
        <defs>
          <filter id="ink-blur" x="-2%" y="-2%" width="104%" height="104%">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>

        {/* Guide lines */}
        {showGuides && (
          <g>
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i}
                x1={(i / 8) * CANVAS_W} y1={0}
                x2={(i / 8) * CANVAS_W} y2={CANVAS_H}
                stroke="rgba(48,178,255,0.06)" strokeWidth="1"
              />
            ))}
          </g>
        )}

        {/* Pre-baked strokes */}
        <g filter="url(#ink-blur)">
          {strokes.slice(0, strokesVisible).map((s, idx) => (
            <path
              key={s.id}
              d={s.pathData}
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              className={animateStrokes ? 'nw-stroke nw-stroke--animate' : 'nw-stroke'}
              style={animateStrokes ? {
                ['--stroke-len' as string]: '600px',
                ['--stroke-delay' as string]: `${idx * 0.05}s`,
              } : undefined}
            />
          ))}
          {/* User-drawn strokes */}
          {drawn.map(s => (
            <path key={s.id} d={s.d} stroke={s.color} strokeWidth={s.w}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {drawing && (
            <path d={drawing.d} stroke={drawing.color} strokeWidth={drawing.w}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          )}
        </g>

        {/* Handwritten labels */}
        <g style={{ pointerEvents: 'none' }}>
          <text x={920} y={195} className="nw-hand" fill="#FFD60A">SPIKE</text>
          <text x={905} y={222} className="nw-hand nw-hand--sm" fill={inkColor}>bills sticky?</text>
          <text x={680} y={460} className="nw-hand nw-hand--sm" fill={inkColor}>handoff</text>
          <text x={295} y={388} className="nw-hand nw-hand--sm" fill={inkColor}>RR-7 W open</text>
          <text x={830} y={388} className="nw-hand nw-hand--sm" fill={inkColor}>count drop ✓</text>
        </g>
      </svg>

      {/* Observation stamps */}
      <div className="nw-stamps">
        {observations.map(o => (
          <button
            key={o.id}
            className={`nw-stamp is-${o.urgency}${selectedObsId === o.id ? ' is-selected' : ''}`}
            style={{ left: `${(o.x / CANVAS_W) * 100}%`, top: `${(o.y / CANVAS_H) * 100}%` }}
            onClick={e => { e.stopPropagation(); onSelectObs(o.id); }}
          >
            <span className="nw-stamp-time">{o.ts}</span>
            <span className="nw-stamp-pin" />
          </button>
        ))}
      </div>

      {/* Selected obs bubble */}
      {selectedObs && (() => {
        const leftPct = (selectedObs.x / CANVAS_W) * 100;
        const topPct  = (selectedObs.y / CANVAS_H) * 100;
        const isRight = leftPct < 60;
        return (
          <div
            className={`nw-obs-bubble ${isRight ? 'is-right' : 'is-left'}`}
            style={{ left: `${leftPct}%`, top: `${topPct}%` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="nw-obs-bubble-head">
              <span className="nw-eyebrow">{selectedObs.ts} · {selectedObs.urgency.toUpperCase()}</span>
              <span className="nw-obs-author">RA</span>
              <button className="nw-obs-close" onClick={() => onSelectObs(null)} aria-label="Close">×</button>
            </div>
            <div className="nw-obs-bubble-text">{selectedObs.text}</div>
            {selectedObs.linkedEntityType && (
              <div className="nw-obs-link">
                <span className="nw-eyebrow">LINKED</span>
                <span className="nw-obs-link-chip">
                  {selectedObs.linkedEntityType === 'zone' ? `Zone ${selectedObs.linkedEntityId}` :
                   selectedObs.linkedEntityType === 'tm'   ? `TM ${selectedObs.linkedEntityId}`   :
                   `RR ${selectedObs.linkedEntityId}`}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Mode overlay */}
      {mode !== 'live' && (
        <div className={`nw-mode-overlay is-${mode}`}>
          <span className="nw-eyebrow">
            {mode === 'past' ? 'ARCHIVED · READ-ONLY' : 'FUTURE · PLANNING VIEW'}
          </span>
        </div>
      )}

      {/* Clear strokes control */}
      {drawn.length > 0 && (
        <button className="nw-canvas-clear" onClick={e => { e.stopPropagation(); setDrawn([]); }}>
          Clear my strokes ({drawn.length})
        </button>
      )}

      {/* Canvas hint */}
      <div className="nw-canvas-hint">
        <span className="nw-eyebrow">FREEFORM CANVAS</span>
        <span className="nw-canvas-hint-meta">
          Drag with mouse to draw · Apple Pencil pressure on iPad · Long-hover to drop a stamp
        </span>
      </div>
    </div>
  );
}
