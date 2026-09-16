-- SheetBuilder desk Capture packs (Graves Ops).
-- Live table already exists with this shape; IF NOT EXISTS keeps apply idempotent.
-- Insert via signed-in operator API (service role). Select for sudo_admin/admin
-- (Grok Ops is sudo_admin). PIN / pin keys are stripped in the API before insert.
-- Service-role only: RLS on, no anon/authenticated policy.
create table if not exists public.sheetbuilder_bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  night_date date,
  note text not null,
  pack jsonb not null default '{}'::jsonb,
  build text,
  route text,
  operator_id text,
  operator_name text,
  source text not null default 'desk_capture'
);

create index if not exists sheetbuilder_bug_reports_created_at_idx
  on public.sheetbuilder_bug_reports (created_at desc);
create index if not exists sheetbuilder_bug_reports_night_date_idx
  on public.sheetbuilder_bug_reports (night_date);

alter table public.sheetbuilder_bug_reports enable row level security;

comment on table public.sheetbuilder_bug_reports is
  'SheetBuilder desk Capture packs. Insert as signed-in operator via service-role API. Select for sudo_admin/admin (Grok Ops). PIN keys stripped before persist.';

revoke all on table public.sheetbuilder_bug_reports from anon, authenticated, public;
grant select, insert on table public.sheetbuilder_bug_reports to service_role;
