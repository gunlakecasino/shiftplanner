"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { COVERAGE_BAR_H } from "@/lib/shiftbuilder/constants";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";
import { AssignmentSkeleton, UnassignedDropHint } from "./builderPrimitives";
import { cardAccentInk, isGoldAccent } from "@/lib/shiftbuilder/constants";
import {
  coveredByNamesFromEntries,
  formatCoverageSideLabel,
  formatCoveredByNames,
  formatCoveredDisplayName,
  resolveDualCoverageSides,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";
import { fitVerdictLabel } from "@/lib/shiftbuilder/placementPadInsightSchema";
import { placementRepeatKeysMatch } from "./placementPadHelpers";

const CRITICAL_REPEAT_MARK_COLOR = "#B91C1C";

/** Last 3 grave placements before tonight — muted trail beside the TM name (builder only). */
export function TmPlacementTrail({
  labels,
  matchSlotKey,
}: {
  labels?: string[];
  /** When set, matching trail chips use critical-repeat styling (RR8 = MRR8/WRR8). */
  matchSlotKey?: string;
}) {
  if (!labels?.length) return null;

  return (
    <span
      className="sb-tm-placement-trail no-print inline-flex items-baseline gap-[3px] shrink-0 self-baseline"
      title={`Last ${labels.length} placements (newest first): ${labels.join(" → ")}`}
      aria-label={`Recent placements: ${labels.join(", ")}`}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {labels.map((label, i) => {
        const isRepeat =
          !!matchSlotKey && placementRepeatKeysMatch(label, matchSlotKey);
        return (
          <React.Fragment key={`${label}-${i}`}>
            {i > 0 ? (
              <span className="text-[7px] text-neutral-300/90 select-none leading-none" aria-hidden>
                ·
              </span>
            ) : null}
            <span
              className={`text-[8px] font-semibold uppercase tracking-[0.05em] leading-none ${
                isRepeat ? "text-[#B91C1C]" : "text-neutral-400"
              }`}
              style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </span>
  );
}

/** Subtle inline mark beside a TM name when prior-3 placement repeat caps health at 50%. */
export function CriticalRepeatNameMark({
  title,
}: {
  title?: string;
}) {
  const tip =
    title ??
    `${fitVerdictLabel("critical_repeat")} — same area as one of their last 3 placements (50% rotation health)`;

  return (
    <span
      className="sb-critical-repeat-mark no-print inline-flex shrink-0 items-center justify-center rounded-full font-black leading-none text-white"
      style={{
        width: 10,
        height: 10,
        fontSize: 7,
        background: CRITICAL_REPEAT_MARK_COLOR,
        boxShadow: "0 0 0 1px rgba(255,255,255,0.45)",
        marginTop: "0.12em",
      }}
      title={tip}
      aria-label={tip}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      !
    </span>
  );
}

/** Shared typography scale for assignment card name rows. */
export type CardNameScale = "zone" | "rr" | "aux";

const NAME_SIZE_BUILDER: Record<CardNameScale, number> = {
  zone: 24, /* refined larger for better readability, less cutoff */
  rr: 24,
  aux: 20,
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

/** 3px accent stripe — matching refined design. */
export function CardAccentStripe({ color }: { color: string }) {
  return (
    <div
      className={`h-[3px] w-full shrink-0 ${isGoldAccent(color) ? "sb-accent-stripe--gold" : ""}`}
      style={{ backgroundColor: color }}
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
  titleClassName,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  accentColor: string;
  trailing?: React.ReactNode;
  /** RR stacked sides use slightly tighter header padding. */
  compact?: boolean;
  titleClassName?: string;
}) {
  const ink = cardAccentInk(accentColor);

  return (
    <div
      className={`flex items-center justify-between gap-1.5 px-3.5 ${compact ? "pt-2 pb-1.5" : "pt-2.5 pb-2"} leading-none`}
      style={{ color: ink }}
    >
      <div className="flex items-center gap-1.5 leading-none min-w-0" style={{ color: ink }}>
        {icon != null ? (
          <span className="text-[12px] leading-none drop-shadow-sm shrink-0">{icon}</span>
        ) : null}
        {React.isValidElement(label) ? (
          <div className="min-w-0 flex-1">{label}</div>
        ) : (
          <span
            className={`font-bold tracking-[0.07em] uppercase truncate ${titleClassName ?? ""}`}
            style={{
              fontSize: 10,
              fontFamily: "var(--font-atkinson, var(--font-ui, system-ui)",
              letterSpacing: "0.07em",
            }}
          >
            {label}
          </span>
        )}
      </div>
      {trailing ? (
        <div className="flex items-center gap-1.5 shrink-0">{trailing}</div>
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
    "sb-gold-chip ml-1.5 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] font-semibold";
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
      className={`flex flex-col items-center justify-center text-[#9CA3AF] tracking-[0.15px] rounded-[5px] cursor-pointer w-full ${cfg.padding}`}
      style={{
        fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
        minHeight: cfg.minH,
        maxHeight: cfg.maxH,
        border: "1px dashed rgba(0,0,0,0.06)",
        background: "color-mix(in srgb, var(--ios-background-secondary) 35%, transparent)",
        boxShadow: "0 1px 1px rgba(0,0,0,0.015)",
      }}
      initial={{ opacity: 0.85, y: 1, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{
        scale: 1.01,
        borderColor: "rgba(0,0,0,0.10)",
        background: "color-mix(in srgb, var(--ios-background-secondary) 55%, transparent)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}
      whileTap={{ scale: 0.985 }}
      transition={premiumSpring}
      onClick={onClick}
      title={title}
    >
      <motion.span
        className="leading-none opacity-25"
        style={{ fontSize: cfg.plusSize }}
        whileHover={reducedMotion ? {} : { scale: 1.15, rotate: 90 }}
        transition={{ ...premiumSpring, stiffness: 250 }}
      >
        +
      </motion.span>
      <span
        className="font-semibold tracking-[0.35px] text-[#9CA3AF] mt-1"
        style={{ fontSize: cfg.labelSize, opacity: 0.85 }}
      >
        ASSIGN TM
      </span>
      {size === "zone" ? (
        <>
          <span className="no-print text-[7.5px] text-[#9CA3AF] opacity-45 mt-0.5">Tap to assign</span>
          <span className="no-print text-[6.5px] text-[#9CA3AF] opacity-35 mt-0.5">or drop to assign</span>
        </>
      ) : (
        <UnassignedDropHint className="mt-0.5" />
      )}
    </motion.div>
  );
}

const COVERED_LABEL_SIZE_BUILDER: Record<CardNameScale, number> = {
  zone: 8.5,
  rr: 10,
  aux: 7.5,
};

const COVERED_LABEL_SIZE_PRINT: Record<CardNameScale, number> = {
  zone: 7.5,
  rr: 9,
  aux: 7,
};

/** Covered-by row type — badge + name share one size token. */
const COVERED_NAME_SIZE_BUILDER: Record<CardNameScale, number> = {
  zone: 20,
  rr: 22,
  aux: 15,
};

const COVERED_NAME_SIZE_PRINT: Record<CardNameScale, number> = {
  zone: 17,
  rr: 18,
  aux: 13,
};

function coveredNameDisplayMaxLen(scale: CardNameScale): number {
  if (scale === "zone") return 12;
  if (scale === "rr") return 10;
  return 9;
}

const COVERED_ROW_FONT = "var(--font-bricolage, var(--font-atkinson))";

function CoveredBySideBadge({
  label,
  fontSize,
  interactive,
  onClick,
}: {
  label: string;
  fontSize: number;
  interactive?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const className = `sb-covered-by-side font-semibold tabular-nums tracking-[-0.28px] text-[var(--ios-label-tertiary)] ${
    interactive ? "sb-covered-by-side--interactive" : ""
  }`;
  const style = {
    fontSize,
    lineHeight: 1.12,
    fontFamily: COVERED_ROW_FONT,
  };

  if (interactive && onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        title="Swap A/B coverage positions"
      >
        {label}
      </button>
    );
  }
  return (
    <span className={className} style={style}>
      {label}
    </span>
  );
}

function CoveredByNameCell({
  tmName,
  nameFontSize,
  maxLen,
  showDigitalAssists,
}: {
  tmName: string;
  nameFontSize: number;
  maxLen: number;
  showDigitalAssists: boolean;
}) {
  const { display, full } = formatCoveredDisplayName(tmName, maxLen);
  const showTitle = showDigitalAssists && display !== full;

  return (
    <span
      className="sb-covered-by-name font-semibold tracking-[-0.28px] truncate text-[var(--ios-label-tertiary)] min-w-0"
      style={{
        fontSize: nameFontSize,
        lineHeight: 1.12,
        fontFamily: COVERED_ROW_FONT,
      }}
      title={showTitle ? full : undefined}
    >
      {display}
    </span>
  );
}

function CoveredByStackRow({
  entry,
  targetSlotKey,
  rowFontSize,
  maxLen,
  showDigitalAssists,
  canSwap,
  onSwapSides,
}: {
  entry: CoveredByEntry;
  targetSlotKey?: string;
  rowFontSize: number;
  maxLen: number;
  showDigitalAssists: boolean;
  canSwap?: boolean;
  onSwapSides?: () => void;
}) {
  const badge =
    entry.side && targetSlotKey
      ? formatCoverageSideLabel(targetSlotKey, entry.side)
      : null;

  return (
    <div
      className={`sb-covered-by-stack-row ${badge ? "" : "sb-covered-by-stack-row--solo"}`}
    >
      {badge ? (
        <CoveredBySideBadge
          label={badge}
          fontSize={rowFontSize}
          interactive={canSwap}
          onClick={canSwap ? () => onSwapSides?.() : undefined}
        />
      ) : null}
      <CoveredByNameCell
        tmName={entry.tmName}
        nameFontSize={rowFontSize}
        maxLen={maxLen}
        showDigitalAssists={showDigitalAssists}
      />
    </div>
  );
}

function CoveredByNamesRow({
  entries,
  targetSlotKey,
  scale,
  rowFontSize,
  showDigitalAssists,
  onSwapSides,
}: {
  entries: CoveredByEntry[];
  targetSlotKey?: string;
  scale: CardNameScale;
  rowFontSize: number;
  showDigitalAssists: boolean;
  onSwapSides?: () => void;
}) {
  const resolved =
    entries.length === 2 ? resolveDualCoverageSides(entries) : entries;
  const dual =
    resolved.length === 2 &&
    resolved[0].side &&
    resolved[1].side &&
    targetSlotKey;
  const canSwap = showDigitalAssists && !!onSwapSides && !!dual;
  const maxLen = coveredNameDisplayMaxLen(scale);

  if (resolved.length >= 2) {
    return (
      <div
        className={`sb-covered-by-stack ${
          canSwap ? "sb-covered-by-stack--interactive" : ""
        }`}
        onClick={
          canSwap
            ? (e) => {
                e.stopPropagation();
                onSwapSides?.();
              }
            : undefined
        }
        role={canSwap ? "button" : undefined}
        title={canSwap ? "Tap to swap A/B positions" : undefined}
      >
        {resolved.map((entry) => (
          <CoveredByStackRow
            key={`${entry.sourceKey}-${entry.tmName}-${entry.side ?? ""}`}
            entry={entry}
            targetSlotKey={dual ? targetSlotKey : undefined}
            rowFontSize={rowFontSize}
            maxLen={maxLen}
            showDigitalAssists={showDigitalAssists}
            canSwap={canSwap}
            onSwapSides={onSwapSides}
          />
        ))}
      </div>
    );
  }

  if (resolved.length === 1) {
    return (
      <div className="sb-covered-by-single min-w-0 w-full">
        <CoveredByNameCell
          tmName={resolved[0].tmName}
          nameFontSize={rowFontSize}
          maxLen={maxLen + 4}
          showDigitalAssists={showDigitalAssists}
        />
      </div>
    );
  }

  const namesLine = formatCoveredByNames(coveredByNamesFromEntries(resolved));
  return (
    <span
      className="sb-covered-by-names font-semibold tracking-[-0.28px] px-1 py-[1px] inline-block leading-tight text-center text-[var(--ios-label-tertiary)] w-full"
      style={{
        fontSize: rowFontSize,
        lineHeight: 1.12,
        fontFamily: COVERED_ROW_FONT,
      }}
    >
      {namesLine}
    </span>
  );
}

function CoveredByBlock({
  coveredBy,
  targetSlotKey,
  scale,
  showDigitalAssists,
  nameSizeOverride,
  onSwapSides,
}: {
  coveredBy: CoveredByEntry[];
  targetSlotKey?: string;
  scale: CardNameScale;
  showDigitalAssists: boolean;
  nameSizeOverride?: number;
  onSwapSides?: () => void;
}) {
  const rowFontSize =
    nameSizeOverride ??
    (showDigitalAssists
      ? COVERED_NAME_SIZE_BUILDER[scale]
      : COVERED_NAME_SIZE_PRINT[scale]);
  const labelFontSize = showDigitalAssists
    ? COVERED_LABEL_SIZE_BUILDER[scale]
    : COVERED_LABEL_SIZE_PRINT[scale];

  return (
    <div
      className={`sb-covered-by-block sb-covered-by-block--${scale} flex flex-col items-center min-w-0 w-full ${showDigitalAssists ? "" : "sb-covered-by-print"}`}
    >
      <span
        className="sb-covered-by-label font-semibold uppercase tracking-[0.18em] px-1 py-[1px] inline-block text-center text-[var(--ios-label-tertiary)]"
        style={{
          fontSize: labelFontSize,
          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
          lineHeight: 1.15,
          opacity: 0.8,
        }}
      >
        Covered by
      </span>
      <CoveredByNamesRow
        entries={coveredBy}
        targetSlotKey={targetSlotKey}
        scale={scale}
        rowFontSize={rowFontSize}
        showDigitalAssists={showDigitalAssists}
        onSwapSides={onSwapSides}
      />
    </div>
  );
}

/** Builder covered-by row — top-pinned like assigned TM names. */
export function CoveredByOverlay({
  scale,
  coveredBy,
  targetSlotKey,
  onClick,
  onSwapSides,
  nameSizeOverride,
  title = "Covered by another placement — tap to open slot",
}: {
  scale: CardNameScale;
  coveredBy: CoveredByEntry[];
  targetSlotKey?: string;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onSwapSides?: () => void;
  nameSizeOverride?: number;
  title?: string;
}) {
  return (
    <motion.div
      key="covered-by-overlay"
      className="sb-covered-by-overlay min-w-0 w-full"
      initial={{ opacity: 0.92, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ opacity: 0.92 }}
      whileTap={{ scale: 0.995 }}
      transition={premiumSpring}
      onClick={onClick}
      title={title}
    >
      <CoveredByBlock
        coveredBy={coveredBy}
        targetSlotKey={targetSlotKey}
        scale={scale}
        showDigitalAssists
        nameSizeOverride={nameSizeOverride}
        onSwapSides={onSwapSides}
      />
    </motion.div>
  );
}

/** Print / preview covered-by row — top-pinned, extra-muted vs builder. */
export function CoveredByPrintLabel({
  coveredBy,
  targetSlotKey,
  scale = "zone",
  nameSizeOverride,
}: {
  coveredBy: CoveredByEntry[];
  targetSlotKey?: string;
  scale?: CardNameScale;
  nameSizeOverride?: number;
}) {
  return (
    <CoveredByBlock
      coveredBy={coveredBy}
      targetSlotKey={targetSlotKey}
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
      className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] px-1 py-[1px] text-[var(--ios-label-tertiary)]"
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
  | { kind: "covered"; coveredBy: CoveredByEntry[] }
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
  criticalRepeat = false,
  placementTrail,
  placementTrailMatchSlotKey,
  onSwapCoverageSides,
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
  /** Prior-3 placement repeat — show inline mark beside TM name. */
  criticalRepeat?: boolean;
  /** Last 3 placement labels before tonight (newest first). */
  placementTrail?: string[];
  /** Slot key for highlighting a matching RR/zone in the prior-3 trail. */
  placementTrailMatchSlotKey?: string;
  /** Swap A/B when exactly two coverers (builder only). */
  onSwapCoverageSides?: () => void;
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
            <div className="flex items-baseline gap-1 min-w-0">
              <span
                className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block min-w-0"
                style={{
                  fontSize,
                  lineHeight: 1.02,
                  fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                }}
              >
                {state.proposedName}
              </span>
              {showDigitalAssists ? (
                <TmPlacementTrail
                  labels={placementTrail}
                  matchSlotKey={placementTrailMatchSlotKey}
                />
              ) : null}
              {criticalRepeat && showDigitalAssists ? <CriticalRepeatNameMark /> : null}
            </div>
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
            <div className="flex items-baseline gap-1 min-w-0">
              <span
                className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block min-w-0"
                style={{
                  fontSize,
                  lineHeight: 1.02,
                  fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                }}
              >
                {state.proposedName}
              </span>
              {showDigitalAssists ? (
                <TmPlacementTrail
                  labels={placementTrail}
                  matchSlotKey={placementTrailMatchSlotKey}
                />
              ) : null}
              {criticalRepeat && showDigitalAssists ? <CriticalRepeatNameMark /> : null}
            </div>
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
            <span className="inline-flex items-baseline gap-1 min-w-0">
              <span
                className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block min-w-0"
                style={{
                  fontSize,
                  lineHeight: 1.02,
                  fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                }}
              >
                {state.tmName}
              </span>
              {showDigitalAssists ? (
                <TmPlacementTrail
                  labels={placementTrail}
                  matchSlotKey={placementTrailMatchSlotKey}
                />
              ) : null}
              {criticalRepeat && showDigitalAssists ? <CriticalRepeatNameMark /> : null}
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
            <span className="inline-flex items-baseline gap-1 min-w-0">
              <span
                className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block min-w-0"
                style={{
                  fontSize: showDigitalAssists ? fontSize : fontSize,
                  lineHeight: 1.0,
                  fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                }}
              >
                {state.tmName}
              </span>
              {showDigitalAssists ? (
                <TmPlacementTrail
                  labels={placementTrail}
                  matchSlotKey={placementTrailMatchSlotKey}
                />
              ) : null}
              {criticalRepeat && showDigitalAssists ? <CriticalRepeatNameMark /> : null}
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
            coveredBy={state.coveredBy}
            targetSlotKey={placementTrailMatchSlotKey}
            onClick={onUnassignedClick}
            onSwapSides={onSwapCoverageSides}
            nameSizeOverride={nameSizeOverride}
          />
        ) : (
          <CoveredByPrintLabel
            key="covered-print"
            coveredBy={state.coveredBy}
            targetSlotKey={placementTrailMatchSlotKey}
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
          className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] text-[#9CA3AF]"
          style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
          initial={{ opacity: 0.5, y: 2, scale: 0.985 }}
          animate={{ opacity: 0.75, y: 0, scale: 1 }}
          whileHover={{ scale: 1.01, opacity: 0.9 }}
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
    ? "bg-[color-mix(in_srgb,var(--ios-label)_4%,transparent)] dark:bg-[color-mix(in_srgb,var(--ios-background-primary)_4%,transparent)]"
    : "bg-[color-mix(in_srgb,var(--ios-label)_2.5%,transparent)] dark:bg-[color-mix(in_srgb,var(--ios-background-primary)_2.5%,transparent)]";
  return <div className={`h-px w-full my-0.5 ${cls}`} />;
}

/** Builder card interior body padding + optional glass tint. */
export function cardBodyInteriorClass(showDigitalAssists: boolean, extra = ""): string {
  return `flex flex-col flex-1 min-h-0 overflow-hidden ${showDigitalAssists ? "px-2.5 pt-2" : "px-3 pt-2"} ${extra}`.trim();
}

export function cardBodyInteriorStyle(showDigitalAssists: boolean, paddingBottom: number): React.CSSProperties {
  return {
    paddingBottom,
    background: showDigitalAssists ? "color-mix(in srgb, var(--ios-background-secondary) 2.2%, transparent)" : undefined,
    backdropFilter: showDigitalAssists ? "blur(0.5px)" : undefined,
  };
}