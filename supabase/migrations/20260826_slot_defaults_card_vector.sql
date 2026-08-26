-- Standing card VECTORS live on the slot (slot_defaults), not the TM.
-- Exactly three values. NULL = no mark. Survives TM reassignment.

ALTER TABLE public.slot_defaults
  ADD COLUMN IF NOT EXISTS card_vector text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'slot_defaults_card_vector_check'
  ) THEN
    ALTER TABLE public.slot_defaults
      ADD CONSTRAINT slot_defaults_card_vector_check
      CHECK (
        card_vector IS NULL
        OR card_vector IN ('sweep_9_10_sr', 'sweep_5_8_hl', 'laundry')
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.slot_defaults.card_vector IS
  'Card-level vector mark (sweep_9_10_sr | sweep_5_8_hl | laundry). Standing slot identity, not a TM attribute.';
