import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig } from "../components/PrintCommandCenter";
import { OVERVIEW_DAY_STRIPE_COLORS } from "./printOverviewTables";

export function buildCoverPageArtboardHTML(
  dayDefs: DayDef[],
  config: PrintConfig,
  totalPages: number,
): string {
  const deployCount = config.days.filter((d) => d.printDeploy).length;
  const breaksCount = config.days.filter((d) => d.printBreaks).length;
  const ovwCount = config.includeOverview && config.days.some((d) => d.inOverview) ? 1 : 0;

  const contents: { label: string; pages: number; color: string }[] = [];
  if (deployCount) contents.push({ label: "Deployment Sheets", pages: deployCount, color: "#34C759" });
  if (breaksCount) contents.push({ label: "Break Sheets", pages: breaksCount, color: "#FF9F0A" });
  if (ovwCount) contents.push({ label: "Overview", pages: 1, color: "#5856D6" });

  const activeDefs = config.days
    .filter((d) => d.printDeploy || d.printBreaks)
    .map((d) => dayDefs[d.dayIndex])
    .filter((d): d is DayDef => !!d);
  const firstDef = activeDefs[0];
  const lastDef = activeDefs[activeDefs.length - 1];
  const weekRange =
    firstDef && lastDef
      ? `${firstDef.name} ${firstDef.dateNum} – ${lastDef.name} ${lastDef.dateNum}, ${firstDef.monthYear.split(" ")[1] ?? firstDef.monthYear}`
      : "Shift Week";

  const stripeHTML = OVERVIEW_DAY_STRIPE_COLORS.map(
    (c) => `<div style="flex:1;background:${c};"></div>`,
  ).join("");

  const contentsHTML = contents
    .map(
      (c) =>
        `<div style="display:flex;align-items:center;gap:14px;padding:6px 0;border-bottom:1px solid #2C2C2E;">` +
        `<div style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>` +
        `<div style="flex:1;font-size:13px;font-weight:500;color:#EBEBF5;">${c.label}</div>` +
        `<div style="font-size:13px;font-weight:600;color:#8E8E93;">${c.pages} page${c.pages !== 1 ? "s" : ""}</div></div>`,
    )
    .join("");

  const nightChips = activeDefs
    .map(
      (def) =>
        `<div style="padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;color:#FFFFFF;background:${def.color};letter-spacing:0.03em;">${def.name.slice(0, 3).toUpperCase()} ${def.dateNum}</div>`,
    )
    .join("");

  const printedDate = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    `<div class="print-artboard" style="padding:0;display:flex;flex-direction:column;overflow:hidden;background:#1C1C1E;">` +
    `<div style="display:flex;height:6px;flex-shrink:0;">${stripeHTML}</div>` +
    `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 80px;">` +
    `<div style="font-size:11px;font-weight:700;color:#636366;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">Gun Lake Casino Resort</div>` +
    `<div style="font-size:46px;font-weight:900;color:#FFFFFF;text-align:center;line-height:1.05;letter-spacing:-0.01em;margin-bottom:4px;">GRAVE SHIFT</div>` +
    `<div style="font-size:46px;font-weight:900;color:#FFFFFF;text-align:center;line-height:1.05;letter-spacing:-0.01em;margin-bottom:20px;">PRINT BOOK</div>` +
    `<div style="font-size:16px;font-weight:600;color:#8E8E93;margin-bottom:24px;letter-spacing:0.01em;">${weekRange}</div>` +
    `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:36px;">${nightChips}</div>` +
    `<div style="width:380px;background:#2C2C2E;border-radius:10px;padding:16px 20px;">` +
    `<div style="font-size:10px;font-weight:700;color:#636366;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Contents</div>` +
    `${contentsHTML}` +
    `<div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;margin-top:4px;">` +
    `<div style="font-size:12px;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:0.06em;">Total Pages</div>` +
    `<div style="font-size:22px;font-weight:800;color:#FFFFFF;">${totalPages}</div></div></div></div>` +
    `<div style="padding:10px 28px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #2C2C2E;flex-shrink:0;">` +
    `<div style="font-size:9px;color:#48484A;letter-spacing:0.06em;text-transform:uppercase;">Confidential · Internal Use Only</div>` +
    `<div style="font-size:9px;color:#48484A;letter-spacing:0.06em;">Printed ${printedDate}</div></div>` +
    `</div>`
  );
}