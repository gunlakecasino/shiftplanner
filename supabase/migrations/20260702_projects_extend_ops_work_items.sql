-- =============================================================================
-- ShiftBuilder /projects — extend the existing (unused) ops_work_items schema
-- =============================================================================
-- ops_work_items + ops_project_phases/ops_phase_tasks/ops_status_history/
-- ops_completions/ops_tm_assignments/ops_zds_sync already existed in this
-- database with 0 rows and no application referencing them anywhere in this
-- repo. Rather than build a second, competing tasks schema, ShiftBuilder's new
-- /projects page adopts ops_work_items as its core table.
--
-- Two incompatibilities with ShiftBuilder specifically, both resolved here:
--
--   1. owner_id / created_by / assignee_staff_id / changed_by all FK to
--      auth.users(id) — Supabase Auth. ShiftBuilder operators are NOT Supabase
--      Auth users; they live in public.users with a custom PIN session
--      (see src/lib/auth/requireOpsSession.server.ts). Those columns will
--      stay NULL for every ShiftBuilder-created row. We add denormalized
--      *_name text columns instead, matching the existing
--      today_assignment_changes.operator_name convention elsewhere in this
--      database — attribution without a cross-auth-system FK.
--
--   2. A task only reaches a project via ops_project_phases ->
--      ops_phase_tasks (a 3-level Project -> Phase -> Task junction). For
--      ShiftBuilder's flat "Projects contain Tasks" model we add a direct
--      nullable ops_work_items.project_id self-reference. The phases layer is
--      left completely untouched and available later for anyone who wants
--      sub-grouping — the two are independent and don't conflict.
--
-- All writes go through /api/shiftbuilder/projects/** using the service-role
-- admin client (bypasses RLS), matching the pattern already established by
-- /api/shiftbuilder/slot-defaults. No RLS policy changes are needed here.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ops_work_items — additive columns
-- -----------------------------------------------------------------------------
ALTER TABLE ops_work_items
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES ops_work_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS updated_by_name text,
  ADD COLUMN IF NOT EXISTS status_reason text;

ALTER TABLE ops_work_items
  DROP CONSTRAINT IF EXISTS ops_work_items_category_check;
ALTER TABLE ops_work_items
  ADD CONSTRAINT ops_work_items_category_check CHECK (
    category IS NULL OR category = ANY (ARRAY[
      'maintenance','cleaning','admin','compliance','training','guest_experience','other'
    ])
  );

CREATE INDEX IF NOT EXISTS ops_work_items_project_id_idx ON ops_work_items (project_id);
CREATE INDEX IF NOT EXISTS ops_work_items_status_idx ON ops_work_items (status);
CREATE INDEX IF NOT EXISTS ops_work_items_due_date_idx ON ops_work_items (due_date);
CREATE INDEX IF NOT EXISTS ops_work_items_assignee_tm_id_idx ON ops_work_items (assignee_tm_id);
CREATE INDEX IF NOT EXISTS ops_work_items_work_type_idx ON ops_work_items (work_type);
CREATE INDEX IF NOT EXISTS ops_work_items_department_idx ON ops_work_items (department);
CREATE INDEX IF NOT EXISTS ops_work_items_archived_at_idx ON ops_work_items (archived_at);
CREATE INDEX IF NOT EXISTS ops_work_items_parent_template_id_idx ON ops_work_items (parent_template_id);

-- -----------------------------------------------------------------------------
-- 2. ops_status_history — same auth.users mismatch as above
-- -----------------------------------------------------------------------------
ALTER TABLE ops_status_history
  ADD COLUMN IF NOT EXISTS changed_by_name text;

-- -----------------------------------------------------------------------------
-- 3. New: checklist items (subtasks) — not part of the existing schema
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_work_item_checklist_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  uuid NOT NULL REFERENCES ops_work_items(id) ON DELETE CASCADE,
  label         text NOT NULL,
  is_done       boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_work_item_checklist_items_work_item_idx
  ON ops_work_item_checklist_items (work_item_id, sort_order);

-- -----------------------------------------------------------------------------
-- 4. New: comments — not part of the existing schema
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ops_work_item_comments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_item_id  uuid NOT NULL REFERENCES ops_work_items(id) ON DELETE CASCADE,
  author_name   text,
  body          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_work_item_comments_work_item_idx
  ON ops_work_item_comments (work_item_id, created_at);

-- -----------------------------------------------------------------------------
-- 5. RLS on the two new tables — same posture as the rest of ops_work_items:
--    no anon/authenticated policy at all. Every read and write goes through
--    the service-role admin client inside /api/shiftbuilder/projects/**.
-- -----------------------------------------------------------------------------
ALTER TABLE ops_work_item_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops_work_item_comments ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6. Realtime — ops_work_items and friends were never added to the
--    supabase_realtime publication. Add them so ShiftBuilder's new
--    live-sync layer (matching liveCache.ts conventions) actually fires.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ops_work_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_work_items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ops_work_item_checklist_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_work_item_checklist_items;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ops_work_item_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_work_item_comments;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ops_status_history'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ops_status_history;
  END IF;
END $$;

COMMIT;
