-- ============================================================================
-- Graves Default Schedule (master Fri–Thu boolean grid) + per-night on-call
-- ============================================================================

create table if not exists public.graves_default_schedule (
  id uuid primary key default gen_random_uuid(),
  tm_id uuid not null references public.tm_profiles(id) on delete cascade,
  band text not null check (band in ('grave', 'am_overlap', 'pm_overlap')),
  days jsonb not null default '{"fri":false,"sat":false,"sun":false,"mon":false,"tue":false,"wed":false,"thu":false}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tm_id, band)
);

comment on table public.graves_default_schedule is
  'Master repeating weekly schedule: scheduled/off per shift week day (fri–thu). Single source for TM Picker.';

create index if not exists idx_graves_default_schedule_band
  on public.graves_default_schedule (band);

drop trigger if exists trg_graves_default_schedule_updated_at on public.graves_default_schedule;
create trigger trg_graves_default_schedule_updated_at
before update on public.graves_default_schedule
for each row execute function public.set_updated_at();

create table if not exists public.night_on_call (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.nights(id) on delete cascade,
  tm_id uuid not null references public.tm_profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (night_id, tm_id)
);

comment on table public.night_on_call is
  'Per-night on-call TMs added manually from the TM Picker search (not on the default grid).';

create index if not exists idx_night_on_call_night on public.night_on_call (night_id);

alter table public.graves_default_schedule enable row level security;
alter table public.night_on_call enable row level security;

create policy graves_default_schedule_service_all on public.graves_default_schedule
  for all to service_role using (true) with check (true);

create policy night_on_call_service_all on public.night_on_call
  for all to service_role using (true) with check (true);

drop policy if exists graves_default_schedule_anon_authenticated_all on public.graves_default_schedule;
create policy graves_default_schedule_anon_authenticated_all on public.graves_default_schedule
  for all
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));

drop policy if exists night_on_call_anon_authenticated_all on public.night_on_call;
create policy night_on_call_anon_authenticated_all on public.night_on_call
  for all
  using (auth.role() in ('anon', 'authenticated'))
  with check (auth.role() in ('anon', 'authenticated'));