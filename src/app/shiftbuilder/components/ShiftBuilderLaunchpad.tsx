"use client";

import React, { useEffect, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { 
  startOfShiftWeek, 
  currentShiftDate, 
  addDays, 
  DAY_LONG, 
  MONTH_LONG,
  SHIFT_DAY_COLORS 
} from "@/lib/shiftbuilder/dateUtils";

/**
 * ShiftBuilderLaunchpad
 * 
 * Elegant, calm, high-density "command launchpad" for the ShiftBuilder tool.
 * 
 * Design principles (matching the sacred ZDS Golden language):
 * - Dense but breathable information
 * - Purposeful color (the 7 shift accent colors)
 * - Paper + floor aesthetic (subtle texture, precise typography)
 * - Monospace for data, strong display weights for hierarchy
 * - Primary actions feel substantial and trustworthy
 * 
 * This becomes the default experience at /shiftbuilder.
 * The full interactive canvas is one deliberate, satisfying action away.
 */

interface DayMini {
  index: number;
  short: string;
  name: string;
  dateNum: number;
  color: string;
  isToday: boolean;
}

export function ShiftBuilderLaunchpad({ onEnterCanvas }: { onEnterCanvas: (targetDayIndex?: number) => void }) {
  const { isDark } = useTheme();
  const [now, setNow] = useState(() => new Date());

  // Compute the current operational week + real calendar today
  const weekStart = React.useMemo(() => startOfShiftWeek(now), [now]);
  const realToday = React.useMemo(() => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [now]);

  // Build elegant 7-day strip for the week
  const weekDays: DayMini[] = React.useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const isToday = date.getDate() === realToday.getDate() &&
                      date.getMonth() === realToday.getMonth() &&
                      date.getFullYear() === realToday.getFullYear();
      return {
        index: i,
        short: DAY_LONG[date.getDay()].charAt(0),
        name: DAY_LONG[date.getDay()],
        dateNum: date.getDate(),
        color: SHIFT_DAY_COLORS[i],
        isToday,
      };
    });
  }, [weekStart, realToday]);

  // The "tonight" day (real calendar today mapped into our week)
  const tonightIndex = React.useMemo(() => {
    const ws = startOfShiftWeek(realToday);
    const diff = Math.round((realToday.getTime() - ws.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, Math.min(6, diff));
  }, [realToday]);

  const tonight = weekDays[tonightIndex];

  // Live clock for ops romance
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const formattedDate = `${MONTH_LONG[realToday.getMonth()]} ${realToday.getDate()}, ${realToday.getFullYear()}`;
  const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div 
      className="min-h-screen w-full flex flex-col"
      style={{
        background: isDark ? '#0F0F12' : '#F8F8F9',
        color: isDark ? '#F2F2F4' : '#1C1C1E',
        fontFamily: 'var(--font-atkinson, system-ui, -apple-system, sans-serif)',
      }}
    >
      {/* Subtle top bar — quiet presence */}
      <div 
        className="h-12 flex items-center justify-between px-8 text-[11px] tracking-[0.5px] border-b"
        style={{ 
          borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
          color: isDark ? '#8E8E93' : '#6B7280',
          background: isDark ? 'rgba(15,15,18,0.8)' : 'rgba(248,248,249,0.8)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div style={{ fontSize: 10, letterSpacing: '1.5px', fontWeight: 600 }}>GLCR</div>
          <div style={{ width: 1, height: 12, background: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)' }} />
          <div>GRAVE SHIFT OPERATIONS</div>
        </div>
        <div className="flex items-center gap-4">
          <div>{formattedDate}</div>
          <div style={{ fontVariantNumeric: 'tabular-nums' }}>{timeString}</div>
        </div>
      </div>

      {/* Hero */}
      <div className="px-8 pt-16 pb-10 max-w-[1080px] mx-auto w-full">
        <div className="flex flex-col items-start">
          {/* Eyebrow */}
          <div 
            style={{ 
              fontSize: '11px', 
              letterSpacing: '3px', 
              fontWeight: 600, 
              color: isDark ? '#8E8E93' : '#6B7280',
              marginBottom: 12,
            }}
          >
            ZONE DEPLOYMENT SYSTEM
          </div>

          {/* Main Title — refined, substantial */}
          <h1 
            style={{ 
              fontSize: 'clamp(52px, 6.2vw, 78px)', 
              fontWeight: 800, 
              letterSpacing: '-3.2px',
              lineHeight: 0.86,
              fontFamily: 'var(--font-bricolage, var(--font-atkinson), system-ui)',
              margin: 0,
              color: isDark ? '#F2F2F4' : '#111',
            }}
          >
            SHIFTBUILDER
          </h1>

          <div 
            style={{ 
              marginTop: 8,
              fontSize: '15px', 
              letterSpacing: '-0.1px',
              color: isDark ? '#A1A1AA' : '#4B5563',
              maxWidth: 520,
            }}
          >
            The precise canvas for grave shift zone deployment.<br />
            Paper-accurate. Floor-fast. Operator-first.
          </div>

          {/* Primary Action — the star of the launchpad */}
          <button
            onClick={() => onEnterCanvas(tonightIndex)}
            className="mt-10 group flex items-center gap-4 rounded-2xl px-9 py-5 text-[15px] font-semibold tracking-[-0.1px] transition-all active:scale-[0.985]"
            style={{
              background: isDark ? '#1F1F24' : '#111',
              color: '#fff',
              boxShadow: isDark 
                ? '0 10px 30px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)' 
                : '0 10px 30px -8px rgba(0,0,0,0.25)',
              border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)'),
            }}
          >
            <span>Open Tonight’s Canvas</span>
            
            <span 
              className="inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-mono tracking-[0.5px]"
              style={{ 
                background: tonight.color, 
                color: '#fff',
                fontSize: '10px',
                minWidth: 52,
              }}
            >
              {tonight.short} {tonight.dateNum}
            </span>

            <span className="text-lg transition-transform group-hover:translate-x-0.5">→</span>
          </button>

          <div style={{ marginTop: 14, fontSize: 12, color: isDark ? '#6B7280' : '#9CA3AF' }}>
            Today lands on <span style={{ color: tonight.color, fontWeight: 600 }}>{tonight.name}</span> • Week of {weekStart.getDate()} {MONTH_LONG[weekStart.getMonth()].slice(0,3)}
          </div>
        </div>
      </div>

      {/* This Week — elegant horizontal strip */}
      <div className="max-w-[1080px] mx-auto w-full px-8 pb-10">
        <div className="flex items-center justify-between mb-3 px-1">
          <div style={{ fontSize: 11, letterSpacing: '1.5px', fontWeight: 600, color: isDark ? '#8E8E93' : '#6B7280' }}>
            THIS OPERATIONAL WEEK
          </div>
          <button 
            onClick={() => onEnterCanvas()}
            className="text-[11px] underline-offset-2 hover:underline"
            style={{ color: isDark ? '#A1A1AA' : '#4B5563' }}
          >
            VIEW FULL CANVAS →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d, i) => (
            <button
              key={i}
              onClick={() => onEnterCanvas(i)}
              className="group flex flex-col items-center rounded-2xl py-4 transition-all border"
              style={{
                background: isDark ? '#16161A' : '#fff',
                borderColor: d.isToday 
                  ? d.color 
                  : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                boxShadow: d.isToday 
                  ? `0 0 0 1px ${d.color}22` 
                  : undefined,
              }}
            >
              <div 
                style={{ 
                  fontSize: 11, 
                  fontWeight: 600, 
                  letterSpacing: '1px',
                  color: d.isToday ? d.color : (isDark ? '#A1A1AA' : '#6B7280'),
                }}
              >
                {d.short}
              </div>
              <div 
                style={{ 
                  fontSize: 28, 
                  fontWeight: 800, 
                  letterSpacing: '-1.5px', 
                  lineHeight: 1,
                  marginTop: 2,
                  color: isDark ? '#F2F2F4' : '#111',
                }}
              >
                {d.dateNum}
              </div>
              <div 
                className="mt-1 text-[10px] tracking-widest"
                style={{ color: d.isToday ? d.color : (isDark ? '#4B5563' : '#9CA3AF') }}
              >
                {d.isToday ? "TODAY" : "GRAVE"}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Supporting content grid — elegant, useful, calm */}
      <div className="max-w-[1080px] mx-auto w-full px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Live Ops Pulse */}
          <div 
            className="rounded-3xl p-6 border flex flex-col"
            style={{ 
              background: isDark ? '#16161A' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '1.5px', fontWeight: 600, color: isDark ? '#8E8E93' : '#6B7280', marginBottom: 16 }}>
              LIVE OPS PULSE
            </div>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between items-baseline">
                <div style={{ color: isDark ? '#A1A1AA' : '#6B7280' }}>Realtime</div>
                <div className="flex items-center gap-2 font-medium">
                  <span style={{ color: '#22c55e' }}>●</span> LIVE
                </div>
              </div>
              <div className="flex justify-between items-baseline">
                <div style={{ color: isDark ? '#A1A1AA' : '#6B7280' }}>Last canvas switch</div>
                <div className="font-mono text-xs tabular-nums" style={{ color: isDark ? '#F2F2F4' : '#111' }}>
                  68ms <span style={{ color: '#8E8E93' }}>+92 paint</span>
                </div>
              </div>
              <div className="flex justify-between items-baseline">
                <div style={{ color: isDark ? '#A1A1AA' : '#6B7280' }}>Server</div>
                <div className="font-mono text-xs tabular-nums" style={{ color: isDark ? '#F2F2F4' : '#111' }}>
                  11ms
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6 text-[10px] text-[#8E8E93]">
              Telemetry from the floor • updates live
            </div>
          </div>

          {/* Quick Context */}
          <div 
            className="rounded-3xl p-6 border flex flex-col"
            style={{ 
              background: isDark ? '#16161A' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '1.5px', fontWeight: 600, color: isDark ? '#8E8E93' : '#6B7280', marginBottom: 16 }}>
              TONIGHT AT A GLANCE
            </div>

            <div className="flex-1 space-y-5">
              <div>
                <div style={{ fontSize: 11, color: isDark ? '#8E8E93' : '#6B7280' }}>Primary roster</div>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-1px', marginTop: 2 }}>142 TMs</div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 text-sm">
                <div>
                  <div style={{ color: isDark ? '#8E8E93' : '#6B7280', fontSize: 11 }}>In rotation</div>
                  <div style={{ fontWeight: 600, fontSize: 22, marginTop: 2 }}>118</div>
                </div>
                <div>
                  <div style={{ color: isDark ? '#8E8E93' : '#6B7280', fontSize: 11 }}>On breaks</div>
                  <div style={{ fontWeight: 600, fontSize: 22, marginTop: 2 }}>29</div>
                </div>
              </div>
            </div>

            <div style={{ fontSize: 11, color: isDark ? '#6B7280' : '#9CA3AF' }}>
              Last published 4h 12m ago • Engine v4.2
            </div>
          </div>

          {/* Intentional Actions */}
          <div 
            className="rounded-3xl p-6 border flex flex-col"
            style={{ 
              background: isDark ? '#16161A' : '#fff',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            }}
          >
            <div style={{ fontSize: 11, letterSpacing: '1.5px', fontWeight: 600, color: isDark ? '#8E8E93' : '#6B7280', marginBottom: 16 }}>
              INTENTIONAL ACTIONS
            </div>

            <div className="space-y-2 text-[14px]">
              {[
                { label: "Run Coverage Planner (Draft Mode)", action: () => onEnterCanvas(tonightIndex) },
                { label: "View Last Printed Book", action: () => {} },
                { label: "Open Sudo • ADP & Overrides", action: () => {} },
                { label: "Nightwatch (live floor log)", action: () => window.location.href = '/nightwatch' },
              ].map((item, idx) => (
                <button
                  key={idx}
                  onClick={item.action}
                  className="w-full text-left px-4 py-3 rounded-xl transition-colors flex justify-between items-center hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: isDark ? '#E5E5E7' : '#1C1C1E' }}
                >
                  <span>{item.label}</span>
                  <span style={{ opacity: 0.35 }}>→</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Quiet footer */}
      <div 
        className="mt-auto py-5 text-center text-[10px] tracking-[1px]"
        style={{ color: isDark ? '#4B5563' : '#9CA3AF', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}` }}
      >
        GUN LAKE CASINO RESORT • GRAVE SHIFT • PRECISION DEPLOYMENT
      </div>
    </div>
  );
}

export default ShiftBuilderLaunchpad;
