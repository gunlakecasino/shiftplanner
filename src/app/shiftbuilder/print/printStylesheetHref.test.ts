import { describe, expect, it } from "vitest";
import { SHIFTBUILDER_VERSION } from "../version";
import { PRINT_PREVIEW_STYLESHEET_HREF } from "./printStylesheetHref";

describe("PRINT_PREVIEW_STYLESHEET_HREF", () => {
  it("cache-busts the print stylesheet with the current release version", () => {
    expect(PRINT_PREVIEW_STYLESHEET_HREF).toBe(
      `/shiftbuilder-print-preview.css?v=${SHIFTBUILDER_VERSION}`,
    );
  });
});
