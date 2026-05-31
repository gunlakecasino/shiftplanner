-- ============================================================================
-- TM Groups + On-Call Schedules
-- ============================================================================

-- TM Groups for organizing Team Members
create table if not exists public.tm_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

comment on table public.tm_groups is 'Logical groupings of Team Members for scheduling, reporting, and permissions.';

-- Membership (many-to-many)
create table if not exists public.tm_group_members (
  tm_id uuid not null references public.tm_profiles(id) on delete cascade,
  group_id uuid not null references public.tm_groups(id) on delete cascade,
  assigned_at timestamptz default now(),
  primary key (tm_id, group_id)
);

-- On-Call Schedules (per week)
create table if not exists public.tm_on_call_schedules (
  id uuid primary key default gen_random_uuid(),
  tm_id uuid not null references public.tm_profiles(id) on delete cascade,
  week_start date not null,
  weekly_pattern jsonb not null,
  is_active boolean default true,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tm_id, week_start)
);

comment on table public.tm_on_call_schedules is 
'Per-week on-call assignments for TMs. Allows entering who is on-call for specific weeks with their shift patterns.';

create index if not exists idx_tm_on_call_schedules_week on public.tm_on_call_schedules (week_start desc);
create index if not exists idx_tm_on_call_schedules_tm on public.tm_on_call_schedules (tm_id);

-- Triggers
drop trigger if exists trg_tm_groups_updated_at on public.tm_groups;
create trigger trg_tm_groups_updated_at
before update on public.tm_groups
for each row execute function public.set_updated_at();

drop trigger if exists trg_tm_on_call_schedules_updated_at on public.tm_on_call_schedules;
create trigger trg_tm_on_call_schedules_updated_at
before update on public.tm_on_call_schedules
for each row execute function public.set_updated_at();

-- RLS
alter table public.tm_groups enable row level security;
alter table public.tm_group_members enable row level security;
alter table public.tm_on_call_schedules enable row level security;

create policy "Service role full access" on public.tm_groups for all to service_role using (true) with check (true);
create policy "Service role full access" on public.tm_group_members for all to service_role using (true) with check (true);
create policy "Service role full access" on public.tm_on_call_schedules for all to service_role using (true) with check (true);