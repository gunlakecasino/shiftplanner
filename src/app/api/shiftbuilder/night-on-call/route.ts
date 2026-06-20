import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import { formatLocalDateISO, parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";

async function resolveNightId(
  supabase: NonNullable<ReturnType<typeof createAdminClientSafe>>,
  dateParam: string | null,
  nightIdParam: string | null,
): Promise<string | null> {
  if (nightIdParam) return nightIdParam;
  if (!dateParam) return null;

  const nightDate = parseLocalDateISO(dateParam);
  const iso = formatLocalDateISO(nightDate);

  const { data } = await supabase
    .from("nights")
    .select("id")
    .eq("night_date", iso)
    .maybeSingle();

  return data?.id ?? null;
}

export async function GET(request: NextRequest) {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ tmIds: [] });
  }

  const { searchParams } = new URL(request.url);
  const nightId = await resolveNightId(
    supabase,
    searchParams.get("date"),
    searchParams.get("night_id"),
  );

  if (!nightId) {
    return NextResponse.json({ tmIds: [] });
  }

  const { data, error } = await supabase
    .from("night_on_call")
    .select("tm_id")
    .eq("night_id", nightId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    nightId,
    tmIds: (data || []).map((r) => r.tm_id),
  });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canEditAssignments");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  try {
    const body = await request.json();
    const nightId = await resolveNightId(
      supabase,
      body.date ?? null,
      body.nightId ?? body.night_id ?? null,
    );
    const tmId = body.tmId ?? body.tm_id;

    if (!nightId || !tmId) {
      return NextResponse.json({ error: "nightId and tmId required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("night_on_call")
      .upsert({ night_id: nightId, tm_id: tmId }, { onConflict: "night_id,tm_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, nightId, tmId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canEditAssignments");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ error: "Service role not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const nightId = await resolveNightId(
    supabase,
    searchParams.get("date"),
    searchParams.get("night_id"),
  );
  const tmId = searchParams.get("tm_id");

  if (!nightId || !tmId) {
    return NextResponse.json({ error: "night_id and tm_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("night_on_call")
    .delete()
    .eq("night_id", nightId)
    .eq("tm_id", tmId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}