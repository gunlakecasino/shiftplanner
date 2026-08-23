"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { COVERAGE_BAR_H } from "@/lib/shiftbuilder/constants";
import { premiumSpring, premiumSpringReduced } from "@/lib/premiumSpring";
import { placementIdentityKey } from "@/lib/shiftbuilder/boardMotion";
import { AssignmentSkeleton } from "./builderPrimitives";
import { cardAccentInk, isGoldAccent } from "@/lib/shiftbuilder/constants";
import {
  coveredByNamesFromEntries,
  formatCoverageSideLabel,
  formatCoveredByNames,
  formatCoveredDisplayName,
  resolveDualCoverageSides,
  type CoveredByEntry,
} from "@/lib/shiftbuilder/coverageHelpers";
import { trailLabelMatchesSlotKey } from "./placementPadHelpers";
import {
  formatCanvasRepeatReason,
  formatCanvasTrailChip,
} from "@/lib/shiftbuilder/canvasPrideLabels";

const CRITICAL_REPEAT_MARK_COLOR = "#B91C1C";

/**
 * Last 3 grave placements before tonight (newest first).
 *
 * Layout contract: always a **secondary row under the TM name** — never inline
 * on the name baseline. Inline trails fought the 24px name type on narrow RR
 * halves (wrapped chips, ragged right edge, name truncation). Under-name row
 * keeps name primary and trail scannable as quiet metadata.
 */
export function TmPlacementTrail({
  labels,
  matchSlotKey,
}: {
  labels?: string[];
  /** When set, matching trail chips use critical-repeat styling (RR8M/MRR8, etc.). */
  matchSlotKey?: string;
}) {
  if (!labels?.length) return null;

  const chips = labels.map((code) => ({
    code,
    ...formatCanvasTrailChip(code),
    isRepeat: !!matchSlotKey && trailLabelMatchesSlotKey(code, matchSlotKey),
  }));
  const repeatChip = chips.find((chip) => chip.isRepeat);
  const full = chips.map((chip) => chip.label).join(" → ");
  const repeatReason = repeatChip
    ? formatCanvasRepeatReason(matchSlotKey ?? repeatChip.code)
    : undefined;

  return (
    <span
      className="sb-tm-placement-trail no-print flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0 max-w-full mt-[3px] leading-none"
      title={
        repeatReason
          ? `${repeatReason}. Last ${labels.length} nights: ${full}`
          : `Last ${labels.length} placements (newest first): ${full}`
      }
      aria-label={
        repeatReason
          ? `${repeatReason}. Recent placements: ${chips.map((chip) => chip.label).join(", ")}`
          : `Recent placements: ${chips.map((chip) => chip.label).join(", ")}`
      }
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {chips.map((chip, i) => (
        <span
          key={`${chip.code}-${i}`}
          className={`sb-tm-trail-chip ${
            chip.isRepeat ? "sb-tm-trail-chip--repeat" : ""
          }`}
          title={chip.isRepeat ? repeatReason : chip.title}
        >
          {chip.label}
        </span>
      ))}
    </span>
  );
}

/** Name row + optional under-name trail + critical mark — shared card name stack. */
export function TmNameBlock({
  name,
  fontSize,
  placementTrail,
  placementTrailMatchSlotKey,
  criticalRepeat = false,
  trailing,
  className = "",
  nameClassName = "",
}: {
  name: string;
  fontSize: number;
  placementTrail?: string[];
  placementTrailMatchSlotKey?: string;
  criticalRepeat?: boolean;
  /** Extra end-of-name-row content (draft "D" badge, etc.). */
  trailing?: React.ReactNode;
  className?: string;
  nameClassName?: string;
}) {
  return (
    <div className={`flex flex-col min-w-0 w-full ${className}`.trim()}>
      <div className="flex items-center gap-1 min-w-0">
        <span
          className={`sb-tm-primary-name font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate min-w-0 ${nameClassName}`.trim()}
          style={{
            fontSize,
            lineHeight: 1.05,
            fontFamily: "var(--font-bricolage, var(--font-atkinson))",
          }}
        >
          {name}
        </span>
        {trailing}
        {criticalRepeat ? (
          <CriticalRepeatNameMark
            title={
              placementTrailMatchSlotKey
                ? formatCanvasRepeatReason(placementTrailMatchSlotKey)
                : undefined
            }
          />
        ) : null}
      </div>
      <TmPlacementTrail
        labels={placementTrail}
        matchSlotKey={placementTrailMatchSlotKey}
      />
    </div>
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
    `${formatCanvasRepeatReason()} — rotation health capped at 50%`;

  return (
    <span
      className="sb-critical-repeat-mark no-print inline-flex shrink-0 items-center rounded px-1 font-semibold leading-none"
      style={{
        fontSize: 8,
        letterSpacing: "0.02em",
        color: CRITICAL_REPEAT_MARK_COLOR,
        background: "color-mix(in srgb, #B91C1C 10%, transparent)",
        marginTop: "0.2em",
      }}
      title={tip}
      aria-label={tip}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      Repeat
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
  { labelSize: number; padding: string }
> = {
  zone: { labelSize: 12, padding: "py-1" },
  rr: { labelSize: 11, padding: "py-0.5" },
  aux: { labelSize: 11, padding: "py-0.5" },
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

/** Accent stripe — the live SheetBuilder redesign promotes this into a full-width top bar. */
export function CardAccentStripe({ color }: { color: string }) {
  return (
    <div
      className={`sb-card-accent-stripe h-[3px] w-full shrink-0 ${isGoldAccent(color) ? "sb-accent-stripe--gold" : ""}`}
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
      className={`sb-card-slot-header flex items-center justify-between gap-1.5 px-3.5 ${compact ? "pt-2 pb-1.5" : "pt-2.5 pb-2"} leading-none`}
      style={{ color: ink }}
    >
      <div className="flex items-center gap-1.5 leading-none min-w-0" style={{ color: ink }}>
        {icon != null ? (
          <span className="text-[12px] leading-none shrink-0">{icon}</span>
        ) : null}
        {React.isValidElement(label) ? (
          <div className="min-w-0 flex-1">{label}</div>
        ) : (
          <span
            className={`sb-canvas-slot-label font-semibold tracking-[0.04em] uppercase truncate ${titleClassName ?? ""}`}
            style={{
              fontSize: 10,
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              letterSpacing: "0.04em",
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

/** Builder-only empty-slot invite — one quiet tap target, no demo stack. */
export function UnassignedInvite({
  size,
  onClick,
  title = "Assign team member",
}: {
  size: UnassignedInviteSize;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  title?: string;
}) {
  const cfg = INVITE_CONFIG[size];

  return (
    <motion.div
      key="unassigned-invite"
      role="button"
      tabIndex={0}
      className={`sb-unassigned-invite sb-interactive flex items-center justify-start text-[#94A3B8] tracking-[0.01em] rounded-[8px] cursor-pointer w-full shrink-0 ${cfg.padding}`}
      data-invite-size={size}
      style={{
        fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
      }}
      initial={false}
      animate={{ opacity: 1 }}
      whileTap={{ scale: 0.99 }}
      transition={premiumSpringReduced}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
        }
      }}
      title={title}
    >
      <span
        className="font-medium tracking-[0.01em] text-[#94A3B8]"
        style={{ fontSize: cfg.labelSize, opacity: 0.92 }}
      >
        Assign TM
      </span>
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
      className="sb-covered-by-names font-semibold tracking-[-0.28px] px-1 py-[1px] inline-block leading-tight text-[var(--ios-label-tertiary)] w-full"
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
      className={`sb-covered-by-block sb-covered-by-block--${scale} flex flex-col min-w-0 w-full ${showDigitalAssists ? "items-start text-left" : "items-center sb-covered-by-print"}`}
    >
      <span
        className={`sb-covered-by-label font-semibold uppercase tracking-[0.18em] px-1 py-[1px] inline-block text-[var(--ios-label-tertiary)] ${showDigitalAssists ? "text-left" : "text-center"}`}
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
export function UnassignedPrintLabel({ showDigitalAssists: _showDigitalAssists }: { showDigitalAssists: boolean }) {
  return (
    <div
      className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px] px-1 py-[1px] text-[var(--ios-label-tertiary)]"
      style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    >
      <span className="sb-unassigned-primary">— Unassigned —</span>
    </div>
  );
}

export type SlotAssignmentState =
  | { kind: "loading" }
  | { kind: "draft"; proposedName: string; proposedTmId?: string; previousName?: string }
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
  projectPills,
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
  /** Builder-only dated project pills, placed above the TM name. */
  projectPills?: React.ReactNode;
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
            key={placementIdentityKey(state)}
            className="flex flex-col min-w-0 relative pl-2 border-l-[3px] border-[var(--sb-gold-border)] rounded-l"
            initial={false}
            animate={{ opacity: 1 }}
            transition={reducedMotion ? premiumSpringReduced : premiumSpring}
          >
            {projectPills}
            <TmNameBlock
              name={state.proposedName}
              fontSize={fontSize}
              placementTrail={placementTrail}
              placementTrailMatchSlotKey={placementTrailMatchSlotKey}
              criticalRepeat={criticalRepeat}
              trailing={
                <span
                  className="text-[8px] font-semibold px-1 rounded leading-none shrink-0"
                  style={{
                    paddingTop: "1px",
                    paddingBottom: "1px",
                    background: "var(--sb-gold-surface)",
                    color: "var(--sb-gold-ink)",
                  }}
                  title="Draft change from optimizer"
                >
                  D
                </span>
              }
            />
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
          <div key={placementIdentityKey(state)} className="flex flex-col min-w-0">
            <TmNameBlock
              name={state.proposedName}
              fontSize={fontSize}
              criticalRepeat={false}
              trailing={
                <span
                  className="text-[8px] font-semibold px-1 rounded leading-none shrink-0"
                  style={{
                    paddingTop: "1px",
                    paddingBottom: "1px",
                    background: "var(--sb-gold-surface)",
                    color: "var(--sb-gold-ink)",
                  }}
                  title="Draft change from optimizer"
                >
                  D
                </span>
              }
            />
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
            key={placementIdentityKey(state)}
            className="flex items-start gap-1 min-w-0 w-full"
            initial={false}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reducedMotion
                ? premiumSpringReduced
                : { ...premiumSpring, stiffness: 420, damping: 32 }
            }
          >
            {state.isLocked ? (
              <span className="mt-[0.35em] shrink-0">
                <LockIcon size={lockSize} />
              </span>
            ) : null}
            <div className="flex flex-col min-w-0 w-full">
              {projectPills}
              <TmNameBlock
                name={state.tmName}
                fontSize={fontSize}
                placementTrail={placementTrail}
                placementTrailMatchSlotKey={placementTrailMatchSlotKey}
                criticalRepeat={criticalRepeat}
              />
            </div>
            {isDuplicate ? (
              <DuplicateTmBadge otherSlots={otherSlotsForTm} animate />
            ) : null}
          </motion.div>
        ) : (
          <div
            key={placementIdentityKey(state)}
            className="flex items-center gap-1.5 min-w-0"
          >
            {state.isLocked ? <LockIcon size={lockSize} /> : null}
            <span
              className="font-bold tracking-[-0.35px] text-[#111] dark:text-[#F2F2F4] truncate px-1 py-[1px] inline-block min-w-0"
              style={{
                fontSize,
                lineHeight: 1.0,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {state.tmName}
            </span>
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
        <div key="unassigned" className="flex flex-col justify-start min-h-0">
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
          transition={premiumSpring}
          onClick={onUnassignedClick}
        >
          <span className="sb-unassigned-primary">— Unassigned —</span>
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
  };
}
