import { NextResponse } from 'next/server';
import { createAdminClient } from '../_lib/createAdminClient';

const supabase = createAdminClient();

/**
 * Lightweight roster for Sudo TM Defaults admin.
 * Returns active TMs with grave_pool or all active for picker use.
 */
export async function GET() {
  const { data, error } = await supabase
    .from('tm_profiles')
    .select('id, full_name, display_name, employee_name, active, grave_pool, gender')
    .eq('active', true)
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roster = (data || []).map((t: any) => ({
    id: t.id,
    name: t.full_name || t.employee_name || t.display_name || t.id,
    pool: t.grave_pool,
    gender: t.gender,
  }));

  return NextResponse.json({ data: roster });
}
