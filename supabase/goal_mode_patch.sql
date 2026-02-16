-- Goal mode patch (single-user)
-- Run this once on an existing DB.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS goal_mode TEXT;

UPDATE public.users
SET goal_mode = 'fat_loss'
WHERE goal_mode IS NULL;

ALTER TABLE public.users
  ALTER COLUMN goal_mode SET DEFAULT 'fat_loss';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_goal_mode_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_goal_mode_check
      CHECK (goal_mode IN ('fat_loss', 'muscle_gain'));
  END IF;
END
$$;
