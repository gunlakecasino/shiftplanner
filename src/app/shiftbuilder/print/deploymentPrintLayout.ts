import { RR_DEFS, ZONE_VISUAL_ORDER } from "@/lib/shiftbuilder/constants";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import type { PrintDaySnapshot } from "./printPreviewTypes";

export type DeploymentPrintDensity = "normal" | "compact" | "tight";

export type OfficialDeploymentLayout = {
  zonesFlexGrow: number;
  rrFlexGrow: number;
  auxFlexGrow: number;
  density: DeploymentPrintDensity;
  taskFontPx: number;
  taskDenseFontPx: number;
  taskLineHeight: number;
  taskGapPx: number;
  /** Peak non-coverage tasks on any single zone / RR side / aux slot. */
  pressure: number;
};

const BASE = { zones: 5, rr: 4, aux: 2 } as const;

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

  let auxFlexGrow: number = BASE.aux;
  if (pressure >= 3) auxFlexGrow = 1.75;
  if (pressure >= 4) auxFlexGrow = 1.5;
  if (pressure >= 5) auxFlexGrow = 1.2;
  if (pressure >= 6) auxFlexGrow = 1;
  if (pressure >= 7) auxFlexGrow = 0.85;
  if (pressure >= 8) auxFlexGrow = 0.72;

  const reclaimed = BASE.aux - auxFlexGrow;
  const zonesFlexGrow = BASE.zones + reclaimed * 0.58;
  const rrFlexGrow = BASE.rr + reclaimed * 0.42;

  let density: DeploymentPrintDensity = "normal";
  let taskFontPx: number = TASK_LABEL_SIZE_PX.print;
  let taskDenseFontPx: number = TASK_LABEL_SIZE_PX.printDense;
  let taskLineHeight = 1.12;
  let taskGapPx = 2;

  if (pressure >= 5) {
    density = "compact";
    taskFontPx = 9;
    taskDenseFontPx = 8.5;
    taskLineHeight = 1.08;
    taskGapPx = 1;
  }
  if (pressure >= 7) {
    density = "tight";
    taskFontPx = 8.5;
    taskDenseFontPx = 8;
    taskLineHeight = 1.05;
    taskGapPx = 0;
  }

  return {
    zonesFlexGrow,
    rrFlexGrow,
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
  artboard.setAttribute("data-print-rr-grow", String(layout.rrFlexGrow));
  artboard.setAttribute("data-print-aux-grow", String(layout.auxFlexGrow));
  artboard.style.setProperty("--sb-print-zones-grow", String(layout.zonesFlexGrow));
  artboard.style.setProperty("--sb-print-rr-grow", String(layout.rrFlexGrow));
  artboard.style.setProperty("--sb-print-aux-grow", String(layout.auxFlexGrow));
  artboard.style.setProperty("--sb-print-task-px", `${layout.taskFontPx}px`);
  artboard.style.setProperty("--sb-print-task-dense-px", `${layout.taskDenseFontPx}px`);
  artboard.style.setProperty("--sb-print-task-leading", String(layout.taskLineHeight));
  artboard.style.setProperty("--sb-print-task-gap", `${layout.taskGapPx}px`);
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
): void {
  if (!section) return;
  section.style.flexGrow = String(grow);
  section.style.flexShrink = "1";
  section.style.flexBasis = "0";
  section.style.minHeight = "0";
  section.style.display = "flex";
  section.style.flexDirection = "column";
  section.style.overflow = "hidden";
}

function bumpDensity(artboard: HTMLElement): DeploymentPrintDensity | null {
  const current = artboard.getAttribute("data-print-density") ?? "normal";
  if (current === "normal") {
    artboard.setAttribute("data-print-density", "compact");
    artboard.style.setProperty("--sb-print-task-px", "9px");
    artboard.style.setProperty("--sb-print-task-dense-px", "8.5px");
    artboard.style.setProperty("--sb-print-task-leading", "1.08");
    artboard.style.setProperty("--sb-print-task-gap", "1px");
    return "compact";
  }
  if (current === "compact") {
    artboard.setAttribute("data-print-density", "tight");
    artboard.style.setProperty("--sb-print-task-px", "8.5px");
    artboard.style.setProperty("--sb-print-task-dense-px", "8px");
    artboard.style.setProperty("--sb-print-task-leading", "1.05");
    artboard.style.setProperty("--sb-print-task-gap", "0px");
    return "tight";
  }
  return null;
}

/**
 * Post-process official deployment artboards before print/PDF rasterization.
 * Shrinks aux band and tightens task typography until task lists fit their cards.
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

  const zones = el.querySelector(".sb-print-section-zones") as HTMLElement | null;
  const rr = el.querySelector(".sb-print-section-rr") as HTMLElement | null;
  const aux = el.querySelector(".sb-print-section-aux") as HTMLElement | null;

  let zonesGrow = readGrow(el, "data-print-zones-grow", BASE.zones);
  let rrGrow = readGrow(el, "data-print-rr-grow", BASE.rr);
  let auxGrow = readGrow(el, "data-print-aux-grow", BASE.aux);

  applySectionFlex(zones, zonesGrow);
  applySectionFlex(rr, rrGrow);
  applySectionFlex(aux, auxGrow);

  el.querySelectorAll<HTMLElement>(".sb-print-card-grid").forEach((grid) => {
    grid.style.flex = "1 1 auto";
    grid.style.minHeight = "0";
    grid.style.width = "100%";
    grid.style.alignContent = "stretch";
  });

  const auxGrid = aux?.querySelector(".sb-print-card-grid") as HTMLElement | null;
  if (auxGrid) {
    auxGrid.style.gridAutoRows = "minmax(0, 1fr)";
  }

  for (let pass = 0; pass < 6; pass++) {
    applySectionFlex(zones, zonesGrow);
    applySectionFlex(rr, rrGrow);
    applySectionFlex(aux, auxGrow);

    if (!taskListsClip(el)) break;

    if (auxGrow > 0.65) {
      const nextAux = Math.max(0.65, auxGrow - 0.18);
      const delta = auxGrow - nextAux;
      auxGrow = nextAux;
      zonesGrow += delta * 0.58;
      rrGrow += delta * 0.42;
      el.setAttribute("data-print-aux-grow", String(auxGrow));
      el.setAttribute("data-print-zones-grow", String(zonesGrow));
      el.setAttribute("data-print-rr-grow", String(rrGrow));
      el.style.setProperty("--sb-print-aux-grow", String(auxGrow));
      el.style.setProperty("--sb-print-zones-grow", String(zonesGrow));
      el.style.setProperty("--sb-print-rr-grow", String(rrGrow));
      continue;
    }

    if (bumpDensity(el) === null) break;
  }
}