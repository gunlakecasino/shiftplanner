-- =============================================================================
-- Master Ops AI Agent (xAI Sphere) — Persistent Conversation & Memory Tables
-- =============================================================================
-- These tables power the always-present "xAI Sphere" / Master Operational Agent
-- that lives on the main ShiftBuilder canvas.
--
-- Philosophy:
--   - Everything the agent knows and says is first-class Supabase data.
--   - Conversations are tied to (user + GRAVE week) so history is naturally
--     scoped and survives refreshes / deployments.
--   - Lightweight structured memory lets the agent maintain longitudinal
--     understanding (fairness observations, recurring risks, operator notes)
--     without dumping raw history into every prompt.
--   - All writes are auditable; RLS ensures operators only see their own or
--     explicitly shared agent activity.
--
-- Phase 1 scope: threads + messages only (persistent chat shell proof).
-- agent_memory will be added in Phase 2 when we turn on real intelligence.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. THREADS: one conversation container per (user, week)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_threads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable during early dev spike (dev sessions use NULL or synthetic id)
  week_start       DATE NOT NULL,                    -- Friday of the GRAVE week
  title            TEXT,                             -- optional human or agent-generated title
  summary          TEXT,                             -- rolling summary maintained by the agent
  last_message_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active thread per user per week is the common case.
CREATE UNIQUE INDEX IF NOT EXISTS agent_threads_user_week_unique
  ON agent_threads (user_id, week_start);

CREATE INDEX IF NOT EXISTS agent_threads_user_idx
  ON agent_threads (user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS agent_threads_week_idx
  ON agent_threads (week_start);

-- -----------------------------------------------------------------------------
-- 2. MESSAGES: individual turns inside a thread
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id         UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  role              TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content           TEXT NOT NULL,
  reasoning_effort  TEXT,                             -- 'none' | 'low' | 'medium' | 'high' when assistant
  token_usage       JSONB,                            -- { prompt_tokens, completion_tokens, reasoning_tokens, total_tokens }
  citations         JSONB,                            -- which notes, tasks, assignments, memory entries informed this turn
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_messages_thread_idx
  ON agent_messages (thread_id, created_at);

CREATE INDEX IF NOT EXISTS agent_messages_role_idx
  ON agent_messages (role);

-- -----------------------------------------------------------------------------
-- 3. UPDATED_AT TRIGGER (keeps threads fresh)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_threads_updated_at ON agent_threads;
CREATE TRIGGER update_agent_threads_updated_at
  BEFORE UPDATE ON agent_threads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Operators can see and manage only their own threads (and the messages inside them).
-- In later phases we can add "shared with team" or "SUDO view" policies.
CREATE POLICY "Users can manage their own agent threads"
  ON agent_threads
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage messages in their own threads"
  ON agent_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM agent_threads t
      WHERE t.id = agent_messages.thread_id
        AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_threads t
      WHERE t.id = agent_messages.thread_id
        AND t.user_id = auth.uid()
    )
  );

-- Service role (server actions / edge functions) can do everything.
-- This is how the intelligence layer will write summaries, memory, etc.
CREATE POLICY "Service role has full access to agent data"
  ON agent_threads
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role has full access to agent messages"
  ON agent_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;

-- =============================================================================
-- Post-migration notes for operators / devs
-- =============================================================================
-- After applying:
--   1. The xAI Sphere UI can create a thread on first open for the current user + weekStart.
--   2. All chat history will be durable and queryable from Supabase Studio.
--   3. In Phase 2 we will add the agent_memory table + richer context assembly.
--
-- To inspect a user's threads for a week:
--   select * from agent_threads where user_id = '...' and week_start = '2026-05-22';
-- =============================================================================