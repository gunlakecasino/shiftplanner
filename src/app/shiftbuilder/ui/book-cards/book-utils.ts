/**
 * Utilities for the ShiftBuilder v1.5 "Weekly Zone Deployment Book" surface.
 * 
 * Separate from the app-card ui/cards/ because the visual language here is
 * print/document/report (8.5x11 paper, colored frames, coverage badges, tight
 * two-column per-restroom, dashed unassigned, sub-location lists).
 * 
 * We still honor the "separate callable component file" pattern and reuse
 * the proven per-side + drag precision concepts from v1.
 */

export function getBookZoneColor(slotKey: string): string {
  // Colors tuned to closely match the provided image's zone header accents
  // Z1 gold, Z2 green, Z3 red, Z4 red, Z5 red, Z6 purple, Z7 blue, Z8 brown, Z9 red, Z10 green
  const map: Record<string, string> = {
    Z1: "#D4A017",   // warm gold
    Z2: "#2E7D32",   // forest green
    Z3: "#C62828",   // strong red
    Z4: "#E53935",   // red
    Z5: "#D32F2F",   // red
    Z6: "#7B1FA2",   // purple
    Z7: "#1565C0",   // blue
    Z8: "#5D4037",   // brown
    Z9: "#C62828",   // red
    Z10: "#2E7D32",  // green
  };
  const n = parseInt((slotKey || "").replace(/[^0-9]/g, "")) || 1;
  return map[slotKey] || ["#D4A017", "#2E7D32", "#C62828", "#E53935", "#D32F2F", "#7B1FA2", "#1565C0", "#5D4037", "#C62828", "#2E7D32"][(n - 1) % 10];
}

export function getBookRestroomColor(slotKey: string): string {
  // Match the left accent bars on the RR cards in the image
  const map: Record<string, string> = {
    "RR1": "#D4A017",
    "RR2": "#D4A017",
    "RR1+2": "#D4A017",
    "RR6": "#7B1FA2",
    "RR7": "#1565C0",
    "RR8": "#5D4037",
    "RR10": "#2E7D32",
  };
  return map[slotKey] || map[slotKey.replace("+2","1")] || "#64748b";
}

export function getZoneLabel(slotKey: string): string {
  const n = parseInt((slotKey || "").replace(/[^0-9]/g, "")) || "";
  return `ZONE ${n}`;
}

export function getRestroomLabel(slotKey: string): string {
  if (slotKey.includes("1+2") || slotKey === "RR1" || slotKey === "RR1+2") return "RR 1+2";
  const num = slotKey.replace(/RR/g, "");
  return `RR ${num}`;
}

// Small coverage / count badge text (the black pill numbers)
export function formatCoverage(n?: number): string {
  if (n === undefined || n === null) return "";
  return String(n);
}

// For RR per-side count pills
export function formatGenderCount(count?: number): string {
  if (count === undefined || count === null) return "—";
  return String(count);
}

// Derive filled counts for the section headers (10/10 FILLED etc.)
export function computeFilledSummary(assignments: Record<string, any>, keys: string[]): string {
  const total = keys.length;
  const filled = keys.filter(k => {
    const a = assignments[k];
    if (!a) return false;
    if (a.slotType === "rr" || k.startsWith("RR")) {
      return !!a.mens?.tmName || !!a.womens?.tmName;
    }
    return !!a.tmName;
  }).length;
  return `${filled} / ${total} FILLED`;
}

export function getSubLocations(assignment: any): string[] {
  // In real data this would come from zone metadata or assignment.task notes.
  // For the dev book we allow a simple array or synthesize from known examples.
  if (Array.isArray(assignment?.subLocations)) return assignment.subLocations;
  if (typeof assignment?.subLocations === "string") return [assignment.subLocations];
  // Fallback examples that match the spirit of the image
  const key = assignment?.slotKey || "";
  const examples: Record<string, string[]> = {
    Z1: ["Elevators & Stairwells", "Outdoor Smoking Area"],
    Z2: ["And Lobby"],
    Z4: ["High Limit Table Games", "Indoor TM Smoking Room"],
    Z5: ["High Limit Table Games", "Indoor TM Smoking Room"],
    Z6: ["Outdoor Smoking Area"],
    Z7: ["Pit 1 + 2", "South Door Glass", "Zone 7 Smoking Room"],
    Z8: ["Pit 3"],
    Z9: ["Social Bar Tables"],
    Z10: ["High Limit Slots", "East Door Glass", "Outside Smoking Area", "Pit 4"],
  };
  return examples[key] || [];
}

export function getRRLocations(side: 'mens' | 'womens', rrKey: string): string[] {
  // Exact sub-locations from the reference artboard image
  const map: Record<string, Record<'mens' | 'womens', string[]>> = {
    "RR1": {
      mens: ["Buffet RR", "Family RR"],
      womens: ["Buffet RR", "Family RR"],
    },
    "RR6": { mens: ["131 RR"], womens: ["131 RR"] },
    "RR7": { mens: ["Assist SR"], womens: ["Assist SR"] },
    "RR8": { mens: ["Family RR", "TDR RR", "TMBR LR"], womens: ["Family RR", "TDR RR", "TMBR LR"] },
    "RR10": { mens: ["CBK RR"], womens: ["CBK RR"] },
  };
  const key = rrKey.includes("+") || rrKey === "RR1" || rrKey === "RR1+2" ? "RR1" : rrKey;
  return map[key]?.[side] || [];
}
