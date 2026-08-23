import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DESK_SHORTCUTS,
  isDeskTypingTarget,
} from "./deskShortcuts";

describe("SheetBuilder desk shortcuts catalog", () => {
  it("lists only real night bindings and never Run Engine / R / ⌘K", () => {
    const joined = DESK_SHORTCUTS.map((row) => `${row.action} ${row.keys.join(" ")}`).join("\n");
    expect(DESK_SHORTCUTS.some((row) => row.id === "prev-day")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "next-day")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "roster-up")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "assign")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "draft")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "apply")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "discard")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "print")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "refresh")).toBe(true);
    expect(DESK_SHORTCUTS.some((row) => row.id === "cheatsheet")).toBe(true);
    expect(joined).not.toMatch(/Run Engine/i);
    expect(joined).not.toContain("⌘K");
    expect(joined).not.toContain("Cmd+K");
    expect(DESK_SHORTCUTS.some((row) => row.keys.length === 1 && row.keys[0] === "R")).toBe(false);
  });

  it("does not treat the board as a typing field", () => {
    expect(isDeskTypingTarget(null)).toBe(false);
  });
});

describe("SheetBuilder command palette burial", () => {
  it("finishes deleting palette residue that still implied a Dyno bar", () => {
    expect(existsSync(resolve(process.cwd(), "src/lib/shiftbuilder/commandParser.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/shiftbuilder/CommandPalette.tsx"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/app/shiftbuilder/components/LazyCommandPalette.tsx"))).toBe(false);
    const client = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/ShiftBuilderClient.tsx"),
      "utf8",
    );
    const hook = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/hooks/useDeskKeyboard.ts"),
      "utf8",
    );
    const sheet = readFileSync(
      resolve(process.cwd(), "src/app/shiftbuilder/components/KeyboardCheatsheet.tsx"),
      "utf8",
    );
    expect(client).not.toContain("LazyCommandPalette");
    expect(client).not.toContain("handleCmdkAddTask");
    expect(client).toContain("useDeskKeyboard");
    expect(hook).not.toContain("metaKey && e.key.toLowerCase() === \"k\"");
    expect(sheet).toContain("DESK_SHORTCUTS");
    expect(sheet).not.toContain("Run Engine");
  });
});
