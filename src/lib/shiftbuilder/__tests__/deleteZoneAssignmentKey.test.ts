/**
 * Contract: flex AUX unassign must delete the same DB key assign wrote.
 *
 * Assign path (useLiveAssignments):
 *   uiToDb("AUX3", auxDefs) → { slot_key: "support_1", slot_type: "aux" }
 *   upsert(slotKey: "support_1")
 *
 * Broken unassign (pre-fix):
 *   delete(uiKey: "AUX3") → server uiToDb without layout → aux_3 → 0 rows
 *   TM reappears on refresh via remapAssignmentsToAuxKeys(support_1 → AUX3)
 *
 * Fixed unassign:
 *   delete(uiKey: "AUX3", dbSlotKey: "support_1") → hits support_1
 */
import { describe, expect, it } from "vitest";
import { uiToDb } from "../slot-keys";
import { auxUiKeyToDb, applyAuxRole, defaultAuxDefsForNewNight } from "../auxLayout";
import type { AuxDef } from "../placement";

function layoutWithSupportOnAux3(): AuxDef[] {
  let defs = defaultAuxDefsForNewNight();
  // default: AUX1 admin, AUX2 z9sr, blanks after
  const blank = defs.find((d) => d.role === "blank");
  if (!blank) throw new Error("expected blank shell");
  defs = applyAuxRole(defs, blank.key, "support");
  return defs;
}

describe("flex AUX assign/delete key parity", () => {
  it("maps AUX support shell to support_1 (what assign persists)", () => {
    const defs = layoutWithSupportOnAux3();
    const supportShell = defs.find((d) => d.role === "support");
    expect(supportShell).toBeTruthy();
    const key = supportShell!.key;

    expect(auxUiKeyToDb(key, defs)?.slot_key).toBe("support_1");
    expect(uiToDb(key, defs).slot_key).toBe("support_1");
    expect(uiToDb(key, defs).slot_type).toBe("aux");
  });

  it("server-style uiToDb without auxDefs mis-maps AUXn to aux_n (the bug)", () => {
    const defs = layoutWithSupportOnAux3();
    const supportShell = defs.find((d) => d.role === "support")!;
    // Server has no client store — this is what delete used to do alone.
    const serverMap = uiToDb(supportShell.key);
    expect(serverMap.slot_key).toBe(`aux_${supportShell.key.replace(/^AUX/i, "")}`);
    expect(serverMap.slot_key).not.toBe("support_1");
  });

  it("dbSlotKey from client layout must be preferred over server remap", () => {
    const defs = layoutWithSupportOnAux3();
    const supportShell = defs.find((d) => d.role === "support")!;
    const clientMapped = uiToDb(supportShell.key, defs);
    const serverMapped = uiToDb(supportShell.key);

    // Simulate deleteZoneAssignmentServer preference logic
    const dbSlotKey = clientMapped.slot_key;
    const preferred =
      typeof dbSlotKey === "string" && dbSlotKey.trim()
        ? dbSlotKey.trim()
        : serverMapped.slot_key;

    expect(preferred).toBe("support_1");
    expect(preferred).not.toBe(serverMapped.slot_key);
  });

  it("maps step_up / trash / oasis the same way for delete parity", () => {
    let defs = defaultAuxDefsForNewNight();
    const blanks = defs.filter((d) => d.role === "blank");
    expect(blanks.length).toBeGreaterThanOrEqual(3);

    defs = applyAuxRole(defs, blanks[0].key, "step_up");
    defs = applyAuxRole(defs, blanks[1].key, "trash");
    defs = applyAuxRole(defs, blanks[2].key, "oasis");

    const step = defs.find((d) => d.role === "step_up")!;
    const trash = defs.find((d) => d.role === "trash")!;
    const oasis = defs.find((d) => d.role === "oasis")!;

    expect(uiToDb(step.key, defs).slot_key).toBe("step_up");
    expect(uiToDb(trash.key, defs).slot_key).toBe("trash_1");
    expect(uiToDb(oasis.key, defs).slot_key).toBe("oasis_1");
  });
});
