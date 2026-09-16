import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, beforeEach } from "vitest";
import {
  buildDeskCaptureSnapshot,
  deskCaptureFilename,
  peekDeskCaptureRings,
  recordDeskCaptureAction,
  recordDeskCaptureError,
  redactDeskCapturePack,
  redactDeskCaptureText,
  resetDeskCaptureRingsForTests,
} from "../deskCapture";

describe("desk capture redaction + rings", () => {
  beforeEach(() => {
    resetDeskCaptureRingsForTests();
  });

  it("redacts PIN-like six-digit runs and pin= payloads", () => {
    expect(redactDeskCaptureText("pin=123456 failed")).toBe("pin=[redacted] failed");
    expect(redactDeskCaptureText("code 654321 on gate")).toBe("code [redacted] on gate");
    expect(redactDeskCaptureText("Z1 assigned")).toBe("Z1 assigned");
  });

  it("strips /pin/i keys from the persisted pack", () => {
    const pack = redactDeskCapturePack({
      note: "Swap duplicated coverage",
      pin: "654321",
      operatorPin: "secret",
      slotKey: "Z1",
    }) as Record<string, unknown>;
    expect(pack).toEqual({ note: "Swap duplicated coverage", slotKey: "Z1" });
    expect(JSON.stringify(pack)).not.toContain("654321");
  });

  it("keeps action and error rings, redacted", () => {
    recordDeskCaptureAction({ message: "Assigned Ada to Z1", slotKey: "Z1", action: "assign" });
    recordDeskCaptureError("Change rolled back pin=999999");
    const rings = peekDeskCaptureRings();
    expect(rings.actions).toHaveLength(1);
    expect(rings.errors[0]?.message).toContain("[redacted]");
    expect(rings.errors[0]?.message).not.toContain("999999");
  });

  it("builds a night snapshot without inventing seats", () => {
    recordDeskCaptureAction({ message: "Assigned", slotKey: "Z1", action: "assign" });
    const snap = buildDeskCaptureSnapshot({
      note: "Swap duplicated coverage",
      nightId: "n1",
      nightDate: "2026-09-15",
      isDraftMode: true,
      assignments: {
        Z1: { tmId: "a", tmName: "Ada", additionalCoverageSlots: ["Z2"] },
      },
      auxDefs: [{ key: "AUX3", role: "job_coach", label: "JOB COACH" }],
    });
    expect(snap.note).toBe("Swap duplicated coverage");
    expect(snap.nightDate).toBe("2026-09-15");
    expect(snap.seats).toEqual([
      { slotKey: "Z1", tmId: "a", tmName: "Ada", coverageSlots: ["Z2"] },
    ]);
    expect(snap.auxRoles[0]).toMatchObject({ key: "AUX3", role: "job_coach" });
    expect(snap.actions).toHaveLength(1);
    expect(deskCaptureFilename(snap)).toBe("sheetbuilder-capture-2026-09-15.json");
  });
});

describe("desk capture chrome + seat-scope wiring", () => {
  const client = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
    "utf8",
  );
  const nav = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/FloatingNav.tsx"),
    "utf8",
  );
  const footer = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/components/BuilderPinnedFooter.tsx"),
    "utf8",
  );
  const toast = readFileSync(
    resolve(process.cwd(), "src/app/shiftbuilder/hooks/useToast.ts"),
    "utf8",
  );
  const route = readFileSync(
    resolve(process.cwd(), "src/app/api/shiftbuilder/desk-capture/route.ts"),
    "utf8",
  );

  it("keeps coverage on the card during swap and records assign rings", () => {
    expect(client).toContain("reseatTmKeepSeatCoverage(prev, fromKey, toKey)");
    expect(client).toContain("recordDeskCaptureAction");
    expect(client).toContain("<CaptureDeskDialog");
    expect(client).not.toContain("intercom");
  });

  it("opens Capture from More and footer left, not the toast corner", () => {
    expect(nav).toContain("Capture desk");
    expect(nav).toContain("onCaptureDesk");
    expect(footer).toContain('aria-label="Capture desk"');
    expect(footer).toContain("onCaptureDesk");
    expect(client).toContain('className="sb-desk-toasts fixed right-4 z-[100]');
    expect(client).not.toMatch(/bottom-4 right-4[\s\S]{0,400}Capture desk/);
  });

  it("redacts into rings and inserts sheetbuilder_bug_reports for a signed-in operator", () => {
    expect(toast).toContain("recordDeskCaptureError");
    expect(route).toContain("sheetbuilder_bug_reports");
    expect(route).toContain("requireOpsSession");
    expect(route).toContain("redactDeskCapturePack");
    expect(route).not.toContain("bug_reports_table_pending");
    expect(route).not.toContain("status: 501");
  });
});
