-- AI training feedback (docs/AI_SUPERVISOR_BRAIN.md §2.3).
-- Each row is a labeled example of the supervisor's judgment on an AI override:
-- endorsed or rejected, with the AI's rationale and the operator's reason.
-- Recent rows are injected into the brief as few-shot context. Additive.

create table if not exists ops_ai_feedback (
  id           uuid primary key default gen_random_uuid(),
  night_iso    text,
  slot_key     text,
  tm_id        text,
  tm_name      text,
  ai_rationale text,
  verdict      text not null check (verdict in ('endorsed', 'rejected')),
  reason       text,
  facts        text,
  created_at   timestamptz not null default now()
);

create index if not exists ops_ai_feedback_created_idx on ops_ai_feedback (created_at desc);

alter table ops_ai_feedback enable row level security;

drop policy if exists ops_ai_feedback_all on ops_ai_feedback;
create policy ops_ai_feedback_all
  on ops_ai_feedback
  for all
  using (true)
  with check (true);
