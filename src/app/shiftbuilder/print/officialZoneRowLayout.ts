export type OfficialZoneCardLoad = {
  names: string[];
  tasks: string[];
  hasFooter: boolean;
  compact?: boolean;
};

export type OfficialZoneRowTracks = {
  first: number;
  second: number;
  cssValue: string;
};

export type OfficialDeploymentTracks = {
  zones: number;
  restrooms: number;
  auxiliary: number;
  cssValue: string;
  restroomRows: OfficialZoneRowTracks;
};

const CARD_HEADER_PX = 28;
const CARD_BORDER_PX = 2;
const BODY_TOP_PX = 5;
const COMPACT_BODY_TOP_PX = 4;
const BODY_BOTTOM_PX = 6;
const DENSE_BODY_BOTTOM_PX = 4;
const FOOTER_PX = 20;
const SINGLE_NAME_PX = 19;
const COMPACT_SINGLE_NAME_PX = 18;
const COMPACT_DENSE_NAME_PX = 16;
const MULTIPLE_NAME_LINE_PX = 14 * 1.15;
const DENSE_MULTIPLE_NAME_LINE_PX = 13 * 1.05;
const TASK_MARGIN_PX = 9;
const COMPACT_TASK_MARGIN_PX = 8;
const DENSE_TASK_MARGIN_PX = 5;
const COMPACT_DENSE_TASK_MARGIN_PX = 4;
const TASK_LINE_PX = 11 * 1.08;
const COMPACT_TASK_LINE_PX = 10.5 * 1.08;
const DENSE_TASK_LINE_PX = 10 * 1.02;
const COMPACT_DENSE_TASK_LINE_PX = 9.5 * 1.02;
const MIN_ROW_TRACK_PX = 72;
const DEPLOYMENT_BODY_PX = 689;
const BASE_SECTION_TRACKS = {
  zones: 296,
  restrooms: 275,
  auxiliary: 118,
} as const;
const SECTION_HEADER_PX = 30;
const AUX_SECTION_HEADER_PX = 33;
const ROW_GAP_PX = 8;
const MIN_AUX_CARD_TRACK_PX = 59;

/**
 * Estimate wrapped task lines at the fixed approved-card width.
 * This deliberately errs slightly tall so print never trades legibility for
 * a mathematically tighter row.
 */
function estimatedTaskLines(
  tasks: string[],
  dense: boolean,
  compact: boolean,
): number {
  const lineCapacity = compact ? (dense ? 34 : 32) : dense ? 31 : 29;

  return tasks.reduce((total, task) => {
    const words = `- ${task}`.trim().split(/\s+/);
    let lines = 1;
    let used = 0;

    words.forEach((word) => {
      const next = used === 0 ? word.length : used + 1 + word.length;
      if (next > lineCapacity && used > 0) {
        lines += 1;
        used = word.length;
      } else {
        used = next;
      }
    });

    return total + lines;
  }, 0);
}

export function estimateOfficialZoneCardHeight(load: OfficialZoneCardLoad): number {
  const compact = load.compact === true;
  const dense =
    load.hasFooter &&
    (load.tasks.length >= (compact ? 3 : 4) ||
      (load.names.length > 1 && load.tasks.length >= 2));
  const nameHeight =
    load.names.length === 0
      ? 0
      : load.names.length === 1
        ? compact
          ? dense
            ? COMPACT_DENSE_NAME_PX
            : COMPACT_SINGLE_NAME_PX
          : SINGLE_NAME_PX
        : load.names.length *
          (compact && dense
            ? COMPACT_DENSE_NAME_PX
            : dense
              ? DENSE_MULTIPLE_NAME_LINE_PX
              : MULTIPLE_NAME_LINE_PX);
  const taskLines = estimatedTaskLines(load.tasks, dense, compact);
  const taskMargin = dense
    ? compact
      ? COMPACT_DENSE_TASK_MARGIN_PX
      : DENSE_TASK_MARGIN_PX
    : compact
      ? COMPACT_TASK_MARGIN_PX
      : TASK_MARGIN_PX;
  const taskLine = dense
    ? compact
      ? COMPACT_DENSE_TASK_LINE_PX
      : DENSE_TASK_LINE_PX
    : compact
      ? COMPACT_TASK_LINE_PX
      : TASK_LINE_PX;
  const tasksHeight =
    taskLines === 0
      ? 0
      : taskMargin + taskLines * taskLine;

  return Math.ceil(
    CARD_HEADER_PX +
      CARD_BORDER_PX +
      (compact ? COMPACT_BODY_TOP_PX : BODY_TOP_PX) +
      nameHeight +
      tasksHeight +
      (dense ? DENSE_BODY_BOTTOM_PX : BODY_BOTTOM_PX) +
      (load.hasFooter ? FOOTER_PX : 0),
  );
}

function rowNeed(cards: OfficialZoneCardLoad[]): number {
  return Math.max(
    MIN_ROW_TRACK_PX,
    ...cards.map(estimateOfficialZoneCardHeight),
  );
}

/**
 * CSS grid `fr` values preserve the fixed section footprint while dividing
 * its available height in proportion to the content each visual row needs.
 */
export function solveOfficialZoneRowTracks(
  firstRow: OfficialZoneCardLoad[],
  secondRow: OfficialZoneCardLoad[],
): OfficialZoneRowTracks {
  const first = rowNeed(firstRow);
  const second = rowNeed(secondRow);

  return {
    first,
    second,
    cssValue: `${first}fr ${second}fr`,
  };
}

function sectionNeed(rows: OfficialZoneRowTracks): number {
  return SECTION_HEADER_PX + rows.first + rows.second + ROW_GAP_PX;
}

function auxSectionNeed(cards: OfficialZoneCardLoad[]): number {
  return (
    AUX_SECTION_HEADER_PX +
    Math.max(
      MIN_AUX_CARD_TRACK_PX,
      ...cards.map(estimateOfficialZoneCardHeight),
    )
  );
}

/**
 * Keep the approved page's fixed 689px deployment footprint, but let a dense
 * section borrow unused height from a lighter one. This prevents card bodies
 * from being hidden behind coverage footers while retaining the normal
 * 296/275/118 proportions whenever all content fits those defaults.
 */
export function solveOfficialDeploymentTracks({
  zoneRows,
  restroomRows,
  auxiliaryCards,
}: {
  zoneRows: [OfficialZoneCardLoad[], OfficialZoneCardLoad[]];
  restroomRows: [OfficialZoneCardLoad[], OfficialZoneCardLoad[]];
  auxiliaryCards: OfficialZoneCardLoad[];
}): OfficialDeploymentTracks {
  const solvedZoneRows = solveOfficialZoneRowTracks(...zoneRows);
  const solvedRestroomRows = solveOfficialZoneRowTracks(...restroomRows);
  const required = {
    zones: sectionNeed(solvedZoneRows),
    restrooms: sectionNeed(solvedRestroomRows),
    auxiliary: auxSectionNeed(auxiliaryCards),
  };
  const tracks = { ...required };
  let remaining =
    DEPLOYMENT_BODY_PX -
    tracks.zones -
    tracks.restrooms -
    tracks.auxiliary;

  if (remaining >= 0) {
    (["zones", "restrooms", "auxiliary"] as const).forEach((section) => {
      const towardDefault = Math.max(
        0,
        BASE_SECTION_TRACKS[section] - tracks[section],
      );
      const addition = Math.min(remaining, towardDefault);
      tracks[section] += addition;
      remaining -= addition;
    });
    tracks.auxiliary += remaining;
  } else {
    // Truly overfull pages still need a valid fixed-height grid. Remove the
    // unavoidable deficit from the sections with the most room above their
    // hard structural floors, preserving Auxiliary's usable single card row.
    const floors = {
      zones: SECTION_HEADER_PX + MIN_ROW_TRACK_PX * 2 + ROW_GAP_PX,
      restrooms: SECTION_HEADER_PX + MIN_ROW_TRACK_PX * 2 + ROW_GAP_PX,
      auxiliary: AUX_SECTION_HEADER_PX + MIN_AUX_CARD_TRACK_PX,
    };
    let deficit = -remaining;
    (["auxiliary", "zones", "restrooms"] as const).forEach((section) => {
      const removable = Math.max(0, tracks[section] - floors[section]);
      const reduction = Math.min(deficit, removable);
      tracks[section] -= reduction;
      deficit -= reduction;
    });
  }

  return {
    ...tracks,
    cssValue: `${tracks.zones}px ${tracks.restrooms}px ${tracks.auxiliary}px`,
    restroomRows: solvedRestroomRows,
  };
}
