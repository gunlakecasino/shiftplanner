// v1.0 Release-Ready — UI frozen June 24 2026
import fs from "fs";
import path from "path";

const FLOOR_GUIDE_PATH = path.join(process.cwd(), "docs/SHIFTBUILDER_FLOOR_GUIDE.md");

export function readFloorGuideMarkdown(): string {
  try {
    return fs.readFileSync(FLOOR_GUIDE_PATH, "utf8");
  } catch {
    return "# ShiftBuilder Floor Guide\n\nGuide file not found. Contact admin.";
  }
}