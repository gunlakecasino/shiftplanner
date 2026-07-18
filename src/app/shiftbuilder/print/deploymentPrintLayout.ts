import { RR_DEFS, ZONE_VISUAL_ORDER } from "@/lib/shiftbuilder/constants";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import type { PrintDaySnapshot } from "./printPreviewTypes";

export type DeploymentPrintDensity = "normal" | "compact" | "tight";

export type OfficialDeploymentLayout = {
  zonesFlexGrow: number;
  rrFlexGrow: number;
  /** Aux is pinned at bottom — always 0 (no flex competition with zones). */
  auxFlexGrow: number;
  density: DeploymentPrintDensity;
  taskFontPx: number;
  taskDenseFontPx: number;
  taskLineHeight: number;
  taskGapPx: number;
  /** Peak non-coverage tasks on any single zone / RR side / aux slot. */
  pressure: number;
};

const BASE = { zones: 6 } as const;

function nonCoverageTaskCount(
  tasksBySlot: Record<string, NightSlotTask[]>,
  slotKey: string,
): number {
  return (tasksBySlot[slotKey] ?? []).filter((t) => !t.isCoverage).length;
}

/** How task-heavy is this official deployment sheet? Drives flex + typography. */
export function measureDeploymentTaskPressure(snapshot: PrintDaySnapshot): number {
  const { tasksBySlot, auxDefs } = snapshot;

  const maxZone = Math.max(
    0,
    ...ZONE_VISUAL_ORDER.map((k) => nonCoverageTaskCount(tasksBySlot, k)),
  );

  const maxRRSide = Math.max(
    0,
    ...RR_DEFS.flatMap((d) => [
      nonCoverageTaskCount(tasksBySlot, `WRR${d.num}`),
      nonCoverageTaskCount(tasksBySlot, `MRR${d.num}`),
    ]),
  );

  const auxKeys = auxDefs
    .filter((d) => d.role !== "blank" || !!d.label)
    .map((d) => d.key);
  const maxAux = Math.max(
    0,
    ...auxKeys.map((k) => nonCoverageTaskCount(tasksBySlot, k)),
  );

  return Math.max(maxZone, maxRRSide, maxAux);
}

export function solveOfficialDeploymentLayout(
  snapshot: PrintDaySnapshot,
): OfficialDeploymentLayout {
  const pressure = measureDeploymentTaskPressure(snapshot);
  const { tasksBySlot, auxDefs } = snapshot;
  const auxKeys = auxDefs
    .filter((d) => d.role !== "blank" || !!d.label)
    .map((d) => d.key);
  const maxAux = Math.max(
    0,
    ...auxKeys.map((k) => nonCoverageTaskCount(tasksBySlot, k)),
  );

  // Zones absorb most flexible height; AUX grows with task load so every
  // aux task can print at the default 11px (rows align via grid + equalize).
  let zonesFlexGrow: number = BASE.zones;
  let auxFlexGrow = 0;

  if (pressure >= 3) {
    zonesFlexGrow += 0.95;
  }
  if (pressure >= 5) {
    zonesFlexGrow += 1.4;
  }
  if (pressure >= 7) {
    zonesFlexGrow += 1.85;
  }

  if (maxAux >= 2) auxFlexGrow = 0.55;
  if (maxAux >= 3) auxFlexGrow = 0.9;
  if (maxAux >= 5) auxFlexGrow = 1.35;

  // Prefer fixed 11px + wrap + growing cards/sections over shrinking type.
  const density: DeploymentPrintDensity = "normal";
  const taskFontPx: number = TASK_LABEL_SIZE_PX.print;
  const taskDenseFontPx: number = TASK_LABEL_SIZE_PX.printDense;
  const taskLineHeight = 1.15;
  const taskGapPx = 2;

  return {
    zonesFlexGrow,
    rrFlexGrow: 0,
    auxFlexGrow,
    density,
    taskFontPx,
    taskDenseFontPx,
    taskLineHeight,
    taskGapPx,
    pressure,
  };
}

export function applyOfficialDeploymentLayoutAttrs(
  artboard: HTMLElement,
  layout: OfficialDeploymentLayout,
): void {
  artboard.setAttribute("data-print-density", layout.density);
  artboard.setAttribute("data-print-zones-grow", String(layout.zonesFlexGrow));
  artboard.setAttribute("data-print-rr-grow", "0");
  artboard.setAttribute("data-print-aux-grow", String(layout.auxFlexGrow));
  artboard.style.setProperty("--sb-print-zones-grow", String(layout.zonesFlexGrow));
  artboard.style.setProperty("--sb-print-rr-grow", "0");
  artboard.style.setProperty("--sb-print-aux-grow", String(layout.auxFlexGrow));
  artboard.style.setProperty("--sb-print-task-px", `${layout.taskFontPx}px`);
  artboard.style.setProperty("--sb-print-task-dense-px", `${layout.taskDenseFontPx}px`);
  artboard.style.setProperty("--sb-print-task-leading", String(layout.taskLineHeight));
  artboard.style.setProperty("--sb-print-task-gap", `${layout.taskGapPx}px`);
  artboard.style.setProperty("--sb-print-task-weight", "700");
  artboard.style.setProperty("--sb-print-coverage-font-px", "11px");
}

function taskListsClip(artboard: HTMLElement): boolean {
  return [...artboard.querySelectorAll<HTMLElement>(".sb-golden-task-list")].some(
    (list) => list.scrollHeight > list.clientHeight + 1,
  );
}

function readGrow(artboard: HTMLElement, attr: string, fallback: number): number {
  const raw = artboard.getAttribute(attr);
  const n = raw ? parseFloat(raw) : fallback;
  return Number.isFinite(n) ? n : fallback;
}

function applySectionFlex(
  section: HTMLElement | null,
  grow: number,
  shrink = 1,
): void {
  if (!section) return;
  section.style.flexGrow = String(grow);
  section.style.flexShrink = String(shrink);
  section.style.flexBasis = grow > 0 ? "0" : "auto";
  section.style.minHeight = "0";
  section.style.display = "flex";
  section.style.flexDirection = "column";
  section.style.overflow = "hidden";
}

function pinAuxSection(aux: HTMLElement | null, grow = 0): void {
  if (!aux) return;
  // Content-sized when grow is 0; share remaining height when aux has tasks.
  if (grow > 0) {
    aux.style.flexGrow = String(grow);
    aux.style.flexShrink = "1";
    aux.style.flexBasis = "0";
  } else {
    aux.style.flexGrow = "0";
    aux.style.flexShrink = "0";
    aux.style.flexBasis = "auto";
  }
  aux.style.minHeight = "0";
  aux.style.display = "flex";
  aux.style.flexDirection = "column";
  aux.style.overflow = "visible";
  aux.style.marginTop = grow > 0 ? "0" : "auto";
}

function pinRRSection(rr: HTMLElement | null): void {
  if (!rr) return;
  rr.style.flexGrow = "0";
  rr.style.flexShrink = "0";
  rr.style.flexBasis = "auto";
  rr.style.minHeight = "0";
  rr.style.display = "flex";
  rr.style.flexDirection = "column";
  rr.style.overflow = "visible";

  const grid = rr.querySelector(".sb-print-rr-grid") as HTMLElement | null;
  if (grid) {
    grid.style.flex = "0 0 auto";
    grid.style.gridTemplateRows = "auto auto";
    grid.style.gridAutoRows = "auto";
    grid.style.minHeight = "0";
    grid.style.width = "100%";
    grid.style.alignContent = "start";
    grid.querySelectorAll<HTMLElement>("[data-slot-key]").forEach((cell) => {
      cell.style.height = "100%";
      cell.style.minHeight = "0";
      cell.style.display = "flex";
      cell.style.flexDirection = "column";
    });
  }
}

function rowDomTaskPressure(row: HTMLElement): number {
  return row.querySelectorAll(".sb-golden-task-list li").length;
}

function rowTasksClip(row: HTMLElement): boolean {
  return [...row.querySelectorAll<HTMLElement>(".sb-golden-task-list")].some(
    (list) => list.scrollHeight > list.clientHeight + 1,
  );
}

/** Equal 50/50 zone rows with a light nudge toward the row that needs more task space. */
function balanceTwoRowFlex(row1: HTMLElement, row2: HTMLElement): void {
  let grow1 = 1;
  let grow2 = 1;

  const pressure1 = rowDomTaskPressure(row1);
  const pressure2 = rowDomTaskPressure(row2);
  if (pressure1 > pressure2) grow1 += 0.15;
  else if (pressure2 > pressure1) grow2 += 0.15;

  if (rowTasksClip(row1)) grow1 += 0.2;
  if (rowTasksClip(row2)) grow2 += 0.2;

  row1.style.flex = `${grow1} 1 0`;
  row2.style.flex = `${grow2} 1 0`;
}

/** Prevent the zones stack from stealing height from pinned RR / aux bands. */
function capZonesStack(
  body: HTMLElement | null,
  zones: HTMLElement | null,
  rr: HTMLElement | null,
  aux: HTMLElement | null,
): void {
  if (!body || !zones) return;

  const stack = zones.querySelector(".sb-print-zones-stack") as HTMLElement | null;
  if (!stack) return;

  const bodyH = body.clientHeight;
  if (bodyH <= 0) return;

  const zonesHeader =
    zones.querySelector(".sheet-section-header")?.getBoundingClientRect().height ?? 0;
  const rrH = rr?.getBoundingClientRect().height ?? 0;
  const auxH = aux?.getBoundingClientRect().height ?? 0;

  // Section margins + stack gap (row1 ↔ row2).
  const chrome = 18;
  const maxStack = Math.floor(bodyH - zonesHeader - rrH - auxH - chrome);

  if (maxStack > 96) {
    stack.style.maxHeight = `${maxStack}px`;
    stack.style.overflow = "hidden";
    zones.style.overflow = "hidden";
  } else {
    stack.style.removeProperty("max-height");
    stack.style.removeProperty("overflow");
    zones.style.removeProperty("overflow");
  }
}

function styleZoneRow(row: HTMLElement): void {
  row.style.width = "100%";
  row.style.minHeight = "0";
  row.style.alignContent = "stretch";
  row.style.gridAutoRows = "minmax(0, 1fr)";
  row.querySelectorAll<HTMLElement>("[data-slot-key]").forEach((cell) => {
    cell.style.height = "100%";
    cell.style.minHeight = "0";
    cell.style.display = "flex";
    cell.style.flexDirection = "column";
  });
}

function applyZoneRowFlex(zones: HTMLElement | null): void {
  if (!zones) return;

  const stack = zones.querySelector(".sb-print-zones-stack") as HTMLElement | null;
  if (stack) {
    stack.style.display = "flex";
    stack.style.flexDirection = "column";
    stack.style.flex = "1 1 auto";
    stack.style.minHeight = "0";
    stack.style.width = "100%";
    stack.style.gap = "6px";
  }

  const row1 = zones.querySelector(".sb-print-zone-row-1") as HTMLElement | null;
  const row2 = zones.querySelector(".sb-print-zone-row-2") as HTMLElement | null;

  if (row1) styleZoneRow(row1);
  if (row2) styleZoneRow(row2);
  if (row1 && row2) balanceTwoRowFlex(row1, row2);
}

function bumpDensity(artboard: HTMLElement): DeploymentPrintDensity | null {
  const current = artboard.getAttribute("data-print-density") ?? "normal";
  if (current === "normal") {
    artboard.setAttribute("data-print-density", "compact");
    artboard.style.setProperty("--sb-print-task-px", "9.5px");
    artboard.style.setProperty("--sb-print-task-dense-px", "9px");
    artboard.style.setProperty("--sb-print-task-leading", "1.08");
    artboard.style.setProperty("--sb-print-task-gap", "1px");
    return "compact";
  }
  if (current === "compact") {
    artboard.setAttribute("data-print-density", "tight");
    artboard.style.setProperty("--sb-print-task-px", "9px");
    artboard.style.setProperty("--sb-print-task-dense-px", "8.5px");
    artboard.style.setProperty("--sb-print-task-leading", "1.05");
    artboard.style.setProperty("--sb-print-task-gap", "0px");
    return "tight";
  }
  return null;
}

/**
 * Post-process official deployment artboards before print/PDF rasterization.
 * Pins RR + aux; zone rows share remaining height equally (capped).
 */
export function postProcessOfficialDeploymentArtboard(artboard: Element): void {
  const el = artboard as HTMLElement;
  if (el.getAttribute("data-print-view") !== "deployment") return;
  if (el.getAttribute("data-print-variant") === "planning") return;

  const body = el.querySelector(".sb-print-deployment-body") as HTMLElement | null;
  if (body) {
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.flex = "1 1 auto";
    body.style.minHeight = "0";
    body.style.overflow = "hidden";
    body.style.width = "100%";
  }

  const main = el.querySelector(".sb-print-deployment-main") as HTMLElement | null;
  if (main) {
    main.style.display = "flex";
    main.style.flexDirection = "column";
    main.style.flex = "1 1 auto";
    main.style.minHeight = "0";
    main.style.overflow = "hidden";
    main.style.width = "100%";
  }

  const zones = el.querySelector(".sb-print-section-zones") as HTMLElement | null;
  const rr = el.querySelector(".sb-print-section-rr") as HTMLElement | null;
  const aux = el.querySelector(".sb-print-section-aux") as HTMLElement | null;

  let zonesGrow = readGrow(el, "data-print-zones-grow", BASE.zones);
  let auxGrow = readGrow(el, "data-print-aux-grow", 0);

  applySectionFlex(zones, zonesGrow);
  pinRRSection(rr);
  pinAuxSection(aux, auxGrow);
  applyZoneRowFlex(zones);
  capZonesStack(body, zones, rr, aux);

  el.querySelectorAll<HTMLElement>(".sb-print-card-grid").forEach((grid) => {
    if (grid.closest(".sb-print-section-rr")) return;
    grid.style.flex = "1 1 auto";
    grid.style.minHeight = "0";
    grid.style.width = "100%";
    grid.style.alignContent = "stretch";
  });

  const auxGrid = aux?.querySelector(".sb-print-card-grid") as HTMLElement | null;
  if (auxGrid) {
    // Content-height cards that equalize to the tallest in the AUX row.
    auxGrid.style.flex = auxGrow > 0 ? "1 1 auto" : "0 0 auto";
    auxGrid.style.gridAutoRows = "auto";
    auxGrid.style.alignItems = "stretch";
    auxGrid.querySelectorAll<HTMLElement>("[data-slot-key]").forEach((cell) => {
      cell.style.height = "100%";
      cell.style.minHeight = "0";
      cell.style.display = "flex";
      cell.style.flexDirection = "column";
    });
  }

  for (let pass = 0; pass < 6; pass++) {
    applySectionFlex(zones, zonesGrow);
    pinRRSection(rr);
    pinAuxSection(aux, auxGrow);
    applyZoneRowFlex(zones);
    capZonesStack(body, zones, rr, aux);

    if (!taskListsClip(el)) break;

    // Prefer growing AUX when its tasks clip, then zones flex, then last-resort density.
    if (auxGrow < 2.2) {
      auxGrow = Math.min(2.2, auxGrow + 0.35);
      el.setAttribute("data-print-aux-grow", String(auxGrow));
      el.style.setProperty("--sb-print-aux-grow", String(auxGrow));
      continue;
    }

    if (zonesGrow > 4) {
      zonesGrow = Math.max(4, zonesGrow - 0.35);
      el.setAttribute("data-print-zones-grow", String(zonesGrow));
      el.style.setProperty("--sb-print-zones-grow", String(zonesGrow));
      continue;
    }

    // Last resort only — keep 11px as long as layout can expand.
    if (bumpDensity(el) === null) break;
  }
}