import { NextResponse } from "next/server";

/**
 * Desk capture insert. The `bug_reports` table is not on Graves Ops yet —
 * this route stays a no-op 501 so the client can still Download JSON.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      reason: "bug_reports_table_pending",
    },
    {
      status: 501,
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    },
  );
}
