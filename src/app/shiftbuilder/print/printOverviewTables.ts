import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  ZONE_DEFS,
  RR_DEFS,
  DEFAULT_AUX_DEFS,
  ZONE_COLORS,
  RR_COLORS,
  AUX_COLORS,
} from "@/lib/shiftbuilder/constants";

/** Golden print artboard height in CSS px (11×8.5" @ 96dpi). */
const ARTBOARD_H = 816;
const ARTBOARD_W = 1056;
const STRIPE_H = 4;
const SECTION_COUNT = 3;

/** Matches SHIFT_DAY_COLORS order (Fri → Thu). */
export const OVERVIEW_DAY_STRIPE_COLORS = [
  "#C13A14",
  "#0065bf",
  "#4d1a8a",
  "#1f7a3d",
  "#b8860b",
  "#8b4513",
  "#2f4f4f",
];

export interface OverviewAssignment {
  tmId: string;
  tmName: string;
  breakGroup?: number;
}

export interface OverviewNight {
  dayIndex: number;
  assignments: Record<string, OverviewAssignment | null>;
}

export type OverviewSlotRow = {
  key: string;
  label: string;
  section: "ZONES" | "RESTROOMS" | "SUPPORT";
  accent: string;
};

export function buildOverviewSlotRows(): OverviewSlotRow[] {
  const rows: OverviewSlotRow[] = [];
  ZONE_DEFS.forEach((z) =>
    rows.push({
      key: z.key,
      label: z.label,
      section: "ZONES",
      accent: ZONE_COLORS[z.key] ?? "#6B7280",
    }),
  );
  RR_DEFS.forEach((rr) => {
    rows.push({
      key: `MRR${rr.num}`,
      label: `${rr.label} M`,
      section: "RESTROOMS",
      accent: RR_COLORS[rr.num] ?? "#6B7280",
    });
    rows.push({
      key: `WRR${rr.num}`,
      label: `${rr.label} W`,
      section: "RESTROOMS",
      accent: RR_COLORS[rr.num] ?? "#6B7280",
    });
  });
  DEFAULT_AUX_DEFS.forEach((a) =>
    rows.push({
      key: a.key,
      label: a.label,
      section: "SUPPORT",
      accent: AUX_COLORS[a.key] ?? "#6B7280",
    }),
  );
  return rows;
}

type DailyLayout = {
  slotColW: number;
  rowH: number;
  secH: number;
  nameMax: number;
  fontSize: number;
  headerFont: number;
};

type WeeklyLayout = DailyLayout & {
  bannerH: number;
  colHdrH: number;
  headCountH: number;
  tableBodyH: number;
  rowHeights: number[];
  bannerPad: string;
  titleSize: number;
  subtitleSize: number;
  slotFontSize: number;
  compactSlots: boolean;
  useFirstName: boolean;
  showHeadcountRatio: boolean;
};

function layoutForDaily(): DailyLayout {
  return { slotColW: 148, rowH: 26, secH: 22, nameMax: 34, fontSize: 10.5, headerFont: 11 };
}

/** Distribute `total` px across `count` rows — remainder +1px on first rows. */
function exactRowHeights(total: number, count: number, minH: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => Math.max(minH, base + (i < remainder ? 1 : 0)));
}

/**
 * Solve weekly overview dimensions so chrome + sections + data rows === ARTBOARD_H exactly.
 * Guarantees one-page fit for up to 7 night columns and the full slot catalog.
 */
function layoutForWeekly(columnCount: number, slotRowCount: number): WeeklyLayout {
  const compact = columnCount >= 5;
  const bannerH = compact ? 32 : 38;
  const colHdrH = compact ? 19 : 22;
  const tableBodyH = ARTBOARD_H - STRIPE_H - bannerH - colHdrH;

  const headCountH = columnCount >= 7 ? 15 : columnCount >= 5 ? 16 : 18;
  const secH = columnCount >= 7 ? 13 : columnCount >= 5 ? 14 : 16;
  const sectionTotal = SECTION_COUNT * secH;
  // +1 border between headcount row and first section
  const borderTotal = SECTION_COUNT + slotRowCount + 1;
  const rowBudget = tableBodyH - sectionTotal - borderTotal - headCountH;

  const minRowH = 15;
  const rowHeights = exactRowHeights(rowBudget, slotRowCount, minRowH);
  const rowH = rowHeights[0] ?? Math.floor(rowBudget / slotRowCount);

  const slotColW =
    columnCount >= 7 ? 64 : columnCount >= 6 ? 70 : columnCount >= 5 ? 76 : columnCount >= 4 ? 86 : 96;

  const dayColW = Math.floor((ARTBOARD_W - slotColW) / columnCount);
  const nameMax =
    dayColW >= 120 ? 16 : dayColW >= 100 ? 13 : dayColW >= 82 ? 10 : dayColW >= 68 ? 8 : 6;

  const fontSize = rowH >= 22 ? 9.5 : rowH >= 19 ? 9 : rowH >= 16 ? 8.5 : 8;

  return {
    slotColW,
    rowH,
    rowHeights,
    secH,
    nameMax,
    fontSize,
    headerFont: compact ? 8.5 : 9.5,
    slotFontSize: compact ? 7.5 : 8.5,
    bannerH,
    colHdrH,
    headCountH,
    tableBodyH,
    bannerPad: compact ? "4px 12px 3px" : "6px 14px 5px",
    titleSize: compact ? 10.5 : 11.5,
    subtitleSize: 8,
    compactSlots: columnCount >= 4,
    useFirstName: columnCount >= 5,
    showHeadcountRatio: columnCount < 6,
  };
}

function countFilledSlots(night: OverviewNight, slotRows: OverviewSlotRow[]): number {
  let filled = 0;
  for (const slot of slotRows) {
    if (night.assignments[slot.key]?.tmId) filled++;
  }
  return filled;
}

function renderHeadCountRow(params: {
  slotColW: number;
  rowH: number;
  label: string;
  cellsHTML: string;
  trailingCell?: string;
}): string {
  return (
    `<div style="display:flex;height:${params.rowH}px;flex-shrink:0;border-bottom:1px solid #C8C8CC;background:#F0F4FF;box-sizing:border-box;">` +
    `<div style="width:${params.slotColW}px;height:${params.rowH}px;display:flex;align-items:center;padding:0 6px;` +
    `font-size:7.5px;font-weight:800;color:#4B5563;letter-spacing:0.06em;text-transform:uppercase;` +
    `border-right:1px solid #D1D5DB;box-sizing:border-box;">${params.label}</div>` +
    `${params.cellsHTML}` +
    `${params.trailingCell ?? ""}</div>`
  );
}

function weeklyHeadCountCells(
  nightDefs: { night: OverviewNight; def: DayDef }[],
  slotRows: OverviewSlotRow[],
  layout: WeeklyLayout,
): string {
  const total = slotRows.length;
  return nightDefs
    .map(({ night, def }) => {
      const filled = countFilledSlots(night, slotRows);
      const ratio = layout.showHeadcountRatio
        ? `<span style="font-size:${layout.fontSize - 0.5}px;font-weight:600;color:#8E8E93;">/${total}</span>`
        : "";
      return (
        `<div style="flex:1;height:${layout.headCountH}px;display:flex;align-items:center;justify-content:center;gap:2px;` +
        `border-left:1px solid #D1D5DB;box-sizing:border-box;">` +
        `<span style="font-size:${layout.fontSize + 0.5}px;font-weight:800;color:${def.color};line-height:1;">${filled}</span>` +
        `${ratio}</div>`
      );
    })
    .join("");
}

function compactSlotLabel(row: OverviewSlotRow): string {
  if (row.section === "ZONES") {
    return row.key;
  }
  if (row.section === "RESTROOMS") {
    const side = row.key.startsWith("M") ? "M" : "W";
    const num = row.key.replace(/^[MW]RR/, "");
    return `R${num}${side}`;
  }
  if (row.label.startsWith("TRASH")) return row.label.replace("TRASH ", "TR");
  if (row.label.startsWith("SUPPORT")) return row.label.replace("SUPPORT ", "SP");
  return row.label;
}

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name;
  return max <= 3 ? name.slice(0, max) : `${name.slice(0, max - 1)}…`;
}

function displayTmName(name: string, layout: Pick<WeeklyLayout, "nameMax" | "useFirstName">): string {
  if (name === "—") return name;
  if (layout.useFirstName) {
    const parts = name.trim().split(/\s+/);
    if (parts.length > 1) {
      const first = parts[0];
      if (first.length <= layout.nameMax) return first;
    }
  }
  return truncateName(name, layout.nameMax);
}

function breakBadge(group?: number): string {
  if (!group || group <= 0) return "";
  const colors = ["", "#34C759", "#FF9F0A", "#5856D6"];
  const bg = colors[group] ?? "#8E8E93";
  return (
    `<span style="display:inline-flex;align-items:center;justify-content:center;` +
    `min-width:14px;height:14px;padding:0 3px;border-radius:3px;font-size:7.5px;font-weight:800;` +
    `color:#fff;background:${bg};margin-left:4px;flex-shrink:0;">${group}</span>`
  );
}

function renderSectionRows(
  slotRows: OverviewSlotRow[],
  layout: DailyLayout | WeeklyLayout,
  renderCells: (slot: OverviewSlotRow, rowIndex: number, rowH: number) => string,
  opts?: { fixedHeights?: number[]; compactSlots?: boolean },
): string {
  const fixedHeights = opts?.fixedHeights;
  let rowIdx = 0;
  let html = "";

  (["ZONES", "RESTROOMS", "SUPPORT"] as const).forEach((sec) => {
    const rows = slotRows.filter((r) => r.section === sec);
    if (!rows.length) return;
    html +=
      `<div style="display:flex;align-items:center;height:${layout.secH}px;background:#F2F2F7;` +
      `border-top:1px solid #C8C8CC;flex-shrink:0;box-sizing:border-box;">` +
      `<div style="width:${layout.slotColW}px;padding:0 6px;font-size:8px;font-weight:800;color:#6B7280;` +
      `letter-spacing:0.08em;text-transform:uppercase;box-sizing:border-box;">${sec}</div>` +
      `<div style="flex:1;"></div></div>`;

    rows.forEach((slot, ri) => {
      const rowH = fixedHeights?.[rowIdx] ?? layout.rowH;
      rowIdx += 1;
      const bg = ri % 2 === 0 ? "#FFFFFF" : "#F9F9FB";
      const slotLabel = opts?.compactSlots ? compactSlotLabel(slot) : slot.label;
      const slotFont = "slotFontSize" in layout ? layout.slotFontSize : layout.fontSize;
      html +=
        `<div style="display:flex;align-items:center;height:${rowH}px;background:${bg};` +
        `border-top:1px solid #F2F2F7;flex-shrink:0;box-sizing:border-box;">` +
        `<div style="width:${layout.slotColW}px;height:${rowH}px;line-height:${rowH}px;padding:0 6px;` +
        `font-size:${slotFont}px;font-weight:700;color:${slot.accent};overflow:hidden;text-overflow:ellipsis;` +
        `white-space:nowrap;border-right:1px solid #E5E5EA;flex-shrink:0;box-sizing:border-box;">${slotLabel}</div>` +
        `${renderCells(slot, ri, rowH)}</div>`;
    });
  });
  return html;
}

function overviewShell(params: {
  title: string;
  subtitle: string;
  slotColW: number;
  headerCells: string;
  tableRowsHTML: string;
  weekly?: Pick<WeeklyLayout, "bannerH" | "colHdrH" | "tableBodyH" | "bannerPad" | "titleSize" | "subtitleSize">;
}): string {
  const stripeHTML = OVERVIEW_DAY_STRIPE_COLORS.map(
    (c) => `<div style="flex:1;height:4px;background:${c};"></div>`,
  ).join("");

  const weekly = params.weekly;
  const bannerPad = weekly?.bannerPad ?? "8px 16px 6px";
  const titleSize = weekly?.titleSize ?? 13;
  const subtitleSize = weekly?.subtitleSize ?? 9;
  const bannerH = weekly?.bannerH;
  const colHdrH = weekly?.colHdrH ?? 24;
  const tableBodyH = weekly?.tableBodyH;

  const bannerStyle = bannerH
    ? `height:${bannerH}px;padding:${bannerPad};box-sizing:border-box;`
    : `padding:${bannerPad};`;

  const colHdrStyle = weekly
    ? `height:${colHdrH}px;box-sizing:border-box;`
    : "";

  const tableStyle = tableBodyH
    ? `height:${tableBodyH}px;overflow:hidden;flex-shrink:0;`
    : `flex:1;overflow:hidden;`;

  return (
    `<div class="print-artboard" style="height:${ARTBOARD_H}px;width:${ARTBOARD_W}px;padding:0;display:flex;flex-direction:column;overflow:hidden;background:#FFFFFF;box-sizing:border-box;">` +
    `<div style="display:flex;flex-shrink:0;height:${STRIPE_H}px;">${stripeHTML}</div>` +
    `<div style="background:linear-gradient(135deg,#1C1C1E 0%,#2C2C2E 100%);${bannerStyle}` +
    `flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">` +
    `<div style="min-width:0;">` +
    `<div style="font-size:${titleSize}px;font-weight:800;color:#FFFFFF;letter-spacing:0.05em;text-transform:uppercase;line-height:1.15;">${params.title}</div>` +
    `<div style="font-size:${subtitleSize}px;font-weight:500;color:#8E8E93;margin-top:1px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${params.subtitle}</div></div>` +
    `<div style="font-size:9px;font-weight:600;color:#636366;letter-spacing:0.02em;flex-shrink:0;margin-left:10px;">GLCR GRAVE SHIFT</div></div>` +
    `<div style="display:flex;background:#F8F8FB;border-bottom:2px solid #C8C8CC;flex-shrink:0;${colHdrStyle}">` +
    `<div style="width:${params.slotColW}px;padding:3px 6px;font-size:8px;font-weight:700;color:#8E8E93;text-transform:uppercase;letter-spacing:0.06em;display:flex;align-items:center;box-sizing:border-box;">Slot</div>` +
    `${params.headerCells}</div>` +
    `<div style="${tableStyle}display:flex;flex-direction:column;box-sizing:border-box;">${params.tableRowsHTML}</div>` +
    `</div>`
  );
}

/** Single-night overview: slot grid with full names + break group badges. */
export function buildDailyOverviewArtboardHTML(
  night: OverviewNight,
  dayDef: DayDef,
  slotRows: OverviewSlotRow[] = buildOverviewSlotRows(),
): string {
  const layout = layoutForDaily();
  const filled = countFilledSlots(night, slotRows);
  const headCountH = 20;

  const headerCells =
    `<div style="flex:1;display:flex;align-items:center;justify-content:center;padding:3px 8px;` +
    `border-left:1px solid #E5E5EA;font-size:${layout.headerFont}px;font-weight:700;color:${dayDef.color};box-sizing:border-box;">` +
    `${dayDef.name.toUpperCase()} ${dayDef.dateNum}</div>` +
    `<div style="width:48px;text-align:center;padding:3px 4px;font-size:8px;font-weight:700;color:#8E8E93;` +
    `text-transform:uppercase;letter-spacing:0.05em;border-left:1px solid #E5E5EA;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">Brk</div>`;

  const headCountRow = renderHeadCountRow({
    slotColW: layout.slotColW,
    rowH: headCountH,
    label: "Headcount",
    cellsHTML:
      `<div style="flex:1;height:${headCountH}px;display:flex;align-items:center;justify-content:center;gap:4px;` +
      `border-left:1px solid #D1D5DB;box-sizing:border-box;">` +
      `<span style="font-size:${layout.fontSize + 1}px;font-weight:800;color:${dayDef.color};">${filled}</span>` +
      `<span style="font-size:${layout.fontSize}px;font-weight:600;color:#8E8E93;">/${slotRows.length}</span></div>`,
    trailingCell:
      `<div style="width:48px;height:${headCountH}px;border-left:1px solid #D1D5DB;box-sizing:border-box;"></div>`,
  });

  const tableRowsHTML =
    headCountRow +
    renderSectionRows(slotRows, layout, (slot, _ri, rowH) => {
    const asgn = night.assignments[slot.key];
    const name = asgn?.tmName ?? "—";
    const disp = truncateName(name, layout.nameMax);
    const filledCell = !!asgn?.tmId;
    return (
      `<div style="flex:1;display:flex;align-items:center;height:${rowH}px;padding:0 8px;` +
      `font-size:${layout.fontSize}px;font-weight:${filledCell ? "600" : "400"};color:${filledCell ? "#1C1C1E" : "#AEAEB2"};` +
      `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid #EBEBF0;box-sizing:border-box;">${disp}</div>` +
      `<div style="width:48px;display:flex;align-items:center;justify-content:center;height:${rowH}px;` +
      `border-left:1px solid #EBEBF0;box-sizing:border-box;">${breakBadge(asgn?.breakGroup)}</div>`
    );
    });

  return overviewShell({
    title: "Night Overview",
    subtitle: `${dayDef.name} ${dayDef.dateNum} · ${dayDef.monthYear} · ${slotRows.length} slots`,
    slotColW: layout.slotColW,
    headerCells,
    tableRowsHTML,
  });
}

/** Multi-night overview: height-budget layout guaranteed to fit one landscape page. */
export function buildWeeklyOverviewArtboardHTML(
  overviewNights: OverviewNight[],
  dayDefs: DayDef[],
  slotRows: OverviewSlotRow[] = buildOverviewSlotRows(),
): string {
  const nights = [...overviewNights].sort((a, b) => a.dayIndex - b.dayIndex);
  const layout = layoutForWeekly(nights.length, slotRows.length);

  const nightDefs = nights.map((n) => ({
    night: n,
    def:
      dayDefs[n.dayIndex] ??
      ({
        name: `Day ${n.dayIndex}`,
        short: "?",
        color: "#6B7280",
        dateNum: 0,
        monthYear: "",
      } as DayDef),
  }));

  const dayLabel = (def: DayDef) => `${def.name.slice(0, 3).toUpperCase()} ${def.dateNum}`;

  const colHeaderCells = nightDefs
    .map(
      ({ def }) =>
        `<div style="flex:1;text-align:center;font-size:${layout.headerFont}px;font-weight:700;color:${def.color};` +
        `padding:2px 1px;letter-spacing:0.02em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` +
        `border-left:1px solid #E5E5EA;display:flex;align-items:center;justify-content:center;box-sizing:border-box;">${dayLabel(def)}</div>`,
    )
    .join("");

  const headCountRow = renderHeadCountRow({
    slotColW: layout.slotColW,
    rowH: layout.headCountH,
    label: "Headcount",
    cellsHTML: weeklyHeadCountCells(nightDefs, slotRows, layout),
  });

  const tableRowsHTML =
    headCountRow +
    renderSectionRows(
      slotRows,
      layout,
      (slot, _ri, rowH) =>
        nightDefs
          .map(({ night }) => {
            const asgn = night.assignments[slot.key];
            const name = asgn?.tmName ?? "—";
            const disp = displayTmName(name, layout);
            const filled = !!asgn?.tmId;
            return (
              `<div style="flex:1;height:${rowH}px;line-height:${rowH}px;padding:0 3px;` +
              `font-size:${layout.fontSize}px;font-weight:${filled ? "600" : "400"};color:${filled ? "#1C1C1E" : "#AEAEB2"};` +
              `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid #EBEBF0;text-align:center;box-sizing:border-box;">${disp}</div>`
            );
          })
          .join(""),
      { fixedHeights: layout.rowHeights, compactSlots: layout.compactSlots },
    );

  const firstDef = nightDefs[0]?.def;
  const lastDef = nightDefs[nightDefs.length - 1]?.def;
  const rangeLabel =
    firstDef && lastDef
      ? `${firstDef.name.slice(0, 3)} ${firstDef.dateNum} – ${lastDef.name.slice(0, 3)} ${lastDef.dateNum}`
      : "Week Overview";

  return overviewShell({
    title: "Week Overview",
    subtitle: `${rangeLabel} · ${nights.length} nights · ${slotRows.length} slots`,
    slotColW: layout.slotColW,
    headerCells: colHeaderCells,
    tableRowsHTML,
    weekly: {
      bannerH: layout.bannerH,
      colHdrH: layout.colHdrH,
      tableBodyH: layout.tableBodyH,
      bannerPad: layout.bannerPad,
      titleSize: layout.titleSize,
      subtitleSize: layout.subtitleSize,
    },
  });
}

/** Routes to daily (1 night) or weekly (2+) overview layout. */
export function buildOverviewArtboardHTML(
  overviewNights: OverviewNight[],
  dayDefs: DayDef[],
): string {
  const nights = [...overviewNights].sort((a, b) => a.dayIndex - b.dayIndex);
  if (nights.length === 1) {
    const def =
      dayDefs[nights[0].dayIndex] ??
      ({
        name: `Day ${nights[0].dayIndex}`,
        short: "?",
        color: "#6B7280",
        dateNum: 0,
        monthYear: "",
      } as DayDef);
    return buildDailyOverviewArtboardHTML(nights[0], def);
  }
  return buildWeeklyOverviewArtboardHTML(nights, dayDefs);
}

/** Exposed for tests — verifies the solved layout fits the artboard. */
export function weeklyOverviewFitsOnePage(columnCount: number, slotRowCount = buildOverviewSlotRows().length): boolean {
  const layout = layoutForWeekly(columnCount, slotRowCount);
  const rowSum = layout.rowHeights.reduce((s, h) => s + h, 0);
  const used =
    STRIPE_H +
    layout.bannerH +
    layout.colHdrH +
    layout.headCountH +
    SECTION_COUNT * layout.secH +
    (SECTION_COUNT + slotRowCount + 1) +
    rowSum;
  return used <= ARTBOARD_H;
}