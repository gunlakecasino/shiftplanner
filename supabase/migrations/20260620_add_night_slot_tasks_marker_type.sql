-- Add marker_type column to support per-task text markers (underline, circle, etc.)
-- in the TaskTextEditPad. Existing rows default to NULL which is treated as 'highlight'
-- in the UI (backwards compatible).

ALTER TABLE public.night_slot_tasks
ADD COLUMN IF NOT EXISTS marker_type text;

COMMENT ON COLUMN public.night_slot_tasks.marker_type IS 
'Per-task marker style for label rendering: "highlight" (default bg+left border), "underline", "circle", "none". NULL treated as highlight for backwards compat.';

-- Optional backfill if desired (uncomment to normalize all existing tasks):
-- UPDATE public.night_slot_tasks SET marker_type = 'highlight' WHERE marker_type IS NULL;
