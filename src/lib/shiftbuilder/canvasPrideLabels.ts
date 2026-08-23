/**
 * Operator-facing canvas labels for the live SheetBuilder board.
 *
 * Compact trail codes (RR10M, SUP1) and concatenated RR titles
 * (`RR 6 WOMEN'S`) read as debug at card size. These helpers keep
 * gender physics on the existing WRR/MRR keys and only change copy.
 * Golden print and the placement engine do not import this module.
 */

export type CanvasRrSide = "womens" | "mens";

/** Physical station on the card — RR 1 is the paired 1+2 block. */
export function canvasRrStation(num: number): string {
  return num === 1 ? "1+2" : String(num);
}

export function canvasRrGenderWord(side: CanvasRrSide): "Women's" | "Men's" {
  return side === "womens" ? "Women's" : "Men's";
}

/**
 * Gendered restroom title that stays legible at RR card width.
 * Gender first so a tight wrap never hides Women's / Men's.
 */
export function formatCanvasRrSideLabel(
  num: number,
  side: CanvasRrSide,
): { line: string; title: string } {
  const station = canvasRrStation(num);
  const gender = canvasRrGenderWord(side);
  return {
    line: `${gender} ${station}`,
    title: `${gender} restroom ${station}`,
  };
}

function parseRrSideToken(token: string): CanvasRrSide | null {
  const t = token.trim().toUpperCase();
  if (t === "W" || t === "WOMENS" || t === "WOMEN'S") return "womens";
  if (t === "M" || t === "MENS" || t === "MEN'S") return "mens";
  return null;
}

function parseRrNumber(raw: string): number | null {
  const compact = raw.replace(/\s+/g, "");
  if (/^1\+2$/.test(compact)) return 1;
  if (/^\d+$/.test(compact)) return Number(compact);
  return null;
}

/** Resolve a trail / UI slot token to a gendered RR half without inventing a side. */
export function parseCanvasRrToken(
  raw: string,
): { num: number; side: CanvasRrSide } | null {
  const token = raw.trim();
  if (!token) return null;

  const ui = token.match(/^([MW])RR(\d+)$/i);
  if (ui) {
    const num = Number(ui[2]);
    if (!Number.isFinite(num)) return null;
    return { num, side: ui[1].toUpperCase() === "W" ? "womens" : "mens" };
  }

  const trail = token.match(/^RR\s*(\d+|1\s*\+\s*2)\s*([MW])$/i);
  if (trail) {
    const num = parseRrNumber(trail[1]);
    const side = parseRrSideToken(trail[2]);
    if (num == null || !side) return null;
    return { num, side };
  }

  return null;
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Human chip for last-placement trail codes Brian can scan in one glance.
 * Leaves unknown tokens readable instead of inventing a slot.
 */
export function formatCanvasTrailChip(code: string): { label: string; title: string } {
  const raw = code.trim();
  if (!raw) return { label: "", title: "" };

  const rr = parseCanvasRrToken(raw);
  if (rr) {
    const formatted = formatCanvasRrSideLabel(rr.num, rr.side);
    return { label: formatted.line, title: formatted.title };
  }

  const zone = raw.match(/^Z(\d+)$/i);
  if (zone) {
    const label = `Zone ${zone[1]}`;
    return { label, title: label };
  }

  if (/^(Z9SR|z9_sr)$/i.test(raw)) {
    return { label: "Z9 SR", title: "Zone 9 smoking room" };
  }
  if (/^(ADMIN|ADM)$/i.test(raw) || raw === "admin") {
    return { label: "Admin", title: "Admin" };
  }
  if (/^(JC|job_coach|JOBCOACH)$/i.test(raw)) {
    return { label: "Job Coach", title: "Job Coach" };
  }
  if (/^(STEP|step_up|STEPUP|STEP_UP)$/i.test(raw)) {
    return { label: "Step Up", title: "Step Up" };
  }

  const trash = raw.match(/^(?:TR|TSH|trash_)(\d+)$/i);
  if (trash) {
    const label = `Trash ${trash[1]}`;
    return { label, title: label };
  }
  const support = raw.match(/^(?:SP|SUP|support_)(\d+)$/i);
  if (support) {
    const label = `Support ${support[1]}`;
    return { label, title: label };
  }
  const oasis = raw.match(/^(?:OAS(?:IS)?|oasis_)(\d+)$/i);
  if (oasis) {
    const label = `Oasis ${oasis[1]}`;
    return { label, title: label };
  }

  const overlap = raw.match(/^OL-(PM|AM)(?:-\d+)?$/i) || raw.match(/^overlap_(pm|am)(?:_\d+)?$/i);
  if (overlap) {
    const band = overlap[1].toUpperCase();
    const label = `${band} Overlaps`;
    return { label, title: label };
  }

  const aux = raw.match(/^AUX(\d+)$/i);
  if (aux) {
    const label = `Aux ${aux[1]}`;
    return { label, title: label };
  }

  return { label: titleCaseWords(raw.replace(/[_-]+/g, " ")), title: raw };
}

export type CoverageChipTone = {
  surface: string;
  ink: string;
  border: string;
};

/**
 * Inset covering-chip colors for the live desk.
 * Saturated zone accents stay on the left rail; chips use a tinted paper
 * surface and dark same-family ink so yellow never fails as pale-on-white.
 */
const COVERAGE_CHIP_TONES: Record<string, CoverageChipTone> = {
  "#ffcc00": { surface: "#F3E4B0", ink: "#6B4E00", border: "rgba(107, 78, 0, 0.22)" },
  "#ffdb4d": { surface: "#F3E4B0", ink: "#6B4E00", border: "rgba(107, 78, 0, 0.22)" },
  "#c8960c": { surface: "#F3E4B0", ink: "#6B4E00", border: "rgba(107, 78, 0, 0.22)" },
  "#d4a800": { surface: "#F3E4B0", ink: "#6B4E00", border: "rgba(107, 78, 0, 0.22)" },
  "#ff3b30": { surface: "#F6D4D1", ink: "#8A1C16", border: "rgba(138, 28, 22, 0.20)" },
  "#d93838": { surface: "#F6D4D1", ink: "#8A1C16", border: "rgba(138, 28, 22, 0.20)" },
  "#ff2d55": { surface: "#F6D2DD", ink: "#8A1238", border: "rgba(138, 18, 56, 0.20)" },
  "#c05a98": { surface: "#F3E2EC", ink: "#7D3A68", border: "rgba(125, 58, 104, 0.22)" },
  "#007aff": { surface: "#D7E8FF", ink: "#004A9E", border: "rgba(0, 74, 158, 0.20)" },
  "#4b7be8": { surface: "#D7E8FF", ink: "#2449A8", border: "rgba(36, 73, 168, 0.20)" },
  "#a2845e": { surface: "#EDE4D6", ink: "#5C4330", border: "rgba(92, 67, 48, 0.22)" },
  "#9b6a45": { surface: "#EDE4D6", ink: "#5C4330", border: "rgba(92, 67, 48, 0.22)" },
  "#34c759": { surface: "#D4EEDD", ink: "#176B32", border: "rgba(23, 107, 50, 0.22)" },
  "#4caf7d": { surface: "#D4EEDD", ink: "#176B32", border: "rgba(23, 107, 50, 0.22)" },
};

export function coverageChipTone(accent: string): CoverageChipTone {
  const key = accent.trim().toLowerCase();
  if (COVERAGE_CHIP_TONES[key]) return COVERAGE_CHIP_TONES[key];
  return {
    surface: `color-mix(in srgb, ${accent} 18%, #F6F1E8)`,
    ink: `color-mix(in srgb, ${accent} 74%, #1C1910)`,
    border: `color-mix(in srgb, ${accent} 26%, transparent)`,
  };
}

/** Coverage footer copy — "And Zone 9" / "+ ZONE 6" → "Covering Zone 9". */
export function formatCanvasCoverageChip(taskLabel: string): string {
  const body = taskLabel
    .replace(/^\+\s*/, "")
    .replace(/^AND\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!body) return "Covering";

  const rr = parseCanvasRrToken(body);
  if (rr) return `Covering ${formatCanvasRrSideLabel(rr.num, rr.side).line}`;

  const genderedRestroom = body.match(
    /^(women's|womens|men's|mens)\s+(?:restroom|rr)\s+(1\s*\+\s*2|\d+)$/i,
  );
  if (genderedRestroom) {
    const num = parseRrNumber(genderedRestroom[2]);
    const side = parseRrSideToken(genderedRestroom[1]);
    if (num != null && side) {
      return `Covering ${formatCanvasRrSideLabel(num, side).line}`;
    }
  }

  const zone = body.match(/^zone\s+(\d+)$/i);
  if (zone) return `Covering Zone ${zone[1]}`;

  return `Covering ${body}`;
}

export function formatCanvasRepeatReason(slotKey?: string): string {
  if (!slotKey?.trim()) return "Same area as a recent night";
  const chip = formatCanvasTrailChip(slotKey);
  const rr = parseCanvasRrToken(slotKey);
  if (rr) return `Same restroom as a recent night: ${chip.label}`;
  if (/^Z\d+$/i.test(slotKey.trim())) {
    return `Same zone as a recent night: ${chip.label}`;
  }
  return `Same area as a recent night: ${chip.label}`;
}
