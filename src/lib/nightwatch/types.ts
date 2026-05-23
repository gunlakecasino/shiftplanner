// ============================================================
// Nightwatch — TypeScript types
// ============================================================

// ---- DB row shapes (mirror supabase tables) ----------------

export interface ShiftNote {
  id: string;
  night_id: string;
  operator_id?: string | null;
  body: string;
  canvas_x: number;
  canvas_y: number;
  timeline_ts?: string | null;          // ISO timestamptz
  linked_entity_type?: 'zone' | 'tm' | 'rr' | null;
  linked_entity_id?: string | null;
  urgency: 'low' | 'normal' | 'urgent';
  created_at: string;
}

export interface CanvasStroke {
  id: string;
  night_id: string;
  operator_id?: string | null;
  path_data: string;                    // SVG path 'd' attribute
  color: string;
  stroke_width: number;
  created_at: string;
}

export interface ShiftEvent {
  id: string;
  night_id: string;
  operator_id?: string | null;
  event_time: string;                   // ISO timestamptz
  label: string;
  location: string;
  priority: 'low' | 'normal' | 'high';
  created_at: string;
}

// ---- UI-level data shapes ----------------------------------

export type ShiftMode = 'live' | 'past' | 'future';

export interface NightSummary {
  id: string;                           // UUID matching nights.id
  /** e.g. "Friday, May 23" */
  fullLabel: string;
  /** e.g. "FRI" */
  shortLabel: string;
  /** e.g. "May 23" */
  date: string;
  state: 'live' | 'past' | 'future';
  /** Short summary blurb shown on the shift tile */
  summary?: string;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
  due: string;                          // display string, e.g. "TONIGHT"
  lane: 'overdue' | 'today' | 'upcoming';
}

export interface ZoneAssignment {
  zone: number;                         // 1–10 etc.
  tmId: string | null;
  onBreak: boolean;
  breakBack?: string;                   // "03:45am" when onBreak
  breakIn?: string;                     // "in 32 min" when not on break
}

export interface RRRow {
  rr: string;                           // e.g. "A", "B", "C"
  mens: string | null;                  // TM id
  womens: string | null;                // TM id
}

export interface RosterMember {
  id: string;
  name: string;                         // "First Last"
  role: 'tm' | 'lead' | 'supervisor';
}

export type RosterState = Record<string, 'floor' | 'break' | 'calledoff'>;

export interface ZoneColor {
  bg: string;
  fg: string;
  label: string;
}

// ---- Shift event UI shape (used by EventsCard) ---------------------

export interface UIEvent {
  id: string;
  time: string;        // "HH:MM" 24-hour local time
  label: string;
  location: string;
  priority: 'low' | 'normal' | 'high';
}

// ---- Canvas observation (UI state only, persisted via ShiftNote) ----

export interface Observation {
  id: string;
  text: string;
  ts: string;                           // "HH:MM" 24-hour clock
  urgency: 'low' | 'normal' | 'urgent';
  x: number;
  y: number;
  linkedEntityType?: 'zone' | 'tm' | 'rr' | null;
  linkedEntityId?: string | null;
}

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export interface LiveStroke {
  points: StrokePoint[];
  color: string;
  width: number;
}

export interface CommittedStroke {
  id: string;
  pathData: string;
  color: string;
  width: number;
}
