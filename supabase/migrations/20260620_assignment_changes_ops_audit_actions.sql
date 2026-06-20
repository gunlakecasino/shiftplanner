-- Expand deployment change log actions for settings, session, and engine audit.

BEGIN;

ALTER TABLE today_assignment_changes
  DROP CONSTRAINT IF EXISTS today_assignment_changes_action_check;

ALTER TABLE today_assignment_changes
  ADD CONSTRAINT today_assignment_changes_action_check
  CHECK (action IN (
    'assign', 'unassign', 'lock', 'unlock',
    'publish', 'unpublish', 'night_lock', 'night_unlock',
    'task_add', 'task_remove', 'coverage_add', 'break_change', 'task_color',
    'print',
    'settings_update', 'team_update', 'user_update', 'roster_update',
    'schedule_apply', 'defaults_push', 'engine_config', 'engine_run',
    'task_catalog', 'tm_defaults', 'session_start', 'session_end', 'settings_nav'
  ));

COMMIT;