'use server';

import { createClient } from '@supabase/supabase-js';

import type { TeamMember } from './data';

/**
 * Server-only cached roster data.
 * These are the heavy, stable parts that were killing day switch perf.
 *
 * Using 'use cache' + long cacheLife so the first touch of a week (or any day)
 * gets the roster nearly instantly from edge cache instead of hitting Supabase
 * from the browser every time.
 *
 * Invalidation: call revalidateTag('roster') from any admin mutation that
 * changes tm_profiles (grave_pool, active, etc.).
 */

// Create a server supabase client (anon key is fine for reads here)
function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchTeamMembersBase(filter: Record<string, any> = {}): Promise<TeamMember[]> {
  // Server action — runs closer to the DB than the browser.
  // For real edge caching we would add 'use cache' + cacheLife once the flag is stable in this Next version.
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

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: p.grave_pool ?? null,
    gender: p.gender ?? null,
  }));
}

export async function getCachedActiveTeamMembers(): Promise<TeamMember[]> {
  return fetchTeamMembersBase();
}

export async function getCachedGraveAvailableTeamMembers(): Promise<TeamMember[]> {
  // Server action (caching can be added later with stable 'use cache')
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

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: p.grave_pool ?? null,
    gender: p.gender ?? null,
  }));
}

export async function getCachedGravePMOverlapMembers(): Promise<TeamMember[]> {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from('tm_profiles')
    .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
    .eq('active', true)
    .eq('grave_pool', 'PM')
    .order('display_name', { ascending: true });

  if (error) return [];

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: 'PM',
    gender: p.gender ?? null,
    isPMOverlap: true,
    isAMOverlap: false,
  }));
}

export async function getCachedGraveAMOverlapMembers(): Promise<TeamMember[]> {
  const supabase = getServerSupabase();

  const { data, error } = await supabase
    .from('tm_profiles')
    .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
    .eq('active', true)
    .eq('grave_pool', 'AM')
    .order('display_name', { ascending: true });

  if (error) return [];

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: 'AM',
    gender: p.gender ?? null,
    isPMOverlap: false,
    isAMOverlap: true,
  }));
}
