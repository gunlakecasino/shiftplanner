import { NextRequest, NextResponse } from 'next/server';
import type { UpsertTMOnCallScheduleInput } from '@/lib/shiftbuilder/types/schedules';
import { createAdminClient } from '../_lib/createAdminClient';

export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get('week_start');
  const tmId = searchParams.get('tm_id');

  let query = supabase
    .from('tm_on_call_schedules')
    .select('*')
    .order('week_start', { ascending: false });

  if (weekStart) query = query.eq('week_start', weekStart);
  if (tmId) query = query.eq('tm_id', tmId);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  try {
    const body: UpsertTMOnCallScheduleInput = await request.json();

    const { data, error } = await supabase
      .from('tm_on_call_schedules')
      .upsert({
        tm_id: body.tm_id,
        week_start: body.week_start,
        weekly_pattern: body.weekly_pattern,
        is_active: body.is_active ?? true,
        notes: body.notes,
      }, { onConflict: 'tm_id,week_start' })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}