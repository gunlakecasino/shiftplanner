-- Additive snapshot of the last board seat when a TM is marked unavailable.
-- Table name stays call_offs (internal). Operator language is Marked Off.
alter table public.call_offs
  add column if not exists restore_seat jsonb;

comment on column public.call_offs.restore_seat is
  'Last board seat at mark-unavailable time: {slotKey, slotType, rrSide, isLocked, uiKey}. Used by Restore to re-place when canPlace still allows.';
