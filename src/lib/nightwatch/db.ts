// ============================================================
// Nightwatch — Supabase data layer
// ============================================================
import { supabase } from '@/lib/supabase';
import type {
  NightSummary, TaskItem, ZoneAssignment, RRRow, RosterMember,
  Observation, CommittedStroke,
} from '@/lib/nightwatch/types';

// ── Shift-aware date helpers ──────────────────────────────────
// Grave shift: 23:00 → 06:55 (next calendar day).
// When it's Saturday 2:40am, the ACTIVE SHIFT started Friday 11pm —
// so the "shift date" is Friday (yesterday's calendar date).

function calendarDate(): string {
  return new Date().toISOString().substring(0, 10);
}

function isShiftActive(): boolean {
  const h = new Date().getHours();
  return h >= 23 || h < 7; // 11pm–6:59am
}

/** Returns the calendar date the current (or most recent) shift STARTED on. */
function getShiftDate(): string {
  const now = new Date();
  if (now.getHours() < 7) {
    // Early morning — shift started yesterday evening
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().substring(0, 10);
  }
  return now.toISOString().substring(0, 10);
}

function nightState(dateStr: string): NightSummary['state'] {
  const shiftDate = getShiftDate();
  const calDate   = calendarDate();
  if (dateStr === shiftDate && isShiftActive()) return 'live';
  if (dateStr < calDate) return 'past';
  return 'future';
}

function shortDay(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return `${shortDay(dateStr)} ${d.getMonth() + 1}/${d.getDate()}`;
}

function buildFullLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Task helpers ──────────────────────────────────────────────

function taskLane(dueAt: string | null): TaskItem['lane'] {
  if (!dueAt) return 'upcoming';
  const shiftDate = getShiftDate();
  // Shift ends ~07:00 the morning after the shift start date
  const shiftEnd = new Date(shiftDate).getTime() + 31 * 3600_000; // shift date + 31h ≈ 06:00 next morning
  const due = new Date(dueAt).getTime();
  if (due < Date.now()) return 'overdue';
  if (due <= shiftEnd) return 'today';
  return 'upcoming';
}

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return 'OPEN';
  const d = new Date(dueAt);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()} ${h}:${m}`;
}

// ── RR helpers ────────────────────────────────────────────────

function rrDisplayLabel(slotKey: string): string {
  // "rr_1_2" → "1+2", "rr_6" → "6", "rr_10" → "10"
  return slotKey.replace('rr_', '').replace('_', '+');
}

const RR_SLOT_ORDER = ['rr_1_2', 'rr_6', 'rr_7', 'rr_8', 'rr_10'];

// ── fetchCurrentWeekNights ────────────────────────────────────

export async function fetchCurrentWeekNights(): Promise<{
  nights: NightSummary[];
  todayNightId: string | null;
}> {
  const shiftDate = getShiftDate(); // Friday if it's early Saturday morning

  const { data: tonight, error: e1 } = await supabase
    .from('nights')
    .select('id, week_id')
    .eq('night_date', shiftDate)
    .maybeSingle();

  if (e1 || !tonight) return { nights: [], todayNightId: null };

  const { data: weekNights, error: e2 } = await supabase
    .from('nights')
    .select('id, night_date')
    .eq('week_id', tonight.week_id)
    .order('night_date');

  if (e2 || !weekNights) return { nights: [], todayNightId: tonight.id };

  const nights: NightSummary[] = weekNights.map(n => ({
    id: n.id,
    date: formatDate(n.night_date),
    shortLabel: shortDay(n.night_date),
    fullLabel: buildFullLabel(n.night_date),
    state: nightState(n.night_date),
    summary: nightState(n.night_date) === 'live' ? 'LIVE' : undefined,
  }));

  return { nights, todayNightId: tonight.id };
}

// ── fetchTasks ────────────────────────────────────────────────
// Tasks are currently global (night_id = null). Fetch all open tasks.

export async function fetchTasks(): Promise<TaskItem[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, status, priority, due_at')
    .neq('status', 'completed')
    .order('due_at', { ascending: true, nullsFirst: false });

  if (error || !data) return [];

  return data.map(t => ({
    id: t.id,
    text: t.title,
    done: t.status === 'completed',
    due: dueLabel(t.due_at),
    lane: taskLane(t.due_at),
  }));
}

export async function updateTaskStatus(id: string, done: boolean): Promise<void> {
  await supabase
    .from('tasks')
    .update({
      status: done ? 'completed' : 'open',
      updated_at: new Date().toISOString(),
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq('id', id);
}

export async function addTaskToNight(nightId: string, text: string): Promise<TaskItem | null> {
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      id,
      title: text,
      status: 'open',
      priority: 'normal',
      night_id: nightId,
      source: 'nightwatch',
    })
    .select('id, title, status, due_at')
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    text: data.title,
    done: false,
    due: 'TONIGHT',
    lane: 'today',
  };
}

// ── fetchZoneData ─────────────────────────────────────────────

export async function fetchZoneData(nightId: string): Promise<{
  zones: ZoneAssignment[];
  rr: RRRow[];
  roster: RosterMember[];
}> {
  const empty = { zones: [], rr: [], roster: [] };

  const { data: rows, error: e1 } = await supabase
    .from('zone_assignments')
    .select('slot_key, slot_type, tm_id, is_filled, rr_side, sort_order')
    .eq('night_id', nightId)
    .order('sort_order');

  if (e1 || !rows) return empty;

  // Collect all tm_ids for a batch name lookup
  const tmIds = [...new Set(rows.map(r => r.tm_id).filter((id): id is string => !!id))];
  const tmNameMap: Record<string, string> = {};

  if (tmIds.length > 0) {
    const { data: tmRows } = await supabase
      .from('tm_profiles')
      .select('tm_id, full_name, display_name')
      .in('tm_id', tmIds);

    if (tmRows) {
      for (const t of tmRows) {
        // display_name is the preferred short form ("Nikki", "JT", "Mike S")
        // full_name fallback for any TMs without a display_name
        tmNameMap[t.tm_id] = t.display_name || t.full_name || t.tm_id;
      }
    }
  }

  // Zone assignments (slot_type = 'zone')
  const zones: ZoneAssignment[] = rows
    .filter(r => r.slot_type === 'zone')
    .map(r => ({
      zone: parseInt(r.slot_key.replace('zone_', ''), 10),
      tmId: r.tm_id,
      onBreak: false,
    }))
    .sort((a, b) => a.zone - b.zone);

  // RR assignments — group by slot_key, split by rr_side
  const rrMap: Record<string, { mens: string | null; womens: string | null }> = {};
  for (const r of rows.filter(r => r.slot_type === 'rr' && r.is_filled)) {
    if (!rrMap[r.slot_key]) rrMap[r.slot_key] = { mens: null, womens: null };
    if (r.rr_side === 'mens') rrMap[r.slot_key].mens = r.tm_id;
    else if (r.rr_side === 'womens') rrMap[r.slot_key].womens = r.tm_id;
  }

  const rr: RRRow[] = RR_SLOT_ORDER
    .filter(k => rrMap[k])
    .map(k => ({
      rr: rrDisplayLabel(k),
      mens: rrMap[k].mens,
      womens: rrMap[k].womens,
    }));

  // Build roster from all TMs present tonight
  const roster: RosterMember[] = tmIds.map(id => ({
    id,
    name: tmNameMap[id] || id,
    role: 'tm' as const,
  }));

  return { zones, rr, roster };
}

// ── fetchShiftNotes ───────────────────────────────────────────

export async function fetchShiftNotes(nightId: string): Promise<Observation[]> {
  const { data, error } = await supabase
    .from('shift_notes')
    .select('id, body, canvas_x, canvas_y, urgency, linked_entity_type, linked_entity_id, created_at')
    .eq('night_id', nightId)
    .order('created_at');

  if (error || !data) return [];

  return data.map(n => {
    const d = new Date(n.created_at);
    const ts = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return {
      id: n.id,
      text: n.body,
      ts,
      urgency: n.urgency as 'low' | 'normal' | 'urgent',
      x: n.canvas_x,
      y: n.canvas_y,
      linkedEntityType: n.linked_entity_type as 'zone' | 'tm' | 'rr' | null ?? null,
      linkedEntityId: n.linked_entity_id ?? null,
    };
  });
}

export async function saveShiftNote(
  nightId: string,
  note: {
    text: string;
    urgency: 'low' | 'normal' | 'urgent';
    zone: string;
    tm: string;
    x: number;
    y: number;
    ts: string;
  }
): Promise<Observation | null> {
  const linkedType = note.zone ? 'zone' : note.tm ? 'tm' : null;
  const linkedId   = note.zone || note.tm || null;

  const { data, error } = await supabase
    .from('shift_notes')
    .insert({
      night_id: nightId,
      body: note.text,
      canvas_x: note.x,
      canvas_y: note.y,
      urgency: note.urgency,
      linked_entity_type: linkedType,
      linked_entity_id: linkedId,
    })
    .select('id, body, canvas_x, canvas_y, urgency, linked_entity_type, linked_entity_id, created_at')
    .single();

  if (error || !data) {
    console.error('[nightwatch] saveShiftNote error:', error);
    return null;
  }

  return {
    id: data.id,
    text: data.body,
    ts: note.ts,
    urgency: data.urgency as 'low' | 'normal' | 'urgent',
    x: data.canvas_x,
    y: data.canvas_y,
    linkedEntityType: data.linked_entity_type as 'zone' | 'tm' | 'rr' | null ?? null,
    linkedEntityId: data.linked_entity_id ?? null,
  };
}

// ── fetchCanvasStrokes ────────────────────────────────────────

export async function fetchCanvasStrokes(nightId: string): Promise<CommittedStroke[]> {
  const { data, error } = await supabase
    .from('canvas_strokes')
    .select('id, path_data, color, stroke_width')
    .eq('night_id', nightId)
    .order('created_at');

  if (error || !data) return [];

  return data.map(s => ({
    id: s.id,
    pathData: s.path_data,
    color: s.color,
    width: s.stroke_width,
  }));
}

export async function saveCanvasStroke(
  nightId: string,
  stroke: { pathData: string; color: string; width: number }
): Promise<void> {
  const { error } = await supabase
    .from('canvas_strokes')
    .insert({
      night_id: nightId,
      path_data: stroke.pathData,
      color: stroke.color,
      stroke_width: stroke.width,
    });

  if (error) console.error('[nightwatch] saveCanvasStroke error:', error);
}
