-- Telegram reminder patch (single-user)
-- Run this in Supabase SQL Editor once.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_remind_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_remind_time TEXT DEFAULT '21:00';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_timezone TEXT DEFAULT 'Asia/Seoul';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_last_reminded_date DATE;
