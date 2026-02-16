-- Enable UUID extension (still useful for data IDs)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (Just ONE row for 'me')
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY, -- 'me' or arbitrary string
    full_name TEXT,
    goal_mode TEXT DEFAULT 'fat_loss' CHECK (goal_mode IN ('fat_loss', 'muscle_gain')),
    
    -- Body Stats (Assets)
    weight NUMERIC(5,2),         
    muscle_mass NUMERIC(5,2),    
    fat_percentage NUMERIC(5,2), 
    estimated_1rm_squat NUMERIC, 
    estimated_1rm_bench NUMERIC, 
    estimated_1rm_dead NUMERIC,  
    
    -- Game Stats (Evolution)
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    last_workout_date DATE,

    -- Telegram (optional)
    telegram_chat_id TEXT,
    telegram_remind_enabled BOOLEAN DEFAULT FALSE,
    telegram_remind_time TEXT DEFAULT '21:00',
    telegram_timezone TEXT DEFAULT 'Asia/Seoul',
    telegram_last_reminded_date DATE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Routines Table
CREATE TABLE IF NOT EXISTS public.routines (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,          
    description TEXT,
    exercises JSONB NOT NULL,    
    difficulty_level INTEGER DEFAULT 1,
    
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Workouts Table
CREATE TABLE IF NOT EXISTS public.workouts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    routine_id UUID REFERENCES public.routines(id), 
    
    workout_date DATE DEFAULT CURRENT_DATE,
    
    title TEXT,                  
    total_volume NUMERIC,        
    average_rpe NUMERIC,         
    duration_minutes INTEGER,
    estimated_calories NUMERIC,
    cardio_distance_km NUMERIC,
    cardio_avg_speed_kph NUMERIC,
    cardio_avg_incline_pct NUMERIC,
    avg_heart_rate INTEGER,
    
    logs JSONB,                  
    
    feedback TEXT,               
    mood TEXT,                   
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Daily conditions (sleep/fatigue/stress for personalization)
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

-- 5. Advice logs (for audit and tuning)
CREATE TABLE IF NOT EXISTS public.advice_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id TEXT REFERENCES public.users(id) ON DELETE CASCADE,
    event_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source TEXT NOT NULL, -- briefing, weekly_report, manual
    mode TEXT,
    advice_json JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Initial Data Seed (The 'me' user)
INSERT INTO public.users (id, full_name, level, xp)
VALUES ('me', 'Iron Quant', 1, 0)
ON CONFLICT (id) DO NOTHING;
