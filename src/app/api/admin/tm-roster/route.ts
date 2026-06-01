import { NextResponse } from 'next/server';
import { createAdminClientSafe } from '../_lib/createAdminClient';

/**
 * Lightweight roster for Sudo TM Defaults admin.
 * Returns active TMs with grave_pool or all active for picker use.
 */
export async function GET() {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    return NextResponse.json({ data: [], note: "Service role key not available on this environment" });
  }

  const { data, error } = await supabase
    .from('tm_profiles')
    .select('id, tm_id, full_name, display_name, employee_name, active, grave_pool, gender')
    .eq('active', true)
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roster = (data || []).map((t: any) => ({
    // ShiftBuilder assignments + picker use legacy `tm_id`; keep UUID as profileId.
    id: t.tm_id || t.id,
    profileId: t.id,
    tm_id: t.tm_id || t.id,
    name: t.full_name || t.employee_name || t.display_name || t.tm_id || t.id,
    pool: t.grave_pool,
    gender: t.gender,
  }));

  return NextResponse.json({ data: roster });
}
