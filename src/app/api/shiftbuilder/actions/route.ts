// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { opsLog } from "@/lib/opsLogger";

export const dynamic = "force-dynamic";

const ALLOWED_OPS = new Set([
  "mutations",
  "audit",
  "refresh",
  "histories",
  "rotation-report",
  "engine-insight",
  "on-call",
  "aux-layout",
  "graves-schedule",
]);

/**
 * POST /api/shiftbuilder/actions?op=<name>
 *
 * Canonical write/intelligence route — dispatches to legacy handlers.
 * Legacy per-op URLs remain supported as aliases.
 */
export async function POST(request: NextRequest) {
  const op = request.nextUrl.searchParams.get("op")?.trim();

  if (!op || !ALLOWED_OPS.has(op)) {
    return NextResponse.json(
      {
        error: "Missing or invalid ?op= parameter",
        allowed: [...ALLOWED_OPS],
      },
      { status: 400 },
    );
  }

  opsLog("shiftbuilder/actions", "dispatch", { op }, "debug");

  switch (op) {
    case "mutations":
      return (await import("../mutations/route")).POST(request);
    case "audit":
      return (await import("../log-change/route")).POST(request);
    case "refresh":
      return (await import("../refresh-day/route")).POST(request);
    case "histories":
      return (await import("../placement-histories/route")).POST(request);
    case "rotation-report":
      return (await import("../rotation-report/route")).POST(request);
    case "engine-insight":
      return (await import("../engine-insight/route")).POST(request);
    case "on-call":
      return (await import("../night-on-call/route")).POST(request);
    case "aux-layout":
      return (await import("../aux-layout/route")).POST(request);
    case "graves-schedule": {
      const method = request.headers.get("x-http-method-override")?.toUpperCase();
      const mod = await import("../graves-default-schedule/route");
      if (method === "DELETE" && mod.DELETE) return mod.DELETE(request);
      if (method === "PUT" && mod.PUT) return mod.PUT(request);
      return mod.POST(request);
    }
    default:
      return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  }
}

/** GET dispatcher for config-style reads via actions?op=config&resource=... */
export async function GET(request: NextRequest) {
  const op = request.nextUrl.searchParams.get("op")?.trim();
  if (op === "config") {
    return (await import("../config/route")).GET(request);
  }
  return NextResponse.json(
    { error: "GET requires ?op=config (use /api/shiftbuilder/config directly)" },
    { status: 400 },
  );
}