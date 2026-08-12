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
const TALL_TASK_STACK_SAFETY_PX = 10;
const TALL_TASK_STACK_LINE_THRESHOLD = 6;
const SINGLE_NAME_LINE_CAPACITY = 18;
const COMPACT_SINGLE_NAME_LINE_CAPACITY = 19;
const COMPACT_DENSE_NAME_LINE_CAPACITY = 21;
const MULTIPLE_NAME_LINE_CAPACITY = 24;
const DENSE_MULTIPLE_NAME_LINE_CAPACITY = 26;
const DENSE_CARD_TASK_THRESHOLD = 8;
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
const MIN_AUX_MINI_ROW_PX = 42;

/**
 * Estimate wrapped task lines at the fixed approved-card width.
 * This deliberately errs slightly tall so print never trades legibility for
 * a mathematically tighter row.
 */
function estimatedWrappedLines(value: string, lineCapacity: number): number {
  const words = value.trim().split(/\s+/);
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

  return lines;
}

function estimatedTaskLines(
  tasks: string[],
  dense: boolean,
  compact: boolean,
): number {
  const lineCapacity = compact ? (dense ? 34 : 32) : dense ? 31 : 29;

  return tasks.reduce(
    (total, task) =>
      total + estimatedWrappedLines(`- ${task}`, lineCapacity),
    0,
  );
}

function estimatedNameLines(
  names: string[],
  dense: boolean,
  compact: boolean,
): number {
  const multiple = names.length > 1;
  const lineCapacity = multiple
    ? dense
      ? DENSE_MULTIPLE_NAME_LINE_CAPACITY
      : MULTIPLE_NAME_LINE_CAPACITY
    : compact
      ? dense
        ? COMPACT_DENSE_NAME_LINE_CAPACITY
        : COMPACT_SINGLE_NAME_LINE_CAPACITY
      : SINGLE_NAME_LINE_CAPACITY;

  return names.reduce(
    (total, name) => total + estimatedWrappedLines(name, lineCapacity),
    0,
  );
}

export function isOfficialZoneCardDense(load: OfficialZoneCardLoad): boolean {
  const compact = load.compact === true;
  return (
    load.tasks.length >= DENSE_CARD_TASK_THRESHOLD ||
    (load.hasFooter &&
      (load.tasks.length >= (compact ? 3 : 4) ||
        (load.names.length > 1 && load.tasks.length >= 2)))
  );
}

export function estimateOfficialZoneCardHeight(load: OfficialZoneCardLoad): number {
  const compact = load.compact === true;
  const dense = isOfficialZoneCardDense(load);
  const nameLines = estimatedNameLines(load.names, dense, compact);
  const nameHeight =
    nameLines === 0
      ? 0
      : load.names.length === 1
        ? nameLines *
          (compact
            ? dense
              ? COMPACT_DENSE_NAME_PX
              : COMPACT_SINGLE_NAME_PX
            : SINGLE_NAME_PX)
        : nameLines *
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
      : taskMargin +
        taskLines * taskLine +
        (taskLines >= TALL_TASK_STACK_LINE_THRESHOLD
          ? TALL_TASK_STACK_SAFETY_PX
          : 0);

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

function auxSectionNeed(
  cards: OfficialZoneCardLoad[],
  rowCount: number,
): number {
  if (rowCount > 1) {
    return (
      AUX_SECTION_HEADER_PX +
      rowCount * MIN_AUX_MINI_ROW_PX +
      (rowCount - 1) * ROW_GAP_PX
    );
  }

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
  auxiliaryRows = 1,
}: {
  zoneRows: [OfficialZoneCardLoad[], OfficialZoneCardLoad[]];
  restroomRows: [OfficialZoneCardLoad[], OfficialZoneCardLoad[]];
  auxiliaryCards: OfficialZoneCardLoad[];
  auxiliaryRows?: number;
}): OfficialDeploymentTracks {
  const solvedZoneRows = solveOfficialZoneRowTracks(...zoneRows);
  const solvedRestroomRows = solveOfficialZoneRowTracks(...restroomRows);
  const required = {
    zones: sectionNeed(solvedZoneRows),
    restrooms: sectionNeed(solvedRestroomRows),
    auxiliary: auxSectionNeed(auxiliaryCards, auxiliaryRows),
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
      auxiliary: required.auxiliary,
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
