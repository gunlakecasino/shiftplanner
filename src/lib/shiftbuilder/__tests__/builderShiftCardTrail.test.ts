import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShiftCard } from "@/app/shiftbuilder/redesign/components/ShiftCard";

describe("builder ShiftCard placement trail", () => {
  it("renders assigned-TM metadata directly below the TM name", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShiftCard, {
        zone: 4,
        name: "Amanda",
        nameMeta: React.createElement(
          "span",
          { "data-testid": "placement-trail" },
          "Z5 · RR8W · Z4",
        ),
      }),
    );

    expect(html).toContain("Amanda");
    expect(html).toContain('data-testid="placement-trail"');
    expect(html.indexOf("Amanda")).toBeLessThan(html.indexOf("placement-trail"));
  });
});
