"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { COVERAGE_BAR_H } from "@/lib/shiftbuilder/constants";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";
import { AssignmentSkeleton, UnassignedDropHint } from "./builderPrimitives";
import { formatCoveredByNames } from "@/lib/shiftbuilder/coverageHelpers";

/** Shared typography scale for assignment card name rows. */
export type CardNameScale = "zone" | "rr" | "aux";

const NAME_SIZE_BUILDER: Record<CardNameScale, number> = {
  zone: 22,
  rr: 18,
  aux: 18,
};

const NAME_SIZE_PRINT: Record<CardNameScale, number> = {
  zone: 21,
  rr: 18,
  aux: 18,
};

const LOCK_ICON_SIZE: Record<CardNameScale, number> = {
  zone: 13,
  rr: 11,
  aux: 12,
};

export type UnassignedInviteSize = "zone" | "rr" | "aux";

const INVITE_CONFIG: Record<
  UnassignedInviteSize,
  { minH: number; maxH: number; plusSize: number; labelSize: number; padding: string }
> = {
  zone: { minH: 110, maxH: 130, plusSize: 28, labelSize: 11, padding: "py-4 px-4" },
  rr: { minH: 72, maxH: 84, plusSize: 22, labelSize: 9, padding: "py-2 px-3" },
  aux: { minH: 64, maxH: 76, plusSize: 20, labelSize: 9, padding: "py-2 px-3" },
};

export function coverageBodyPadding(
  coverageCount: number,
  showDigitalAssists: boolean,
): number {
  if (coverageCount > 0) {
    return coverageCount * COVERAGE_BAR_H + (showDigitalAssists ? 14 : 22);
  }
  return showDigitalAssists ? 10 : 12;
}

/** 3px accent stripe — identical on Zone / RR / Aux shells. */
export function CardAccentStripe({ color }: { color: string }) {
  return (
    <div
      className="h-[3px] w-full shrink-0"
      style={{ background: color, boxShadow: "0 1px 0 rgba(255,255,255,0.4) inset" }}
    />
  );
}

/** Icon + uppercase label + trailing controls (fit chip, break badge, etc.). */
export function CardSlotHeader({
  icon,
  label,
  accentColor,
  trailing,
  compact = false,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  accentColor: string;
  trailing?: React.ReactNode;
  /** RR stacked sides use slightly tighter header padding. */
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1 px-2 leading-none ${compact ? "pt-1 pb-1" : "pt-1.5 pb-1.5"}`}
      style={{ borderBottom: `1px solid ${accentColor}22`, color: accentColor }}
    >
      <div className="flex items-center gap-1.5 leading-none min-w-0" style={{ color: accentColor }}>
        {icon != null ? (
          <span className="text-[12px] leading-none drop-shadow-sm shrink-0">{icon}</span>
        ) : null}
        <span
          className="font-extrabold uppercase truncate"
          style={{
            fontSize: 10.5,
            fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
            letterSpacing: "0.4px",
          }}
        >
          {label}
        </span>
      </div>
      {trailing ? (
        <div className="flex items-center gap-0.5 shrink-0">{trailing}</div>
      ) : null}
    </div>
  );
}

export function DuplicateTmBadge({
  otherSlots,
  animate = false,
}: {
  otherSlots: string[];
  animate?: boolean;
}) {
  const className =
    "ml-1.5 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30";
  const title = `Duplicate assignment — also in: ${otherSlots.join(", ")}`;

  if (animate) {
    return (
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...premiumSpring, stiffness: 550, damping: 16, delay: 0.02 }}
        className={className}
        title={title}
      >
        2×
      </motion.span>
    );
  }

  return (
    <span className={className} title={title}>
      2×
    </span>
  );
}

function LockIcon({ size }: { size: number }) {
  return (
    <span
      className="ms shrink-0 text-[#FF9500]"
      aria-label="Locked"
      style={{ fontSize: size, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}
    >
      lock
    </span>
  );
}

/** Builder-only glass invite for empty slots. */
export function UnassignedInvite({
  size,
  onClick,
  title = "Click or drop to assign team member",
}: {
  size: UnassignedInviteSize;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  title?: string;
}) {
  const cfg = INVITE_CONFIG[size];
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      key="unassigned-invite"
      className={`flex flex-col items-center justify-center text-[#8a8a8f] tracking-[0.15px] rounded-[5px] cursor-pointer w-full ${cfg.padding}`}
      style={{
        fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
        minHeight: cfg.minH,
        maxHeight: cfg.maxH,
        border: "1px solid rgba(0,0,0,0.05)",
        background: "rgba(255,255,255,0.8)",
        boxShadow: "0 1px 4px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.95)",
      }}
      initial={{ opacity: 0.9, y: 1, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{
        scale: 1.01,
        borderColor: "rgba(0,0,0,0.08)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.98)",
      }}
      whileTap={{ scale: 0.985 }}
      transition={premiumSpring}
      onClick={onClick}
      title={title}
    >
      <motion.span
        className="leading-none opacity-40"
        style={{ fontSize: cfg.plusSize }}
        whileHover={reducedMotion ? {} : { scale: 1.15, rotate: 90 }}
        transition={{ ...premiumSpring, stiffness: 250 }}
      >
        +
      </motion.span>
      <span
        className="font-semibold tracking-[0.35px] text-[#5a5a60] mt-1"
        style={{ fontSize: cfg.labelSize }}
      >
        ASSIGN TM
      </span>
      {size === "zone" ? (
        <>
          <span className="no-print text-[7.5px] opacity-55 mt-0.5">Tap to assign</span>
          <span className="no-print text-[6.5px] opacity-40 mt-0.5">or drop to assign</span>
        </>
      ) : (
        <UnassignedDropHint className="mt-0.5" />
      )}
    </motion.div>
  );
}

const COVERED_LABEL_SIZE_BUILDER: Record<CardNameScale, number> = {
  zone: 8.5,
  rr: 7.5,
  aux: 7.5,
};

const COVERED_LABEL_SIZE_PRINT: Record<CardNameScale, number> = {
  zone: 7.5,
  rr: 7,
  aux: 7,
};

function CoveredByBlock({
  coveredByNames,
  scale,
  showDigitalAssists,
  nameSizeOverride,
}: {
  coveredByNames: string[];
  scale: CardNameScale;
  showDigitalAssists: boolean;
  nameSizeOverride?: number;
}) {
  const namesLine = formatCoveredByNames(coveredByNames);
  const nameFontSize =
    nameSizeOverride ??
    (showDigitalAssists ? NAME_SIZE_BUILDER[scale] : NAME_SIZE_PRINT[scale]);
  const labelFontSize = showDigitalAssists
    ? COVERED_LABEL_SIZE_BUILDER[scale]
    : COVERED_LABEL_SIZE_PRINT[scale];

  return (
    <div
      className={`sb-covered-by-block flex flex-col min-w-0 w-full ${showDigitalAssists ? "" : "sb-covered-by-print"}`}
    >
      <span
        className={`sb-covered-by-label font-bold uppercase tracking-[0.22em] px-1 py-[1px] inline-block ${
          showDigitalAssists ? "text-[#9CA3AF]" : "text-[#B0B0B8]"
        }`}
        style={{
          fontSize: labelFontSize,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          lineHeight: 1.15,
        }}
      >
        Covered by
      </span>
      <span
        className={`sb-covered-by-names font-bold tracking-[-0.35px] px-1 py-[1px] inline-block leading-tight ${
          showDigitalAssists ? "text-[#6B7280]" : "text-[#9CA3AF]"
        }`}
        style={{
          fontSize: nameFontSize,
          lineHeight: 1.08,
          fontFamily: "var(--font-bricolage, var(--font-atkinson))",
        }}
      >
        {namesLine}
      </span>
    </div>
  );
}

/** Builder covered-by row — top-pinned like assigned TM names. */
export function CoveredByOverlay({
  scale,
  coveredByNames,
  onClick,
  nameSizeOverride,
  title = "Covered by another placement — tap to open slot",
}: {
  scale: CardNameScale;
  coveredByNames: string[];
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  nameSizeOverride?: number;
  title?: string;
}) {
  return (
    <motion.div
      key="covered-by-overlay"
      className="sb-covered-by-overlay min-w-0 cursor-pointer"
      initial={{ opacity: 0.92, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ opacity: 0.92 }}
      whileTap={{ scale: 0.995 }}
      transition={premiumSpring}
      onClick={onClick}
      title={title}
    >
      <CoveredByBlock
        coveredByNames={coveredByNames}
        scale={scale}
        showDigitalAssists
        nameSizeOverride={nameSizeOverride}
      />
    </motion.div>
  );
}

/** Print / preview covered-by row — top-pinned, extra-muted vs builder. */
export function CoveredByPrintLabel({
  coveredByNames,
  scale = "zone",
  nameSizeOverride,
}: {
  coveredByNames: string[];
  scale?: CardNameScale;
  nameSizeOverride?: number;
}) {
  return (
    <CoveredByBlock
      coveredByNames={coveredByNames}
      scale={scale}
      showDigitalAssists={false}
      nameSizeOverride={nameSizeOverride}
    />
  );
}

/** Print / preview unassigned line. */
export function UnassignedPrintLabel({ showDigitalAssists }: { showDigitalAssists: boolean }) {
  return (
    <div
      className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] px-1 py-[1px]"
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    >
      <span className="sb-unassigned-primary">— Unassigned —</span>
      {showDigitalAssists ? (
        <span className="sb-unassigned-hint no-print">
          <span
            className="ms"
            style={{ fontSize: 11, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20' }}
          >
            south
          </span>
          Drop to assign
        </span>
      ) : null}
    </div>
  );
}

export type SlotAssignmentState =
  | { kind: "loading" }
  | { kind: "draft"; proposedName: string; previousName?: string }
  | { kind: "assigned"; tmName: string; tmId?: string; isLocked?: boolean }
  | { kind: "covered"; coveredByNames: string[] }
  | { kind: "unassigned" };

/** Unified name / empty / draft row used inside Zone, RR side, and Aux cards. */
export function SlotAssignmentBody({
  state,
  scale,
  showDigitalAssists,
  isDuplicate,
  otherSlotsForTm = [],
  onUnassignedClick,
  inviteSize = "zone",
  emptyPresentation = "invite",
  nameSizeOverride,
}: {
  state: SlotAssignmentState;
  scale: CardNameScale;
  showDigitalAssists: boolean;
  isDuplicate?: boolean;
  otherSlotsForTm?: string[];
  onUnassignedClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  inviteSize?: UnassignedInviteSize;
  /** Zone/RR use glass invite; aux uses dash label + drop hint. */
  emptyPresentation?: "invite" | "label";
  /** Aux cards shrink name when tasks are present. */
  nameSizeOverride?: number;
}) {
  const reducedMotion = useReducedMotion();
  const fontSize =
    nameSizeOverride ??
    (showDigitalAssists ? NAME_SIZE_BUILDER[scale] : NAME_SIZE_PRINT[scale]);
  const lockSize = LOCK_ICON_SIZE[scale];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {state.kind === "loading" ? (
        <div key="loading">
          <AssignmentSkeleton size={scale === "zone" ? "xl" : "lg"} />
        </div>
      ) : state.kind === "draft" ? (
        showDigitalAssists ? (
          <motion.div
            key="draft"
            className="flex flex-col min-w-0"
            initial={{ opacity: 0, y: 3, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.985 }}
            transition={premiumSpring}
          >
            <span
              className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize,
                lineHeight: 1.02,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {state.proposedName}
            </span>
            {isDuplicate ? (
              <DuplicateTmBadge otherSlots={otherSlotsForTm} animate />
            ) : null}
            {state.previousName ? (
              <span
                className="text-[9px] text-[#9CA3AF] line-through opacity-60 mt-0.5 tracking-[0.2px] px-1 py-[1px] inline-block"
                style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              >
                was: {state.previousName}
              </span>
            ) : null}
          </motion.div>
        ) : (
          <div key="draft" className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize,
                lineHeight: 1.02,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {state.proposedName}
            </span>
            {isDuplicate && showDigitalAssists ? (
              <DuplicateTmBadge otherSlots={otherSlotsForTm} />
            ) : null}
            {state.previousName ? (
              <span
                className="text-[9px] text-[#9CA3AF] line-through opacity-60 mt-0.5 tracking-[0.2px] px-1 py-[1px] inline-block"
                style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              >
                was: {state.previousName}
              </span>
            ) : null}
          </div>
        )
      ) : state.kind === "assigned" ? (
        showDigitalAssists ? (
          <motion.div
            key={`assigned-${state.tmId ?? state.tmName}`}
            className="flex items-center gap-1 min-w-0"
            initial={{ opacity: 0, y: 6, scale: 0.93 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.97 }}
            whileHover={reducedMotion ? {} : { scale: 1.005 }}
            transition={
              reducedMotion
                ? premiumSpringReduced
                : { ...premiumSpring, stiffness: 400, damping: 28 }
            }
          >
            {state.isLocked ? <LockIcon size={lockSize} /> : null}
            <span
              className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize,
                lineHeight: 1.02,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {state.tmName}
            </span>
            {isDuplicate ? (
              <DuplicateTmBadge otherSlots={otherSlotsForTm} animate />
            ) : null}
          </motion.div>
        ) : (
          <div
            key={`assigned-${state.tmId ?? state.tmName}`}
            className="flex items-center gap-1.5 min-w-0"
          >
            {state.isLocked ? <LockIcon size={lockSize} /> : null}
            <span
              className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block"
              style={{
                fontSize: showDigitalAssists ? fontSize : fontSize,
                lineHeight: 1.0,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {state.tmName}
            </span>
            {isDuplicate && showDigitalAssists ? (
              <DuplicateTmBadge otherSlots={otherSlotsForTm} />
            ) : null}
          </div>
        )
      ) : state.kind === "covered" ? (
        showDigitalAssists && onUnassignedClick ? (
          <CoveredByOverlay
            key="covered"
            scale={scale}
            coveredByNames={state.coveredByNames}
            onClick={onUnassignedClick}
            nameSizeOverride={nameSizeOverride}
          />
        ) : (
          <CoveredByPrintLabel
            key="covered-print"
            coveredByNames={state.coveredByNames}
            scale={scale}
            nameSizeOverride={nameSizeOverride}
          />
        )
      ) : showDigitalAssists && emptyPresentation === "invite" && onUnassignedClick ? (
        <div key="unassigned" className="flex-1 flex flex-col justify-center min-h-0">
          <UnassignedInvite
            size={inviteSize}
            onClick={onUnassignedClick}
          />
        </div>
      ) : showDigitalAssists && emptyPresentation === "label" ? (
        <motion.div
          key="unassigned-label"
          className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px]"
          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
          initial={{ opacity: 0.65, y: 2, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          whileHover={{ scale: 1.01 }}
          transition={premiumSpring}
          onClick={onUnassignedClick}
        >
          <span className="sb-unassigned-primary">— Unassigned —</span>
          <UnassignedDropHint className="mt-px" />
        </motion.div>
      ) : (
        <UnassignedPrintLabel key="unassigned" showDigitalAssists={showDigitalAssists} />
      )}
    </AnimatePresence>
  );
}

/** Thin divider above task footer — shared weight across card types. */
export function TaskListDivider({
  hasTm,
  showDigitalAssists,
}: {
  hasTm: boolean;
  showDigitalAssists: boolean;
}) {
  if (!showDigitalAssists) return null;
  const cls = hasTm
    ? "bg-black/[0.04] dark:bg-white/[0.04]"
    : "bg-black/[0.025] dark:bg-white/[0.025]";
  return <div className={`h-px w-full my-0.5 ${cls}`} />;
}

/** Builder card interior body padding + optional glass tint. */
export function cardBodyInteriorClass(showDigitalAssists: boolean, extra = ""): string {
  return `flex flex-col flex-1 min-h-0 overflow-hidden ${showDigitalAssists ? "px-2.5 pt-2" : "px-3 pt-2"} ${extra}`.trim();
}

export function cardBodyInteriorStyle(showDigitalAssists: boolean, paddingBottom: number): React.CSSProperties {
  return {
    paddingBottom,
    background: showDigitalAssists ? "rgba(255,255,255,0.022)" : undefined,
    backdropFilter: showDigitalAssists ? "blur(0.5px)" : undefined,
  };
}