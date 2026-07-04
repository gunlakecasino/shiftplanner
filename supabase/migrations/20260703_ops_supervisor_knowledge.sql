-- Supervisor Brain knowledge base (docs/AI_SUPERVISOR_BRAIN.md).
-- Single global JSONB blob for the solo ops tool: TM dossiers (capability by
-- zone, accommodations, reliability, dev goals, notes), chemistry graph, zone
-- profiles, and rules-of-thumb policies. Additive — no existing data touched.

create table if not exists ops_supervisor_knowledge (
  id          text primary key default 'default',
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into ops_supervisor_knowledge (id, data)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

-- The ShiftBuilder app is gated at the application layer (OpsAuthGate + PIN);
-- this single-tenant table follows the same permissive pattern as engine_config.
alter table ops_supervisor_knowledge enable row level security;

drop policy if exists ops_supervisor_knowledge_all on ops_supervisor_knowledge;
create policy ops_supervisor_knowledge_all
  on ops_supervisor_knowledge
  for all
  using (true)
  with check (true);
