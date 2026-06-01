import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../_lib/createAdminClient';

/**
 * GET /api/admin/tm-groups
 * Returns all groups + their members (for the new static TM schedule system).
 */
export async function GET() {
  const supabase = createAdminClient();
  const { data: groups, error: gErr } = await supabase
    .from('tm_groups')
    .select('*')
    .order('name');

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const { data: members, error: mErr } = await supabase
    .from('tm_group_members')
    .select('tm_id, group_id, assigned_at');

  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  // Join lightly on client
  const groupsWithMembers = (groups || []).map((g: any) => ({
    ...g,
    members: (members || []).filter((m: any) => m.group_id === g.id).map((m: any) => m.tm_id),
  }));

  return NextResponse.json({ data: groupsWithMembers });
}

/**
 * POST /api/admin/tm-groups
 * Body can be:
 *  - { action: 'create_group', name, description?, color? }
 *  - { action: 'add_member', group_id, tm_id }
 *  - { action: 'remove_member', group_id, tm_id }
 */
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();
  try {
    const body = await request.json();

    if (body.action === 'create_group') {
      const { data, error } = await supabase
        .from('tm_groups')
        .insert({
          name: body.name,
          description: body.description,
          color: body.color,
        })
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (body.action === 'add_member') {
      const { error } = await supabase
        .from('tm_group_members')
        .upsert({ group_id: body.group_id, tm_id: body.tm_id }, { onConflict: 'tm_id,group_id' });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'remove_member') {
      const { error } = await supabase
        .from('tm_group_members')
        .delete()
        .eq('group_id', body.group_id)
        .eq('tm_id', body.tm_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
