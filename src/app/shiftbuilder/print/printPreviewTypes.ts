import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

export type PrintPreviewView = "deployment" | "breaks";

export type PrintVariant = "official" | "planning";

export type PrintTaskLine = {
  id: string;
  label: string;
  color?: string | null;
  isCoverage?: boolean;
};

export type PrintPlanningCardModel = {
  key: string;
  kind: "zone" | "rr-side" | "aux" | "overlap";
  headerLabel: string;
  headerIcon?: string;
  accentColor: string;
  tmName?: string | null;
  locationLines: string[];
  tasks: PrintTaskLine[];
  coverageLabel?: string | null;
  coverageColor?: string | null;
  breakGroup?: 0 | 1 | 2 | 3 | 4;
  empty?: boolean;
  blankAux?: boolean;
  sideLabel?: string;
  minHeightPx?: number;
};

export type PrintBreaksPerson = {
  slotKey: string;
  tmName: string;
  chipLabel: string;
  accentColor: string;
  sideLetter?: string;
  category: "zone" | "rr" | "aux" | "overlap";
};

export type PrintBreaksWave = {
  wave: 1 | 2 | 3 | 4;
  people: PrintBreaksPerson[];
};

export type PrintOverlapRow = {
  key: "PM" | "AM";
  time: string;
  dayName: string;
  dateNum: number;
  headerColor: string;
  slots: PrintPlanningCardModel[];
};

export type PrintDaySnapshot = {
  dayIndex: number;
  day: DayDef;
  assignments: Record<string, { tmId?: string; tmName?: string; breakGroup?: number; isLocked?: boolean }>;
  tasksBySlot: Record<string, NightSlotTask[]>;
  auxDefs: AuxDef[];
  amOverlapDayName: string;
  amOverlapDateNum: number;
  nextDayColor: string;
  breakCounts: Record<1 | 2 | 3 | 4, number>;
  notes?: string;
  nightStatus?: "published" | "draft";
};

export type PrintPreviewPageProps = {
  view: PrintPreviewView;
  snapshot: PrintDaySnapshot;
  pageLabel: string;
  versionLabel: string;
  weekDayDefs: DayDef[];
  activeBreakGroup?: 1 | 2 | 3 | 4;
  printVariant?: PrintVariant;
  includeShiftNotes?: boolean;
  /** Planning only — strip notes prefill and covered-by hints for a clean worksheet. */
  planningBlankSlate?: boolean;
};