-- Sentinel week + night for meta audit rows (session_start, settings_*, etc.).
-- today_assignment_changes.night_id is NOT NULL REFERENCES nights(id).
-- Client SETTINGS_NIGHT_ID = 00000000-0000-0000-0000-000000000000.

BEGIN;

INSERT INTO weeks (id, week_ending)
SELECT '00000000-0000-0000-0000-000000000001'::uuid, '1900-01-04'::date
WHERE NOT EXISTS (
  SELECT 1 FROM weeks WHERE id = '00000000-0000-0000-0000-000000000001'::uuid
)
AND NOT EXISTS (
  SELECT 1 FROM weeks WHERE week_ending = '1900-01-04'::date
);

-- If a week already exists for 1900-01-04 under another id, reuse it for the night FK.
INSERT INTO nights (
  id,
  week_id,
  night_date,
  day_name,
  day_num,
  page_num,
  status,
  is_locked
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  COALESCE(
    (SELECT id FROM weeks WHERE id = '00000000-0000-0000-0000-000000000001'::uuid),
    (SELECT id FROM weeks WHERE week_ending = '1900-01-04'::date LIMIT 1)
  ),
  '1900-01-01'::date,
  'AUDIT',
  0,
  0,
  'draft',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM nights WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
)
AND COALESCE(
  (SELECT id FROM weeks WHERE id = '00000000-0000-0000-0000-000000000001'::uuid),
  (SELECT id FROM weeks WHERE week_ending = '1900-01-04'::date LIMIT 1)
) IS NOT NULL;

COMMIT;
