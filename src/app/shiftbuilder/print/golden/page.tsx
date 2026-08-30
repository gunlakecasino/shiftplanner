import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, unauthorized } from "next/navigation";
import { requireOpsSessionFromCookies } from "@/lib/auth/requireOpsSession.server";
import { GoldenPrintRouteShell } from "../goldenPrintRouteShell";
import {
  GOLDEN_PRINT_HOSTNAME,
  isAllowedGoldenPrintHost,
  parseGoldenPrintDate,
  parseGoldenPrintSheets,
} from "../goldenPrintRoute";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "SheetBuilder Golden Print",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ date?: string; sheets?: string }>;

export default async function GoldenPrintPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const headerList = await headers();
  const host = headerList.get("host") ?? headerList.get("x-forwarded-host") ?? "";
  if (!isAllowedGoldenPrintHost(host)) {
    notFound();
  }

  const session = await requireOpsSessionFromCookies();
  if (!session.ok) {
    unauthorized();
  }

  const params = await searchParams;
  const date = parseGoldenPrintDate(params.date);
  if (!date) {
    return (
      <p data-sb-print-error="1" style={{ padding: 24, fontFamily: "system-ui" }}>
        Missing or invalid date. Use {GOLDEN_PRINT_HOSTNAME}
        /sheetbuilder/print/golden?date=YYYY-MM-DD
      </p>
    );
  }

  const sheets = parseGoldenPrintSheets(params.sheets);
  return <GoldenPrintRouteShell date={date} sheets={sheets} />;
}
