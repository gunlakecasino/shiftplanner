-- ============================================================================
-- STATIC TM DEFAULT WEEKLY SCHEDULES (Grave / Overlap)
-- ============================================================================

-- 1. Ensure the helper function exists
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- SAFETY: Ensure tm_profiles has an 'id' column (common source of FK errors)
-- This version is safer and avoids "multiple primary keys" errors.
-- ============================================================================
DO $$
BEGIN
  -- Add the 'id' column if it doesn't exist (as a regular uuid column, not PK)
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'tm_profiles' 
      AND column_name = 'id'
  ) THEN
    ALTER TABLE public.tm_profiles 
    ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();

    -- Make it unique so it can be referenced by foreign keys
    ALTER TABLE public.tm_profiles 
    ADD CONSTRAINT IF NOT EXISTS tm_profiles_id_key UNIQUE (id);
  END IF;
END $$;

-- ============================================================================
-- TM Default Weekly Schedules Table
-- ============================================================================

create table if not exists public.tm_default_schedules (
  id uuid primary key default gen_random_uuid(),
  tm_id uuid not null references public.tm_profiles(id) on delete cascade,
  effective_from date not null default current_date,
  weekly_pattern jsonb not null,
  source text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (tm_id, effective_from)
);

comment on table public.tm_default_schedules is 
'Static, repeating weekly default schedules for Grave/Overlap TMs.';

create index if not exists idx_tm_default_schedules_lookup
  on public.tm_default_schedules (tm_id, effective_from desc);

create trigger trg_tm_default_schedules_updated_at
before update on public.tm_default_schedules
for each row execute function public.set_updated_at();

alter table public.tm_default_schedules enable row level security;

create policy "Service role full access on tm_default_schedules"
  on public.tm_default_schedules
  for all
  to service_role
  using (true)
  with check (true);