"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

/**
 * CoverageBar — rendered at the very bottom of a zone or RR card to show
 * that the TM is pulling double duty covering another slot.
 * Background is the accent color of the SOURCE slot.
 */
const CoverageBar = React.memo(function CoverageBar({
  task,
  slotKey,
  onRemoveTask,
}: {
  task: NightSlotTask;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const bg = task.color || '#6B7280';

  return (
    <div
      className="group flex items-center justify-between px-2 select-none"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: bg,
        borderRadius: '0 0 3px 3px',
        paddingTop: 4,
        paddingBottom: 4,
        zIndex: 2,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={task.taskLabel}
    >
      <span
        className="text-white font-extrabold uppercase tracking-[0.6px] leading-none truncate"
        style={{ fontSize: 8.5, fontFamily: 'var(--font-atkinson)' }}
      >
        {task.taskLabel}
      </span>
      {onRemoveTask && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemoveTask(slotKey, task.taskLabel);
          }}
          className="ml-1 leading-none font-bold flex-shrink-0 transition-opacity"
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: 14,
            opacity: hovered ? 1 : 0.45,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,1)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = hovered ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.45)')}
          title="Remove coverage"
        >
          ×
        </button>
      )}
    </div>
  );
});

export default CoverageBar;
