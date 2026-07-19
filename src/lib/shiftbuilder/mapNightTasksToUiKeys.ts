/**
 * Map night_slot_tasks DB rows → UI keys for cards/print.
 *
 * Flex AUX stores tasks under role DB keys (admin, support_1, step_up, …)
 * while cards render as AUX1/AUX2/…. Without remapping via tonight's auxDefs,
 * print looks up tasksBySlot[AUX1] and finds nothing.
 */

import type { NightSlotTask } from "./data";
import type { AuxDef } from "./placement";
import {
  buildCoverageLabelIndex,
  getSlotAccentColor,
  getSlotCoverageLabel,
  parseCoverageTargetFromTaskLabel,
  type CoverageSide,
} from "./coverageHelpers";
import { dbToUi, uiToDb } from "./slot-keys";

export type CoverageProjectionAssignment = {
  tmId?: string | null;
  tmName?: string | null;
  additionalCoverageSlots?: string[] | null;
  additional_coverage_slots?: string[] | null;
};

function coverageTargets(row: CoverageProjectionAssignment | undefined): string[] {
  const raw = row?.additionalCoverageSlots ?? row?.additional_coverage_slots ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((key): key is string => typeof key === "string" && key.trim().length > 0))];
}

function coverageTargetLabel(targetKey: string, auxDefs: AuxDef[]): string {
  const aux = auxDefs.find((def) => def.key === targetKey);
  return aux?.locations?.[0]?.trim() || aux?.label?.trim() || getSlotCoverageLabel(targetKey);
}

function defaultCoverageSide(sourceKey: string): CoverageSide | null {
  if (sourceKey.startsWith("WRR")) return "A";
  if (sourceKey.startsWith("MRR")) return "B";
  return null;
}

function syntheticCoverageTask(
  sourceKey: string,
  targetKey: string,
  auxDefs: AuxDef[],
): NightSlotTask {
  const dbSlot = uiToDb(sourceKey, auxDefs);
  return {
    id: `coverage:${sourceKey}:${targetKey}`,
    nightId: "",
    slotKey: dbSlot.slot_key,
    slotType: dbSlot.slot_type,
    rrSide: dbSlot.rr_side,
    taskLabel: `And ${coverageTargetLabel(targetKey, auxDefs)}`,
    catalogTaskId: null,
    sortOrder: 99,
    color: getSlotAccentColor(sourceKey),
    markerType: null,
    textStyle: null,
    isCoverage: true,
    coverageSide: defaultCoverageSide(sourceKey),
    sourceWorkItemId: null,
    isOneOff: false,
  };
}

export function mapNightTasksToUiKeys(
  rows: NightSlotTask[],
  currentAuxDefs: AuxDef[] = [],
  assignments: Record<string, CoverageProjectionAssignment> = {},
): Record<string, NightSlotTask[]> {
  const tasksByUiKey: Record<string, NightSlotTask[]> = {};

  rows.forEach((row) => {
    let uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);

    if (uiKey.startsWith("UNK:")) {
      if (
        row.slotType === "overlap" &&
        (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")
      ) {
        const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
        for (let i = 0; i < 6; i++) {
          (tasksByUiKey[`OL-${half}-${i}`] ??= []).push(row);
        }
      }
      return;
    }

    if (currentAuxDefs.length > 0) {
      // Legacy fixed keys + role-stable trail codes → flex AUXn shell.
      if (
        uiKey === "ADM" ||
        uiKey === "Z9SR" ||
        uiKey === "JC" ||
        uiKey === "STEP" ||
        /^(TR|TSH|SP|SUP|OAS)\d+$/i.test(uiKey)
      ) {
        let match: AuxDef | undefined;
        if (uiKey === "ADM") {
          match = currentAuxDefs.find((d) => d.role === "admin");
        } else if (uiKey === "Z9SR") {
          match = currentAuxDefs.find((d) => d.role === "z9sr");
        } else if (uiKey === "JC") {
          match = currentAuxDefs.find((d) => d.role === "job_coach");
        } else if (uiKey === "STEP") {
          match = currentAuxDefs.find((d) => d.role === "step_up");
        } else {
          const numbered = uiKey.match(/^(TR|TSH|SP|SUP|OAS)(\d+)$/i);
          if (numbered) {
            const family = numbered[1].toUpperCase();
            const n = parseInt(numbered[2], 10);
            const role =
              family === "TR" || family === "TSH"
                ? "trash"
                : family === "SP" || family === "SUP"
                  ? "support"
                  : "oasis";
            match = currentAuxDefs.filter((d) => d.role === role)[n - 1];
          }
        }
        if (match?.key) uiKey = match.key;
      }

      // DB keys that dbToUi left as-is (admin, support_1, …) → shell.
      if (!/^AUX\d+$/i.test(uiKey) && row.slotType === "aux") {
        const fromDb = roleShellFromDbSlotKey(row.slotKey, currentAuxDefs);
        if (fromDb) uiKey = fromDb;
      }
    }

    (tasksByUiKey[uiKey] ??= []).push(row);
  });

  const labelToKey = buildCoverageLabelIndex(currentAuxDefs);

  // Collapse duplicate stored presentation rows by normalized source + target.
  // Unknown legacy labels remain visible because they cannot be reconciled safely.
  for (const [sourceKey, tasks] of Object.entries(tasksByUiKey)) {
    const seenTargets = new Set<string>();
    tasksByUiKey[sourceKey] = tasks.filter((task) => {
      if (!task.isCoverage) return true;
      const targetKey = parseCoverageTargetFromTaskLabel(task.taskLabel, labelToKey);
      if (!targetKey) return true;
      if (seenTargets.has(targetKey)) return false;
      seenTargets.add(targetKey);
      return true;
    });
  }

  // Project canonical operational coverage into the task shape already consumed
  // by the live cards, covered-by index, print preview, and exported PDF.
  for (const [sourceKey, assignment] of Object.entries(assignments)) {
    if (!assignment?.tmId && !assignment?.tmName?.trim()) continue;

    for (const targetKey of coverageTargets(assignment)) {
      if (targetKey === sourceKey) continue;

      // Empty-zone fallback is not valid once the direct target is staffed.
      const targetAssignment = assignments[targetKey];
      if (targetAssignment?.tmId || targetAssignment?.tmName?.trim()) continue;

      const existing = tasksByUiKey[sourceKey] ?? [];
      const alreadyProjected = existing.some(
        (task) =>
          task.isCoverage &&
          parseCoverageTargetFromTaskLabel(task.taskLabel, labelToKey) === targetKey,
      );
      if (alreadyProjected) continue;

      (tasksByUiKey[sourceKey] ??= []).push(
        syntheticCoverageTask(sourceKey, targetKey, currentAuxDefs),
      );
    }
  }

  return tasksByUiKey;
}

/** Map a raw aux DB slot_key onto tonight's AUXn shell when possible. */
function roleShellFromDbSlotKey(
  slotKey: string,
  auxDefs: AuxDef[],
): string | null {
  if (!slotKey) return null;
  if (slotKey === "admin") {
    return auxDefs.find((d) => d.role === "admin")?.key ?? null;
  }
  if (slotKey === "z9_sr") {
    return auxDefs.find((d) => d.role === "z9sr")?.key ?? null;
  }
  if (slotKey === "job_coach") {
    return auxDefs.find((d) => d.role === "job_coach")?.key ?? null;
  }
  if (slotKey === "step_up") {
    return auxDefs.find((d) => d.role === "step_up")?.key ?? null;
  }
  let m = slotKey.match(/^support_(\d+)$/);
  if (m) {
    return auxDefs.filter((d) => d.role === "support")[parseInt(m[1], 10) - 1]?.key ?? null;
  }
  m = slotKey.match(/^trash_(\d+)$/);
  if (m) {
    return auxDefs.filter((d) => d.role === "trash")[parseInt(m[1], 10) - 1]?.key ?? null;
  }
  m = slotKey.match(/^oasis_(\d+)$/);
  if (m) {
    return auxDefs.filter((d) => d.role === "oasis")[parseInt(m[1], 10) - 1]?.key ?? null;
  }
  m = slotKey.match(/^aux_(\d+)$/i);
  if (m) {
    const key = `AUX${m[1]}`;
    return auxDefs.some((d) => d.key === key) ? key : null;
  }
  return null;
}
