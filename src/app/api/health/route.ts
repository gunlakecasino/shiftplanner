import { NextResponse } from "next/server";

/** Railway / replica probe. No redirect, auth, Supabase, or session work. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function healthOk(body: string | null) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function GET() {
  return healthOk("ok");
}

export function HEAD() {
  return healthOk(null);
}
