/**
 * Map night_slot_tasks DB rows → UI keys for cards/print.
 *
 * Flex AUX stores tasks under role DB keys (admin, support_1, step_up, …)
 * while cards render as AUX1/AUX2/…. Without remapping via tonight's auxDefs,
 * print looks up tasksBySlot[AUX1] and finds nothing.
 */

import type { NightSlotTask } from "./data";
import type { AuxDef } from "./placement";
import { dbToUi } from "./slot-keys";

export function mapNightTasksToUiKeys(
  rows: NightSlotTask[],
  currentAuxDefs: AuxDef[] = [],
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
