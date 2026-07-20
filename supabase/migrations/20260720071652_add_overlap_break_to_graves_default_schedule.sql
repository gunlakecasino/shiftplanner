alter table public.graves_default_schedule
  add column if not exists overlap_break boolean not null default false;

comment on column public.graves_default_schedule.overlap_break is
  'When true, this schedule row always resolves the TM to the OL break group.';

-- Existing AM/PM overlap schedule rows already represent overlap TMs. Preserve
-- that operational meaning when the new explicit checkbox is introduced.
update public.graves_default_schedule
set overlap_break = true
where band in ('am_overlap', 'pm_overlap')
  and overlap_break is distinct from true;
