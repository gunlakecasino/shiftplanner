import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { revalidateNightBoardCaches } from "@/lib/shiftbuilder/revalidateOpsCache";

function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * POST /api/shiftbuilder/aux-layout
 * Body: { nightId: string, auxDefs: AuxDef[], date?: string }
 */
export async function POST(request: NextRequest) {
  let body: { nightId?: string; auxDefs?: AuxDef[]; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { nightId, auxDefs, date } = body;
  if (!nightId || !Array.isArray(auxDefs)) {
    return NextResponse.json(
      { error: "nightId and auxDefs[] required" },
      { status: 400 },
    );
  }

  try {
    const supabase = getServerSupabase();
    const { error } = await supabase
      .from("nights")
      .update({
        aux_layout: auxDefs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", nightId);

    if (error) {
      console.error("[aux-layout] update failed:", error);
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 500 },
      );
    }

    if (date) {
      try {
        await revalidateNightBoardCaches(date);
      } catch (e) {
        console.warn("[aux-layout] cache revalidate failed (non-fatal)", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[aux-layout] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to save aux layout",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}