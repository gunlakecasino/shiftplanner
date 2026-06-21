-- Per-task typography + inline span formatting for Tasks Pad
ALTER TABLE public.night_slot_tasks
ADD COLUMN IF NOT EXISTS text_style jsonb;

COMMENT ON COLUMN public.night_slot_tasks.text_style IS
  'Task typography: fontSizePx, fontWeight, fontStyle, textDecoration, spans[{start,end,bold,italic,underline,strike,color}]';