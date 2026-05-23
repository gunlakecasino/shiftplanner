import type {
  ZoneColor, RosterMember, RosterState, ZoneAssignment,
  RRRow, TaskItem, ShiftEvent, Observation, CommittedStroke, NightSummary,
} from '@/lib/nightwatch/types';

export const ZONE_COLORS: Record<number, ZoneColor> = {
  1:  { bg: '#d4a44a', fg: '#1a1208', label: 'GOLD' },
  2:  { bg: '#3aa6ff', fg: '#04141f', label: 'BLUE' },
  3:  { bg: '#e44d3a', fg: '#1c0805', label: 'RED' },
  4:  { bg: '#7d5cff', fg: '#0a0518', label: 'VIOLET' },
  5:  { bg: '#ff8a3a', fg: '#1a0a04', label: 'ORANGE' },
  6:  { bg: '#3acab1', fg: '#031814', label: 'MINT' },
  7:  { bg: '#c84f9c', fg: '#1a0512', label: 'MAGENTA' },
  8:  { bg: '#a3c93c', fg: '#0d1304', label: 'LIME' },
  9:  { bg: '#2dd4d4', fg: '#031818', label: 'TEAL' },
  10: { bg: '#e8e2c8', fg: '#1a1a08', label: 'IVORY' },
};

export const ROSTER: RosterMember[] = [
  { id: 'tm01', name: 'Riley Acoma',      role: 'lead' },
  { id: 'tm02', name: 'Marcus Vance',     role: 'supervisor' },
  { id: 'tm03', name: 'Devon Park',       role: 'tm' },
  { id: 'tm04', name: 'Sasha Reyes',      role: 'tm' },
  { id: 'tm05', name: 'Jordan Belmonte',  role: 'tm' },
  { id: 'tm06', name: 'Imani Carruthers', role: 'tm' },
  { id: 'tm07', name: 'Wes Pottier',      role: 'tm' },
  { id: 'tm08', name: 'Nina Okafor',      role: 'tm' },
  { id: 'tm09', name: 'Tomas Linde',      role: 'tm' },
  { id: 'tm10', name: 'Aurelia Chen',     role: 'tm' },
  { id: 'tm11', name: 'Brandt Kowalski',  role: 'tm' },
  { id: 'tm12', name: 'Yuki Tanabe',      role: 'tm' },
  { id: 'tm13', name: 'Cole Whitaker',    role: 'tm' },
  { id: 'tm14', name: 'Priya Subramani',  role: 'tm' },
  { id: 'tm15', name: 'Diego Salazar',    role: 'tm' },
  { id: 'tm16', name: 'Ashleigh Brodie',  role: 'tm' },
  { id: 'tm17', name: 'Hannah Voigt',     role: 'tm' },
];

export const ROSTER_STATE: RosterState = {
  tm01: 'floor', tm02: 'floor', tm03: 'floor', tm04: 'break',
  tm05: 'floor', tm06: 'floor', tm07: 'break', tm08: 'floor',
  tm09: 'floor', tm10: 'floor', tm11: 'floor', tm12: 'floor',
  tm13: 'floor', tm14: 'floor', tm15: 'floor', tm16: 'floor',
  tm17: 'calledoff',
};

export const ZONE_ASSIGN: ZoneAssignment[] = [
  { zone: 1,  tmId: 'tm01', onBreak: false, breakIn: '03:15' },
  { zone: 2,  tmId: 'tm03', onBreak: false, breakIn: '03:45' },
  { zone: 3,  tmId: 'tm04', onBreak: true,  breakBack: '03:05' },
  { zone: 4,  tmId: 'tm05', onBreak: false, breakIn: '04:10' },
  { zone: 5,  tmId: 'tm06', onBreak: false, breakIn: '03:30' },
  { zone: 6,  tmId: 'tm07', onBreak: false, breakIn: '04:25' },
  { zone: 7,  tmId: 'tm08', onBreak: true,  breakBack: '03:20' },
  { zone: 8,  tmId: 'tm09', onBreak: false, breakIn: '04:00' },
  { zone: 9,  tmId: 'tm10', onBreak: false, breakIn: '03:55' },
  { zone: 10, tmId: 'tm11', onBreak: false, breakIn: '04:40' },
];

export const RR_ASSIGN: RRRow[] = [
  { rr: '1+2', mens: 'tm12', womens: 'tm13' },
  { rr: '6',   mens: 'tm14', womens: 'tm15' },
  { rr: '7',   mens: 'tm02', womens: null   },
  { rr: '8',   mens: 'tm16', womens: 'tm12' },
  { rr: '10',  mens: 'tm13', womens: 'tm14' },
];

export const TASKS: TaskItem[] = [
  { id: 't01', lane: 'overdue', text: 'Walk Z7 cooler temp log — 2 nights missing',     due: 'Fri',  done: false },
  { id: 't02', lane: 'overdue', text: "Replace RR-8 men's soap dispenser",               due: 'Thu',  done: false },
  { id: 't03', lane: 'today',   text: 'Reset Z3 high-limit progressive at 0400',         due: '04:00', done: false },
  { id: 't04', lane: 'today',   text: 'Run BEO checklist for Vandermeer wedding setup',  due: '0530', done: false },
  { id: 't05', lane: 'today',   text: 'Sweep west valet for kiosk fragments',             due: '0245', done: true  },
  { id: 't06', lane: 'today',   text: 'Confirm Z10 carpet repair flagged',                due: '0600', done: false },
  { id: 't07', lane: 'upcoming', text: 'Tribal council walkthrough',                     due: 'Mon 5/25 0500', done: false },
  { id: 't08', lane: 'upcoming', text: 'Wawyé Oasis filter swap',                        due: 'Tue 5/26 0300', done: false },
  { id: 't09', lane: 'upcoming', text: 'Quarterly comp tracker audit',                   due: 'Wed 5/27 0400', done: false },
];

export const EVENTS: ShiftEvent[] = [
  { id: 'e01', night_id: 'n02', event_time: '1970-01-01T23:30:00Z', label: 'Shift huddle — Z-line briefing',         location: 'Back-of-house',     priority: 'normal', created_at: '' },
  { id: 'e02', night_id: 'n02', event_time: '1970-01-02T00:15:00Z', label: 'Vandermeer reception breakdown',         location: 'Banquet Hall A',    priority: 'normal', created_at: '' },
  { id: 'e03', night_id: 'n02', event_time: '1970-01-02T02:00:00Z', label: 'Comp soft-count drop',                   location: 'Cage / Soft Count', priority: 'high',   created_at: '' },
  { id: 'e04', night_id: 'n02', event_time: '1970-01-02T03:30:00Z', label: 'High-limit VIP — table 47, $25k buy-in', location: 'High-Limit Salon',  priority: 'high',   created_at: '' },
  { id: 'e05', night_id: 'n02', event_time: '1970-01-02T04:45:00Z', label: 'Carpet team — Z10 patch',                location: 'Floor / Zone 10',   priority: 'low',    created_at: '' },
  { id: 'e06', night_id: 'n02', event_time: '1970-01-02T05:30:00Z', label: 'Banquet setup — Vandermeer wedding',     location: 'Banquet Hall A',    priority: 'normal', created_at: '' },
];

// Simplified event shape for UI use
export type UIEvent = { id: string; time: string; label: string; location: string; priority: 'low' | 'normal' | 'high' };
export const UI_EVENTS: UIEvent[] = [
  { id: 'e01', time: '23:30', label: 'Shift huddle — Z-line briefing',         location: 'Back-of-house',     priority: 'normal' },
  { id: 'e02', time: '00:15', label: 'Vandermeer reception breakdown',         location: 'Banquet Hall A',    priority: 'normal' },
  { id: 'e03', time: '02:00', label: 'Comp soft-count drop',                   location: 'Cage / Soft Count', priority: 'high'   },
  { id: 'e04', time: '03:30', label: 'High-limit VIP — table 47, $25k buy-in', location: 'High-Limit Salon',  priority: 'high'   },
  { id: 'e05', time: '04:45', label: 'Carpet team — Z10 patch',                location: 'Floor / Zone 10',   priority: 'low'    },
  { id: 'e06', time: '05:30', label: 'Banquet setup — Vandermeer wedding',     location: 'Banquet Hall A',    priority: 'normal' },
];

export const OBSERVATIONS: Observation[] = [
  { id: 'o01', x: 220, y: 140, ts: '23:18', urgency: 'normal', text: 'Floor handoff: graveyard rolling clean — last day shift left Z6 short a stool, swapped from BOH inventory.', linkedEntityType: 'zone', linkedEntityId: '9' },
  { id: 'o02', x: 580, y: 230, ts: '00:42', urgency: 'normal', text: 'Z3 Mira called break early — said high-limit guest at 47 was getting tense. Marcus floated 15min.', linkedEntityType: 'tm', linkedEntityId: 'tm04' },
  { id: 'o03', x: 940, y: 190, ts: '01:14', urgency: 'urgent', text: 'Spike in losses on Z7 bank 14-16. Possibly a sticky bill validator. Tagged engineering ticket #41209.', linkedEntityType: 'zone', linkedEntityId: '7' },
  { id: 'o04', x: 360, y: 360, ts: '01:55', urgency: 'normal', text: "RR-7 Women's out — Priya off-shift, no backfill yet. Holding the row until 03:00.", linkedEntityType: 'rr', linkedEntityId: '7' },
  { id: 'o05', x: 820, y: 410, ts: '02:30', urgency: 'low',    text: 'BEO 03:00 — soft count drop running normal. Two cart pulls, both reconciled clean.', linkedEntityType: null, linkedEntityId: null },
  { id: 'o06', x: 1160, y: 330, ts: '02:38', urgency: 'normal', text: 'Heads-up: Vandermeer setup at 0530 needs the riser pulled from storage Z2. Already paged BOH.', linkedEntityType: 'zone', linkedEntityId: '2' },
];

export const STROKES: CommittedStroke[] = [
  { id: 's01', pathData: 'M 920 170 Q 880 165 870 200 Q 875 235 925 240 Q 980 235 985 200 Q 985 168 925 168 Z', color: '#FFD60A', width: 2.4 },
  { id: 's02', pathData: 'M 940 250 Q 700 280 410 350', color: '#F2F2F4', width: 1.6 },
  { id: 's03', pathData: 'M 425 345 L 408 358 M 425 345 L 410 332', color: '#F2F2F4', width: 1.6 },
  { id: 's04', pathData: 'M 830 388 q 8 -6 18 -2 q -6 8 -10 12 q 10 -2 16 -6 m 8 -6 q -2 8 4 12 q 8 -2 10 -10 q -2 -8 -10 -6 m 16 -2 q 0 10 8 12', color: '#F2F2F4', width: 1.8 },
  { id: 's05', pathData: 'M 700 470 l 14 16 l 30 -32', color: '#3acab1', width: 3 },
  { id: 's06', pathData: 'M 320 348 l 60 18 M 380 348 l -60 18', color: '#e44d3a', width: 1.8 },
  { id: 's07', pathData: 'M 600 540 l -4 10 l 200 0 l -4 -10', color: '#FFD60A', width: 1.8 },
  { id: 's08', pathData: 'M 1180 380 q -10 -4 -12 8 q 0 12 10 12 q 10 -2 12 -10 q -2 -10 -10 -10 m 18 -4 l 0 24 m 0 -10 l 12 -14 m -10 6 l 12 18', color: '#F2F2F4', width: 1.6 },
  { id: 's09', pathData: 'M 1000 130 l 0 30 m 0 8 l 0 4', color: '#e44d3a', width: 3.4 },
  { id: 's10', pathData: 'M 880 285 q 8 -6 16 0 q 8 6 16 0 q 8 -6 16 0 q 8 6 16 0', color: '#FFD60A', width: 1.6 },
];

export const WEEK: NightSummary[] = [
  { id: 'n01', date: 'Fri 5/22', shortLabel: 'FRI', fullLabel: 'Friday May 22',    state: 'past',   summary: '14 on floor · 0 incidents · 8 tasks closed' },
  { id: 'n02', date: 'Sat 5/23', shortLabel: 'SAT', fullLabel: 'Saturday May 23',  state: 'live',   summary: 'MID-SHIFT · 14 on floor · 3 open tasks' },
  { id: 'n03', date: 'Sun 5/24', shortLabel: 'SUN', fullLabel: 'Sunday May 24',    state: 'future', summary: 'Scheduled · 13 on floor · 1 callout pending' },
  { id: 'n04', date: 'Mon 5/25', shortLabel: 'MON', fullLabel: 'Monday May 25',    state: 'future', summary: 'Scheduled · 12 on floor' },
  { id: 'n05', date: 'Tue 5/26', shortLabel: 'TUE', fullLabel: 'Tuesday May 26',   state: 'future', summary: 'Scheduled · 14 on floor · Wawyé filter swap' },
  { id: 'n06', date: 'Wed 5/27', shortLabel: 'WED', fullLabel: 'Wednesday May 27', state: 'future', summary: 'Scheduled · 13 on floor' },
  { id: 'n07', date: 'Thu 5/28', shortLabel: 'THU', fullLabel: 'Thursday May 28',  state: 'future', summary: 'Scheduled · 14 on floor' },
];
