import { describe, expect, it } from "vitest";
import { taskHierarchyDepth } from "./taskHierarchy";

describe("taskHierarchyDepth", () => {
  it.each(["Black Tray Carts", "Trash", "Vacuum"])(
    "indents the Zone 4 Poker Room child task %s",
    (taskLabel) => {
      expect(taskHierarchyDepth("Z4", taskLabel)).toBe(1);
      expect(taskHierarchyDepth("zone_4", taskLabel)).toBe(1);
    },
  );

  it("does not indent the Poker Room parent", () => {
    expect(taskHierarchyDepth("Z4", "Poker Room")).toBe(0);
  });

  it.each(["Red Tray Carts", "Vacuum", "Trash"])(
    "indents the Zone 5 High Limits child task %s",
    (taskLabel) => {
      expect(taskHierarchyDepth("Z5", taskLabel)).toBe(1);
      expect(taskHierarchyDepth("zone_5", taskLabel)).toBe(1);
    },
  );

  it("does not indent the High Limit Table Games parent", () => {
    expect(taskHierarchyDepth("Z5", "High Limit Table Games")).toBe(0);
  });

  it("does not indent matching task names in other zones", () => {
    expect(taskHierarchyDepth("Z6", "Vacuum")).toBe(0);
    expect(taskHierarchyDepth("Z4", "Red Tray Carts")).toBe(0);
  });
});
