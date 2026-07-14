-- Forward-dated TM unavailability (PTO / LOA / MDL / off), keyed on slug tm_profiles.tm_id.
-- Subtracted from the engine roster per night via getUnavailableTmIdsForDate()
-- in sudoBatchPlanner.server.ts (batch/day/week runs) + actions.ts (week preview).
-- Service-role only: RLS on, no anon/authenticated policy.
create table if not exists public.tm_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  tm_id text not null,
  exception_date date not null,
  kind text not null default 'PTO' check (kind in ('PTO','LOA','MDL','off','called_off')),
  reason text,
  source text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (tm_id, exception_date)
);
create index if not exists idx_tm_avail_exc_date on public.tm_availability_exceptions (exception_date);
alter table public.tm_availability_exceptions enable row level security;
comment on table public.tm_availability_exceptions is 'Forward-dated TM unavailability (PTO/LOA/MDL/off), keyed on slug tm_profiles.tm_id. Subtracted from the engine roster per night. Service-role only.';
