import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPS_SESSION_COOKIE } from "@/lib/auth/opsSession.server";
import {
  DEFAULT_GOLDEN_PRINT_SHEETS,
  GOLDEN_PRINT_HOSTNAME,
  GOLDEN_PRINT_PATH,
  GOLDEN_PRINT_PATH_ALIAS,
  SB_PRINT_READY_ATTR,
  activeGoldenPrintDays,
  dayDefForPrintDate,
  expectedGoldenArtboardCount,
  goldenPrintArtboardsReady,
  goldenPrintConfigForSheets,
  hostnameFromHostHeader,
  isAllowedGoldenPrintHost,
  isGoldenPrintPathname,
  parseGoldenPrintDate,
  parseGoldenPrintSheets,
  shouldApplyLiveCanvasOverlay,
} from "@/app/shiftbuilder/print/goldenPrintRoute";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

const routePage = read("src/app/shiftbuilder/print/golden/page.tsx");
const routeClient = read("src/app/shiftbuilder/print/goldenPrintRouteClient.tsx");
const routeShell = read("src/app/shiftbuilder/print/goldenPrintRouteShell.tsx");
const layout = read("src/app/shiftbuilder/layout.tsx");
const middleware = read("src/middleware.ts");
const nextConfig = read("next.config.ts");
const dockerfile = read("Dockerfile");
const pipeline = read("src/app/shiftbuilder/print/printPreviewPipeline.ts");
const assemblePreview = read("src/app/shiftbuilder/print/assemblePrintPreviewPages.ts");
const hydrateNight = read("src/app/shiftbuilder/print/printHydrateNight.ts");
const printSession = read("src/app/shiftbuilder/print/printSession.ts");
const goldenCss = read("src/app/shiftbuilder/print/goldenPrint.css");
const unauthorized = read("src/app/shiftbuilder/print/golden/unauthorized.tsx");
const sheetbuilderPage = read("src/app/sheetbuilder/print/golden/page.tsx");

describe("Golden print URL — date / sheets / host", () => {
  it("parses a night date as local YYYY-MM-DD and rejects garbage", () => {
    expect(parseGoldenPrintDate("2026-08-29")).toBe("2026-08-29");
    expect(parseGoldenPrintDate("2026-02-31")).toBeNull();
    expect(parseGoldenPrintDate("08/29/2026")).toBeNull();
    expect(parseGoldenPrintDate("")).toBeNull();
    expect(parseGoldenPrintDate(undefined)).toBeNull();
  });

  it("defaults sheets to assignments + tasks and leaves planner off", () => {
    expect(parseGoldenPrintSheets(undefined)).toEqual(["assignments", "tasks"]);
    expect(parseGoldenPrintSheets("")).toEqual(["assignments", "tasks"]);
    expect(parseGoldenPrintSheets("assignments,tasks")).toEqual([
      "assignments",
      "tasks",
    ]);
    expect(DEFAULT_GOLDEN_PRINT_SHEETS).toEqual(["assignments", "tasks"]);
    expect(parseGoldenPrintSheets("planner")).toEqual(["planner"]);
    expect(parseGoldenPrintSheets("assignments,tasks,planner")).toEqual([
      "assignments",
      "tasks",
      "planner",
    ]);
    expect(parseGoldenPrintSheets("deploy,breaks")).toEqual([
      "assignments",
      "tasks",
    ]);
  });

  it("builds printDeploy/printBreaks from sheets without enabling planner by default", () => {
    const day = dayDefForPrintDate("2026-08-28");
    const config = goldenPrintConfigForSheets(day.index, parseGoldenPrintSheets(null));
    const active = activeGoldenPrintDays(config);
    expect(active).toHaveLength(1);
    expect(active[0]?.printDeploy).toBe(true);
    expect(active[0]?.printBreaks).toBe(true);
    expect(active[0]?.printPlanner).toBeFalsy();
    expect(expectedGoldenArtboardCount(["assignments", "tasks"])).toBe(2);
  });

  it("only allows the production SheetBuilder hostname", () => {
    expect(hostnameFromHostHeader("sheetbuilder.origintwelve.com:443")).toBe(
      GOLDEN_PRINT_HOSTNAME,
    );
    expect(isAllowedGoldenPrintHost("sheetbuilder.origintwelve.com", "production")).toBe(
      true,
    );
    expect(isAllowedGoldenPrintHost("shiftplanner.up.railway.app", "production")).toBe(
      false,
    );
    expect(isAllowedGoldenPrintHost("localhost:3000", "development")).toBe(true);
    expect(isAllowedGoldenPrintHost("localhost:3000", "production")).toBe(false);
  });

  it("recognizes both /sheetbuilder and /shiftbuilder print paths", () => {
    expect(isGoldenPrintPathname(GOLDEN_PRINT_PATH)).toBe(true);
    expect(isGoldenPrintPathname(GOLDEN_PRINT_PATH_ALIAS)).toBe(true);
    expect(isGoldenPrintPathname("/sheetbuilder")).toBe(false);
  });
});

describe("Golden print URL — hydrate from night-core, not live canvas", () => {
  it("does not apply a live-canvas overlay when hydrating from night-core only", () => {
    expect(shouldApplyLiveCanvasOverlay({ hydrateFromNightCoreOnly: true })).toBe(
      false,
    );
    expect(shouldApplyLiveCanvasOverlay({})).toBe(true);
    expect(shouldApplyLiveCanvasOverlay({ hydrateFromNightCoreOnly: false })).toBe(
      true,
    );
  });

  it("route client hydrates the requested date via hydrateNightForPrint and skips canvas overlay", () => {
    expect(routeClient).toContain("hydrateNightForPrint");
    expect(routeClient).toContain("generatePrintPreviewGoldenPages");
    expect(routeClient).toContain('mountGoldenPrintSession(pages, config, "print"');
    expect(routeClient).toContain('target: "document"');
    expect(routeClient).toContain("hydrateFromNightCoreOnly: true");
    expect(routeClient).not.toContain("liveOverlaysByDay");
    expect(routeClient).not.toContain("applyLiveBoardToPrintSnapshot");
    expect(routeClient).not.toContain("getCurrentAssignmentsSnapshot");
    expect(routeClient).not.toContain("PrintCommandCenter");
    expect(hydrateNight).toContain("printOnly: true");
    expect(pipeline).toContain("hydrateFromNightCoreOnly");
    expect(assemblePreview).toContain("shouldApplyLiveCanvasOverlay");
    expect(assemblePreview).toContain("hydrateFromNightCoreOnly");
  });

  it("marks html[data-sb-print-ready] after artboards and fonts are ready", () => {
    expect(SB_PRINT_READY_ATTR).toBe("data-sb-print-ready");
    expect(routeClient).toContain("markGoldenPrintReady");
    expect(routeClient).toContain("waitForGoldenRenderSettled");
    expect(routeClient).toContain("waitForPrintArtboardSettled");
    expect(routeClient).toContain("document.fonts");
    const ready = {
      querySelectorAll(sel: string) {
        if (sel === ".print-artboard") return { length: 2 };
        return { length: 0 };
      },
    } as unknown as ParentNode;
    const loading = {
      querySelectorAll(sel: string) {
        if (sel === ".print-artboard") return { length: 2 };
        return { length: 1 };
      },
    } as unknown as ParentNode;
    expect(goldenPrintArtboardsReady(ready, 2)).toBe(true);
    expect(goldenPrintArtboardsReady(loading, 2)).toBe(false);
    expect(goldenPrintArtboardsReady(ready, 3)).toBe(false);
  });
});

describe("Golden print URL — auth, cache, Docker, no second renderer", () => {
  it("gates on the existing oms_ops_session cookie and never puts a PIN in the URL", () => {
    expect(routePage).toContain("requireOpsSessionFromCookies");
    expect(routePage).toContain("unauthorized");
    expect(middleware).toContain(OPS_SESSION_COOKIE);
    expect(middleware).toContain('"/sheetbuilder/print/golden"');
    expect(middleware).toContain("sessionLooksSigned");
    expect(layout).toContain("isGoldenPrintPathname");
    expect(layout).toContain("return <>{children}</>");
    expect(unauthorized).not.toContain("PinGate");
    expect(routePage).toContain("params.date");
    expect(routePage).toContain("params.sheets");
    expect(routePage).not.toMatch(/params\.(pin|token)/i);
    expect(routeClient).not.toContain("searchParams.get(\"pin\")");
    expect(routeClient).not.toContain("headers");
    expect(sheetbuilderPage).toContain("shiftbuilder/print/golden/page");
    expect(sheetbuilderPage).toContain('export const dynamic = "force-dynamic"');
  });

  it("stays on CF Bypass / private no-store HTML and aliases /shiftbuilder", () => {
    expect(middleware).toContain("private, no-store");
    expect(middleware).toContain('pathname === "/sheetbuilder/print/golden"');
    expect(nextConfig).toContain(
      '{ source: "/shiftbuilder/:path*", destination: "/sheetbuilder/:path*", permanent: false }',
    );
    expect(nextConfig).not.toContain("Cache Everything");
    expect(nextConfig).not.toContain('source: "/sheetbuilder/print/golden"');
  });

  it("does not add Chromium or a second PDF renderer to the Railway image", () => {
    expect(dockerfile).not.toMatch(/chrom/i);
    expect(dockerfile).not.toMatch(/puppeteer/i);
    expect(dockerfile).not.toMatch(/playwright/i);
    expect(routeClient).not.toContain("exportGoldenPdf");
    expect(routeClient).not.toContain("html-to-image");
    expect(routeClient).not.toContain("jspdf");
    expect(routeClient).not.toContain("jsPDF");
    expect(routeClient).not.toContain("reportlab");
    expect(routeClient).not.toContain("weasyprint");
    expect(printSession).toContain('options?.target === "document"');
    expect(printSession).toContain("mountGoldenDocumentPrintSession");
    expect(goldenCss).toContain("@page");
    expect(goldenCss).toContain("letter landscape");
  });

  it("does not write nights.status or live-push from the print route", () => {
    expect(routePage).not.toContain("nights.status");
    expect(routeClient).not.toContain("nights.status");
    expect(routeClient).not.toContain("live-push");
    expect(routeClient).not.toContain("livePush");
    expect(routePage).not.toContain(".update(");
  });
});
