'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { Observation, CommittedStroke, ShiftMode } from '@/lib/nightwatch/types';

const CANVAS_W = 1500;
const CANVAS_H  = 600;
const PEN_W_MIN = 1.2;
const PEN_W_MAX = 3.8;
const MOUSE_W   = 1.8;
const ERASER_R  = 28; // SVG-coordinate hit radius for eraser

// ── Pressure ─────────────────────────────────────────────────
function pressureToWidth(p: number) {
  return Math.max(PEN_W_MIN, Math.min(PEN_W_MAX, p * 4));
}

// ── Path hit-test (eraser) ────────────────────────────────────
// Parses "M x y L x y …" and tests whether any sampled point
// is within `radius` of (px, py) in SVG coordinate space.
function pathHit(d: string, px: number, py: number, radius: number): boolean {
  const tokens = d.trim().split(/\s+/);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === 'M' || tokens[i] === 'L') {
      const x = parseFloat(tokens[++i]);
      const y = parseFloat(tokens[++i]);
      if (!isNaN(x) && !isNaN(y) && Math.hypot(x - px, y - py) <= radius) return true;
    }
  }
  return false;
}

// ── usePencilHover ────────────────────────────────────────────
function usePencilHover(onLongHover?: () => void, delay = 3500) {
  const [isPenHovering, setIsPenHovering] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const penHandlers = {
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      setIsPenHovering(true);
      if (e.buttons === 0 && onLongHover) {
        clearTimer();
        timerRef.current = setTimeout(onLongHover, delay);
      }
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      setIsPenHovering(false);
      clearTimer();
    },
    onPointerCancel: (e: React.PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      setIsPenHovering(false);
      clearTimer();
    },
  };

  return { isPenHovering, penHandlers, clearTimer };
}

// ── Types ─────────────────────────────────────────────────────

type Tool = 'draw' | 'erase';

interface DrawnStroke {
  id: string;       // local session ID
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
  onStrokeCommit?: (pathData: string, color: string, width: number) => Promise<string | null>;
  onEraseDbStroke?: (id: string) => void;   // parent removes one DB stroke
  onClearStrokes?: () => void;              // parent deletes all DB strokes for this night
  onLongHoverCanvas?: () => void;
  inkColor: string;
  bgPattern: 'dots' | 'grid' | 'blank';
  showGuides: boolean;
  animateStrokes: boolean;
}

export default function FreeformCanvas({
  strokes, observations, mode,
  selectedObsId, onSelectObs,
  onStrokeCommit, onEraseDbStroke, onClearStrokes, onLongHoverCanvas,
  inkColor, bgPattern, showGuides, animateStrokes,
}: FreeformCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef  = useRef<SVGSVGElement>(null);

  const [tool, setTool]       = useState<Tool>('draw');
  const [drawn, setDrawn]     = useState<DrawnStroke[]>([]);
  const [drawing, setDrawing] = useState<{ d: string; color: string; w: number } | null>(null);
  const [strokesVisible, setStrokesVisible] = useState(animateStrokes ? 0 : strokes.length);
  const [hoveredStampId, setHoveredStampId] = useState<string | null>(null);
  const [eraserPos, setEraserPos]           = useState<{ x: number; y: number } | null>(null);

  // Maps session local ID → DB UUID once saved (for undo/erase)
  const dbIdMap = useRef<Map<string, string>>(new Map());

  // ── Animate strokes in when they load ──────────────────────
  useEffect(() => {
    if (!animateStrokes || strokes.length === 0) {
      setStrokesVisible(strokes.length);
      return;
    }
    setStrokesVisible(0);
    let i = 0;
    const tick = () => { i++; setStrokesVisible(i); if (i < strokes.length) setTimeout(tick, 220); };
    setTimeout(tick, 350);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes.length]);

  // ── Keyboard: Cmd/Ctrl+Z → undo ────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  // ── Canvas long-hover → QuickStamp ─────────────────────────
  const { penHandlers: canvasPenHandlers, clearTimer: clearCanvasTimer } = usePencilHover(
    mode === 'live' ? onLongHoverCanvas : undefined,
    3500,
  );

  // ── SVG coordinate transform ──────────────────────────────
  const canvasPoint = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt  = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  // ── Undo last drawn stroke ────────────────────────────────
  const handleUndo = useCallback(() => {
    setDrawn(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const dbId = dbIdMap.current.get(last.id);
      if (dbId) { onEraseDbStroke?.(dbId); dbIdMap.current.delete(last.id); }
      return prev.slice(0, -1);
    });
  }, [onEraseDbStroke]);

  // ── Erase: remove any stroke whose path passes near pt ───
  const handleErase = useCallback((px: number, py: number) => {
    // Erase session-drawn strokes
    setDrawn(prev => {
      const next = prev.filter(s => {
        if (!pathHit(s.d, px, py, ERASER_R)) return true;
        const dbId = dbIdMap.current.get(s.id);
        if (dbId) { onEraseDbStroke?.(dbId); dbIdMap.current.delete(s.id); }
        return false;
      });
      return next.length !== prev.length ? next : prev;
    });
    // Erase DB-loaded strokes
    strokes.forEach(s => {
      if (pathHit(s.pathData, px, py, ERASER_R)) onEraseDbStroke?.(s.id);
    });
  }, [strokes, onEraseDbStroke]);

  // ── Pointer event handlers ────────────────────────────────
  const startDraw = (e: React.PointerEvent<SVGSVGElement>) => {
    if (mode !== 'live') return;
    if (e.button !== 0) return;
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    clearCanvasTimer();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);

    const pt = canvasPoint(e);

    if (tool === 'erase') {
      setEraserPos({ x: pt.x, y: pt.y });
      handleErase(pt.x, pt.y);
      return;
    }

    const w = e.pointerType === 'pen' ? pressureToWidth(e.pressure) : MOUSE_W;
    setDrawing({ d: `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, color: inkColor, w });
  };

  const moveDraw = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'pen' && e.pointerType !== 'mouse') return;
    const pt = canvasPoint(e);

    if (tool === 'erase') {
      if (e.buttons > 0) {
        setEraserPos({ x: pt.x, y: pt.y });
        handleErase(pt.x, pt.y);
      }
      return;
    }

    if (!drawing) return;
    const w = e.pointerType === 'pen' ? pressureToWidth(e.pressure) : drawing.w;
    setDrawing(d => d ? { ...d, d: d.d + ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, w } : null);
  };

  const endDraw = (e: React.PointerEvent<SVGSVGElement>) => {
    svgRef.current?.releasePointerCapture(e.pointerId);
    setEraserPos(null);

    if (!drawing || drawing.d.length < 10) { setDrawing(null); return; }

    const localId = `u${Date.now()}`;
    setDrawn(prev => [...prev, { id: localId, ...drawing }]);

    // Save to DB and record the UUID for undo
    if (onStrokeCommit) {
      onStrokeCommit(drawing.d, drawing.color, drawing.w).then(dbId => {
        if (dbId) dbIdMap.current.set(localId, dbId);
      });
    }

    setDrawing(null);
  };

  const selectedObs = selectedObsId ? observations.find(o => o.id === selectedObsId) : null;
  const canvasHasStrokes = drawn.length > 0 || strokes.length > 0;

  return (
    <div
      className={`nw-canvas-wrap nw-canvas-bg-${bgPattern}`}
      ref={wrapRef}
      onClick={() => onSelectObs(null)}
      {...canvasPenHandlers}
    >
      {/* SVG drawing layer */}
      <svg
        ref={svgRef}
        className="nw-canvas-svg"
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        preserveAspectRatio="xMidYMid slice"
        style={{
          touchAction: 'none',
          cursor: tool === 'erase' ? 'none' : 'crosshair',
        }}
        onPointerDown={startDraw}
        onPointerMove={moveDraw}
        onPointerUp={endDraw}
        onPointerCancel={endDraw}
        onPointerLeave={e => { setEraserPos(null); if (drawing) endDraw(e); }}
      >
        <defs>
          <filter id="ink-blur" x="-2%" y="-2%" width="104%" height="104%">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>

        {showGuides && (
          <g>
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i}
                x1={(i / 8) * CANVAS_W} y1={0} x2={(i / 8) * CANVAS_W} y2={CANVAS_H}
                stroke="rgba(48,178,255,0.06)" strokeWidth="1"
              />
            ))}
          </g>
        )}

        {/* DB strokes — animated in on load */}
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
          {/* Session strokes */}
          {drawn.map(s => (
            <path key={s.id} d={s.d} stroke={s.color} strokeWidth={s.w}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          ))}
          {/* Live stroke */}
          {drawing && (
            <path d={drawing.d} stroke={drawing.color} strokeWidth={drawing.w}
              strokeLinecap="round" strokeLinejoin="round" fill="none" />
          )}
        </g>

        {/* Eraser cursor */}
        {tool === 'erase' && eraserPos && (
          <circle
            cx={eraserPos.x}
            cy={eraserPos.y}
            r={ERASER_R}
            fill="rgba(255,255,255,0.06)"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth="1.5"
            style={{ pointerEvents: 'none' }}
          />
        )}
      </svg>

      {/* Canvas toolbar — top-right */}
      {mode === 'live' && (
        <div className="nw-canvas-toolbar" onClick={e => e.stopPropagation()}>
          {/* Draw tool */}
          <button
            className={`nw-tool-btn${tool === 'draw' ? ' is-active' : ''}`}
            title="Draw (D)"
            onClick={() => setTool('draw')}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.5 2.5l3 3L6 17l-4 1 1-4L14.5 2.5z" />
            </svg>
          </button>

          {/* Erase tool */}
          <button
            className={`nw-tool-btn${tool === 'erase' ? ' is-active is-erase' : ''}`}
            title="Erase (E)"
            onClick={() => setTool('erase')}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17h14M6 17l-3-3 8-8 5 5-7 6z" />
              <path d="M11 6l3 3" />
            </svg>
          </button>

          <div className="nw-toolbar-divider" />

          {/* Undo */}
          <button
            className="nw-tool-btn"
            title="Undo (⌘Z)"
            onClick={handleUndo}
            disabled={drawn.length === 0}
          >
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7H13a4 4 0 0 1 0 8H7" />
              <path d="M3 7l4-4M3 7l4 4" />
            </svg>
          </button>

          {/* Clear all */}
          {canvasHasStrokes && (
            <button
              className="nw-tool-btn nw-tool-btn--danger"
              title="Clear canvas"
              onClick={() => { setDrawn([]); dbIdMap.current.clear(); onClearStrokes?.(); }}
            >
              <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 17 6" />
                <path d="M8 6V4h4v2M16 6l-1 11H5L4 6" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Observation stamps */}
      <div className="nw-stamps">
        {observations.map(o => (
          <button
            key={o.id}
            className={[
              'nw-stamp',
              `is-${o.urgency}`,
              selectedObsId === o.id ? 'is-selected' : '',
              hoveredStampId === o.id ? 'is-pen-hover' : '',
            ].filter(Boolean).join(' ')}
            style={{ left: `${(o.x / CANVAS_W) * 100}%`, top: `${(o.y / CANVAS_H) * 100}%` }}
            onClick={e => { e.stopPropagation(); onSelectObs(o.id); }}
            onPointerEnter={e => { if (e.pointerType === 'pen') setHoveredStampId(o.id); }}
            onPointerLeave={e => { if (e.pointerType === 'pen') setHoveredStampId(null); }}
          >
            <span className="nw-stamp-time">{o.ts}</span>
            <span className="nw-stamp-pin" />
          </button>
        ))}
      </div>

      {/* Selected obs detail bubble */}
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

      {/* Canvas hint */}
      <div className="nw-canvas-hint">
        <span className="nw-eyebrow">FREEFORM CANVAS</span>
        <span className="nw-canvas-hint-meta">
          Draw · Erase · ⌘Z undo · Apple Pencil pressure-sensitive · Long-hover to drop a stamp
        </span>
      </div>
    </div>
  );
}
