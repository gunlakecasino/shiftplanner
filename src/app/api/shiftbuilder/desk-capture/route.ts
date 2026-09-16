import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { opsLog } from "@/lib/opsLogger";
import {
  redactDeskCapturePack,
  redactDeskCaptureText,
} from "@/lib/shiftbuilder/deskCapture";

const TABLE = "sheetbuilder_bug_reports";
const NO_STORE = {
  "Cache-Control": "private, no-cache, no-store, must-revalidate",
} as const;

function canReadDeskCaptures(role: string): boolean {
  return role === "sudo_admin" || role === "admin";
}

function jsonNightDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/**
 * POST /api/shiftbuilder/desk-capture
 * Signed-in operator insert. Download JSON still works if this fails.
 *
 * GET lists recent rows for sudo_admin / admin (Grok Ops is sudo_admin).
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error },
      { status: session.status, headers: NO_STORE },
    );
  }

  const rateKey = `desk-capture:${session.actor.user.id}:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 20);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many captures — try again shortly" },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(rateCheck.retryAfterSec) },
      },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const note = redactDeskCaptureText(
    typeof body.note === "string" ? body.note.trim() : "",
  ).slice(0, 280);
  if (!note) {
    return NextResponse.json({ error: "note is required" }, { status: 400, headers: NO_STORE });
  }

  const pack = redactDeskCapturePack(body);
  const nightDate = jsonNightDate(body.nightDate);
  const build =
    typeof body.version === "string"
      ? redactDeskCaptureText(body.version).slice(0, 64)
      : null;

  const client = createAdminClientSafe();
  if (!client) {
    opsLog("shiftbuilder/desk-capture", "insert_skipped", { reason: "no_service_role" }, "warn");
    return NextResponse.json(
      { ok: false, reason: "service_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  const { data, error } = await client
    .from(TABLE)
    .insert({
      note,
      pack,
      night_date: nightDate,
      build,
      route: typeof body.route === "string" ? body.route.slice(0, 240) : null,
      operator_id: session.actor.user.id,
      operator_name: session.actor.operatorName,
      source: "desk_capture",
    })
    .select("id, created_at")
    .maybeSingle();

  if (error) {
    opsLog(
      "shiftbuilder/desk-capture",
      "insert_failed",
      { code: error.code, message: error.message },
      "error",
    );
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: 500, headers: NO_STORE },
    );
  }

  opsLog(
    "shiftbuilder/desk-capture",
    "inserted",
    { id: data?.id, nightDate, actorId: session.actor.user.id },
    "info",
  );

  return NextResponse.json(
    { ok: true, id: data?.id ?? null, createdAt: data?.created_at ?? null },
    { status: 201, headers: NO_STORE },
  );
}

export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error },
      { status: session.status, headers: NO_STORE },
    );
  }

  if (!canReadDeskCaptures(session.actor.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: NO_STORE });
  }

  const client = createAdminClientSafe();
  if (!client) {
    return NextResponse.json(
      { ok: false, reason: "service_unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") || 40);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 40;

  const { data, error } = await client
    .from(TABLE)
    .select("id, created_at, note, night_date, build, operator_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true, entries: data ?? [] }, { headers: NO_STORE });
}
