import { createClient } from '@supabase/supabase-js';

// Hardcoded Key for Single Player Mode (Read/Write)
// In a real multi-user app, we would only use the Anon Key here.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const isValidUrl = (url: string | undefined) => {
    if (!url) return false;
    try { return Boolean(new URL(url)); } catch { return false; }
};

export const supabase = isValidUrl(supabaseUrl) && supabaseKey
    ? createClient(supabaseUrl as string, supabaseKey as string)
    : createClient('https://placeholder.supabase.co', 'placeholder-key');

export const isSupabaseConfigured = isValidUrl(supabaseUrl) && !!supabaseKey;

// The One and Only User ID
// The One and Only User ID (Fixed UUID for Single Player)
export const MY_ID = '00000000-0000-0000-0000-000000000000';
