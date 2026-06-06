'use server';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';

import type { TeamMember } from './data';

/**
 * Server-only cached roster + stable config reads.
 * Edge-cached via unstable_cache so the first touch of a week feels instant.
 *
 * Invalidation: revalidateTag('roster' | 'slot-defaults' | 'night-lookup')
 * from admin mutations (see revalidateOpsCache.ts).
 */

let _serverClient: SupabaseClient | null = null;

function getServerSupabase(): SupabaseClient {
  if (!_serverClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    _serverClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serverClient;
}

function mapProfileRow(p: any): TeamMember {
  return {
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: p.grave_pool ?? null,
    gender: p.gender ?? null,
  };
}

async function fetchTeamMembersBase(filter: Record<string, unknown> = {}): Promise<TeamMember[]> {
  const supabase = getServerSupabase();

  let query = supabase
    .from('tm_profiles')
    .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
    .eq('active', true);

  Object.entries(filter).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      query = query.eq(k, v);
    }
  });

  const { data, error } = await query.order('display_name', { ascending: true });

  if (error) {
    console.error('[data.server] roster fetch error:', error);
    return [];
  }

  return (data || []).map(mapProfileRow);
}

const cachedActiveRoster = unstable_cache(
  () => fetchTeamMembersBase(),
  ['shiftbuilder-active-roster'],
  { revalidate: 300, tags: ['roster'] },
);

const cachedGraveRoster = unstable_cache(
  async () => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('tm_profiles')
      .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
      .eq('active', true)
      .not('grave_pool', 'is', null)
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[data.server] grave roster error:', error);
      return [];
    }
    return (data || []).map(mapProfileRow);
  },
  ['shiftbuilder-grave-roster'],
  { revalidate: 300, tags: ['roster'] },
);

const cachedPMOverlapRoster = unstable_cache(
  async () => {
    const rows = await fetchTeamMembersBase({ grave_pool: 'PM' });
    return rows.map((p) => ({
      ...p,
      gravePool: 'PM' as const,
      isPMOverlap: true,
      isAMOverlap: false,
    }));
  },
  ['shiftbuilder-pm-overlap-roster'],
  { revalidate: 300, tags: ['roster'] },
);

const cachedAMOverlapRoster = unstable_cache(
  async () => {
    const rows = await fetchTeamMembersBase({ grave_pool: 'AM' });
    return rows.map((p) => ({
      ...p,
      gravePool: 'AM' as const,
      isPMOverlap: false,
      isAMOverlap: true,
    }));
  },
  ['shiftbuilder-am-overlap-roster'],
  { revalidate: 300, tags: ['roster'] },
);

export async function getCachedActiveTeamMembers(): Promise<TeamMember[]> {
  return cachedActiveRoster();
}

export async function getCachedGraveAvailableTeamMembers(): Promise<TeamMember[]> {
  return cachedGraveRoster();
}

export async function getCachedGravePMOverlapMembers(): Promise<TeamMember[]> {
  return cachedPMOverlapRoster();
}

export async function getCachedGraveAMOverlapMembers(): Promise<TeamMember[]> {
  return cachedAMOverlapRoster();
}

export interface CachedSlotDefault {
  slotKey: string;
  slotType: string;
  rrSide: string;
  defaultBreakGroup: number;
}

const cachedSlotDefaults = unstable_cache(
  async (): Promise<CachedSlotDefault[]> => {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from('slot_defaults')
      .select('slot_key, slot_type, rr_side, default_break_group')
      .order('slot_key', { ascending: true });

    if (error) {
      console.error('[data.server] getCachedSlotDefaults error:', error);
      return [];
    }

    return (data || []).map((r: any) => ({
      slotKey: r.slot_key,
      slotType: r.slot_type,
      rrSide: r.rr_side ?? '',
      defaultBreakGroup: r.default_break_group ?? 0,
    }));
  },
  ['shiftbuilder-slot-defaults'],
  { revalidate: 600, tags: ['slot-defaults'] },
);

export async function getCachedSlotDefaults(): Promise<CachedSlotDefault[]> {
  return cachedSlotDefaults();
}

/** Server-cached night id lookup — avoids repeated nights roundtrips during week prefetch. */
export async function getCachedNightIdForDate(isoDate: string): Promise<string | null> {
  const lookup = unstable_cache(
    async () => {
      const supabase = getServerSupabase();
      const { data, error } = await supabase
        .from('nights')
        .select('id')
        .eq('night_date', isoDate)
        .maybeSingle();

      if (error) {
        console.warn('[data.server] getCachedNightIdForDate error', error);
        return null;
      }
      return data?.id ?? null;
    },
    ['shiftbuilder-night-id', isoDate],
    { revalidate: 120, tags: ['night-lookup', `night-${isoDate}`] },
  );

  return lookup();
}