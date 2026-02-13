-- WARNING: This is for single-player/no-auth mode.
-- Anyone who can load your site can also read/write these tables.
-- If you want real protection, use Supabase Auth + RLS or Edge Functions for writes.

-- Allow anon/authenticated roles to use schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Allow basic read/write
GRANT SELECT, INSERT, UPDATE ON TABLE public.users TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.workouts TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.routines TO anon, authenticated;

-- If you enabled RLS manually, you must either disable it:
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.workouts DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.routines DISABLE ROW LEVEL SECURITY;
