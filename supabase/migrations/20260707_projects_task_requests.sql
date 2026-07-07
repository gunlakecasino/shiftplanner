-- =============================================================================
-- ShiftBuilder /projects — task requests (owner-scoped intake + approval)
-- =============================================================================
-- Adds a narrow "request" intake path: viewers (or anyone granted
-- canRequestTasks) submit task/project requests from the main board. Requests
-- are ordinary ops_work_items rows flagged approval_state='pending' until a
-- manager approves them. Two additive needs:
--
--   1. created_by_user_id — a STABLE owner key (FK to public.users, the ops
--      user identity) so "my requests" can be listed / edited / deleted safely.
--      The existing created_by column FKs auth.users (unused by ShiftBuilder)
--      and created_by_name is a display string only; neither is a safe
--      ownership key.
--
--   2. approval_state — pending | approved | rejected. Defaults to 'approved'
--      so every existing row and every manager-created item stays active; only
--      submitted requests start 'pending' and are hidden from active views
--      until approved. approval_note carries a rejection reason back to the
--      requester.
--
-- All writes go through /api/shiftbuilder/projects/** using the service-role
-- admin client (bypasses RLS), matching the existing pattern. No RLS changes.
-- =============================================================================

BEGIN;

ALTER TABLE ops_work_items
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_state text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approval_note text;

ALTER TABLE ops_work_items
  DROP CONSTRAINT IF EXISTS ops_work_items_approval_state_check;
ALTER TABLE ops_work_items
  ADD CONSTRAINT ops_work_items_approval_state_check CHECK (
    approval_state = ANY (ARRAY['pending','approved','rejected'])
  );

CREATE INDEX IF NOT EXISTS ops_work_items_created_by_user_id_idx
  ON ops_work_items (created_by_user_id);
CREATE INDEX IF NOT EXISTS ops_work_items_approval_state_idx
  ON ops_work_items (approval_state);

COMMIT;
