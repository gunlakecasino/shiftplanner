import { NextRequest, NextResponse } from 'next/server';
import { isSameOriginOpsRequest } from '@/app/api/_lib/sameOrigin';
import { requireOpsPermission, requireOpsSession } from '@/lib/auth/requireOpsSession.server';
import type { UpsertTMDefaultScheduleInput } from '@/lib/shiftbuilder/types/schedules';
import { createAdminClientSafe } from '../_lib/createAdminClient';

/**
 * GET /api/admin/tm-default-schedules
 * Returns all (or filtered) TM default schedules.
 */
export async function GET(request: NextRequest) {
  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ data: [] });
  }
  const { searchParams } = new URL(request.url);
  const tmId = searchParams.get('tm_id');

  let query = supabase
    .from('tm_default_schedules')
    .select('*')
    .order('effective_from', { ascending: false });

  if (tmId) {
    query = query.eq('tm_id', tmId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

/**
 * POST /api/admin/tm-default-schedules
 * Upsert a TM default schedule (for Sudo or import scripts).
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canAccessSudo");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 503 });
  }
  try {
    const body: UpsertTMDefaultScheduleInput = await request.json();

    if (!body.tm_id || !body.effective_from || !body.weekly_pattern) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('tm_default_schedules')
      .upsert({
        tm_id: body.tm_id,
        effective_from: body.effective_from,
        weekly_pattern: body.weekly_pattern,
        source: body.source ?? 'sudo-edit',
        notes: body.notes,
      }, {
        onConflict: 'tm_id,effective_from',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}