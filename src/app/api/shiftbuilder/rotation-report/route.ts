import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore } from "next/cache";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import type { ReportWindow } from "@/lib/shiftbuilder/data";
import { getRotationReport } from "@/lib/shiftbuilder/rotationReport.server";

export const dynamic = "force-dynamic";

const VALID_WINDOWS: ReportWindow[] = [14, 30, 60, "this-week", "last-4-weeks"];

function parseWindow(raw: unknown): ReportWindow {
  if (raw === 14 || raw === 30 || raw === 60) return raw;
  if (raw === "this-week" || raw === "last-4-weeks") return raw;
  return 30;
}

/**
 * POST /api/shiftbuilder/rotation-report
 * Body: { window?: ReportWindow }
 */
export async function POST(req: NextRequest) {
  unstable_noStore();

  if (!isSameOriginOpsRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const session = await requireOpsPermission(req, "canAccessSudo");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const window = parseWindow(body?.window);
    if (body?.window != null && !VALID_WINDOWS.includes(window)) {
      return NextResponse.json({ error: "Invalid window" }, { status: 400 });
    }

    const report = await getRotationReport(window);
    return NextResponse.json({ report });
  } catch (err) {
    console.error("[api/rotation-report]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}