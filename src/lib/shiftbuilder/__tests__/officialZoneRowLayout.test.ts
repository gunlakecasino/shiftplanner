import { describe, expect, it } from "vitest";
import {
  buildOfficialTaskRows,
  estimateOfficialZoneCardHeight,
  isOfficialZoneCardDense,
  solveOfficialDeploymentTracks,
  solveOfficialZoneRowTracks,
  type OfficialZoneCardLoad,
} from "@/app/shiftbuilder/print/officialZoneRowLayout";

const emptyCard: OfficialZoneCardLoad = {
  names: [],
  tasks: [],
  hasFooter: false,
};

const standardZoneFiveTasks = [
  "Chill Bar: Bartop Machines",
  "Promo Stage",
  "Team Member Hallway",
  "Locker Rooms",
  "Restroom",
  "Smoking Room",
  "High Limit Table Games",
  "Red Tray Carts",
  "Vacuum",
  "Trash",
];

describe("official zone row layout", () => {
  it("pairs only Zone 5 subtasks beneath their parent rows", () => {
    expect(buildOfficialTaskRows("Z5", standardZoneFiveTasks)).toEqual([
      { depth: 0, tasks: ["Chill Bar: Bartop Machines"] },
      { depth: 0, tasks: ["Promo Stage"] },
      { depth: 0, tasks: ["Team Member Hallway"] },
      { depth: 1, tasks: ["Locker Rooms", "Restroom"] },
      { depth: 1, tasks: ["Smoking Room"] },
      { depth: 0, tasks: ["High Limit Table Games"] },
      { depth: 1, tasks: ["Red Tray Carts", "Vacuum"] },
      { depth: 1, tasks: ["Trash"] },
    ]);
    expect(buildOfficialTaskRows("Z4", ["Poker Room", "Trash"]))
      .toEqual([
        { depth: 0, tasks: ["Poker Room"] },
        { depth: 0, tasks: ["Trash"] },
      ]);
  });

  it("keeps equally loaded rows equal", () => {
    const load: OfficialZoneCardLoad = {
      names: ["Porter"],
      tasks: ["Task one", "Task two"],
      hasFooter: false,
    };

    expect(solveOfficialZoneRowTracks([load], [load])).toEqual({
      first: 93,
      second: 93,
      cssValue: "93fr 93fr",
    });
  });

  it("transfers spare height from a light second row to a task-heavy first row", () => {
    const heavy: OfficialZoneCardLoad = {
      names: ["Jamie"],
      tasks: [
        "Social Bar: Bartop Machines",
        "Promo Stage",
        "Team Member Locker Rooms",
        "Team Member Restroom",
        "Team Member Smoking Room",
        "High Limit Table Games",
      ],
      hasFooter: false,
    };
    const light: OfficialZoneCardLoad = {
      names: ["Sheri O"],
      tasks: ["Lobby Restrooms", "Lobby Trash"],
      hasFooter: false,
    };

    const tracks = solveOfficialZoneRowTracks(
      [emptyCard, heavy],
      [light, emptyCard],
    );

    expect(tracks.first).toBeGreaterThan(tracks.second);
    expect(tracks.cssValue).toBe(`${tracks.first}fr ${tracks.second}fr`);
    expect(tracks.first / tracks.second).toBeGreaterThan(1.4);
  });

  it("accounts for wrapped task labels and coverage footers", () => {
    const plain = estimateOfficialZoneCardHeight({
      names: ["Porter"],
      tasks: ["Short task"],
      hasFooter: false,
    });
    const wrappedWithFooter = estimateOfficialZoneCardHeight({
      names: ["Porter"],
      tasks: ["A deliberately long task label that must wrap onto another line"],
      hasFooter: true,
    });

    expect(wrappedWithFooter).toBeGreaterThan(plain + 20);
  });

  it("reserves a second assignee line before laying out Zone 5 tasks", () => {
    const shortName = estimateOfficialZoneCardHeight({
      slotKey: "Z5",
      names: ["Pat"],
      tasks: standardZoneFiveTasks,
      hasFooter: false,
    });
    const wrappedName = estimateOfficialZoneCardHeight({
      slotKey: "Z5",
      names: ["Christopher Richardson"],
      tasks: standardZoneFiveTasks,
      hasFooter: false,
    });

    expect(isOfficialZoneCardDense({
      slotKey: "Z5",
      names: ["Pat"],
      tasks: standardZoneFiveTasks,
      hasFooter: false,
    })).toBe(true);
    expect(shortName).toBe(155);
    expect(wrappedName).toBe(shortName + 19);
  });

  it("transfers page height to a Zone 5 row with a wrapped assignee", () => {
    const normal: OfficialZoneCardLoad = {
      names: ["Pat"],
      tasks: ["Task one", "Task two"],
      hasFooter: false,
    };
    const wrappedZoneFive: OfficialZoneCardLoad = {
      slotKey: "Z5",
      names: ["Christopher Richardson"],
      tasks: standardZoneFiveTasks,
      hasFooter: false,
    };

    const tracks = solveOfficialDeploymentTracks({
      zoneRows: [
        [normal, normal, normal, wrappedZoneFive, normal],
        Array.from({ length: 5 }, () => normal),
      ],
      restroomRows: [
        Array.from({ length: 5 }, () => normal),
        Array.from({ length: 5 }, () => normal),
      ],
      auxiliaryCards: [emptyCard, emptyCard, emptyCard],
    });

    expect(tracks.zones).toBeGreaterThan(296);
    expect(tracks.zones + tracks.restrooms + tracks.auxiliary).toBe(689);
  });

  it("models compact dense restroom cards using their print typography", () => {
    const denseRestroom = estimateOfficialZoneCardHeight({
      names: ["Porter"],
      tasks: [
        "Table Games / PIT",
        "Zone 8 Family Restroom",
        "T.D.R. Restroom",
        "Team Member Locker Room",
        "Team Member Restroom",
      ],
      hasFooter: true,
      compact: true,
    });

    expect(denseRestroom).toBe(127);
  });

  it("gives dense restroom rows height borrowed from a light auxiliary row", () => {
    const denseRestroom: OfficialZoneCardLoad = {
      names: ["Porter"],
      tasks: [
        "Table Games / PIT",
        "Zone 8 Family Restroom",
        "T.D.R. Restroom",
        "Team Member Locker Room",
        "Team Member Restroom",
      ],
      hasFooter: true,
      compact: true,
    };
    const zoneCard: OfficialZoneCardLoad = {
      names: ["Porter"],
      tasks: ["Task one", "Task two"],
      hasFooter: false,
    };

    const tracks = solveOfficialDeploymentTracks({
      zoneRows: [
        Array.from({ length: 5 }, () => zoneCard),
        Array.from({ length: 5 }, () => zoneCard),
      ],
      restroomRows: [
        [emptyCard, emptyCard, emptyCard, denseRestroom, emptyCard],
        [emptyCard, emptyCard, emptyCard, denseRestroom, emptyCard],
      ],
      auxiliaryCards: [emptyCard, emptyCard, emptyCard],
    });

    expect(tracks.restrooms).toBe(292);
    expect(tracks.auxiliary).toBe(101);
    expect(tracks.zones + tracks.restrooms + tracks.auxiliary).toBe(689);
    expect(tracks.restroomRows).toEqual({
      first: 127,
      second: 127,
      cssValue: "127fr 127fr",
    });
  });

  it("reserves two writable-height rows for a multi-row auxiliary grid", () => {
    const tracks = solveOfficialDeploymentTracks({
      zoneRows: [
        Array.from({ length: 5 }, () => emptyCard),
        Array.from({ length: 5 }, () => emptyCard),
      ],
      restroomRows: [
        Array.from({ length: 5 }, () => emptyCard),
        Array.from({ length: 5 }, () => emptyCard),
      ],
      auxiliaryCards: Array.from({ length: 4 }, () => emptyCard),
      auxiliaryRows: 2,
    });

    expect(tracks.auxiliary).toBeGreaterThanOrEqual(137);
    expect(tracks.zones + tracks.restrooms + tracks.auxiliary).toBe(689);
    expect(tracks.cssValue).toBe(
      `${tracks.zones}px ${tracks.restrooms}px minmax(${tracks.auxiliary}px, 1fr)`,
    );
  });
});
