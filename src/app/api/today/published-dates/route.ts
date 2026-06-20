import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/today/_lib/rateLimit";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";

/**
 * GET /api/today/published-dates?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns night_date values for published schedules in the inclusive range.
 * Used by the /today month picker to highlight browsable nights.
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateKey = `published-dates:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 90);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many requests — try again shortly" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  const fromParam = request.nextUrl.searchParams.get("from");
  const toParam = request.nextUrl.searchParams.get("to");

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "Missing ?from= and ?to= (YYYY-MM-DD)" }, { status: 400 });
  }

  const fromDate = parseLocalDateISO(fromParam);
  const toDate = parseLocalDateISO(toParam);
  if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const client = createAdminClientSafe();
  if (!client) {
    return NextResponse.json(
      { dates: [], error: "Published dates service unavailable" },
      { status: 503 },
    );
  }

  const { data, error } = await client
    .from("nights")
    .select("night_date")
    .eq("status", "published")
    .gte("night_date", fromParam)
    .lte("night_date", toParam);

  if (error) {
    console.warn("[today/published-dates] query failed", error);
    return NextResponse.json(
      { dates: [], error: error.message || "Query failed" },
      { status: 503 },
    );
  }

  const dates = (data ?? []).map((row: { night_date: string }) => row.night_date);
  return NextResponse.json({ dates });
}