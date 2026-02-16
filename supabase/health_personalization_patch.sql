-- Health personalization patch (single-user)
-- Run once on existing DB.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS estimated_calories NUMERIC;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS cardio_distance_km NUMERIC;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS cardio_avg_speed_kph NUMERIC;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS cardio_avg_incline_pct NUMERIC;

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS avg_heart_rate INTEGER;

CREATE TABLE IF NOT EXISTS public.daily_conditions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  condition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  sleep_hours NUMERIC(4,2),
  fatigue_score INTEGER CHECK (fatigue_score BETWEEN 1 AND 10),
  stress_score INTEGER CHECK (stress_score BETWEEN 1 AND 10),
  soreness_score INTEGER CHECK (soreness_score BETWEEN 1 AND 10),
  resting_hr INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(user_id, condition_date)
);

CREATE TABLE IF NOT EXISTS public.advice_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT NOT NULL,
  mode TEXT,
  advice_json JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
