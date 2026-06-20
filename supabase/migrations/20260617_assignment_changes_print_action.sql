-- Print action in the deployment change log (/today print audit).

BEGIN;

ALTER TABLE today_assignment_changes
  DROP CONSTRAINT IF EXISTS today_assignment_changes_action_check;

ALTER TABLE today_assignment_changes
  ADD CONSTRAINT today_assignment_changes_action_check
  CHECK (action IN (
    'assign', 'unassign', 'lock', 'unlock',
    'publish', 'unpublish', 'night_lock', 'night_unlock',
    'task_add', 'task_remove', 'coverage_add', 'break_change', 'task_color',
    'print'
  ));

COMMIT;