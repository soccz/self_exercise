import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    const errors: string[] = [];
    const status: Record<string, any> = {};

    // 1. Env Check
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const APP_SECRET = process.env.APP_SECRET;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    status.env = {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
        APP_SECRET: !!APP_SECRET,
        BOT_TOKEN: !!BOT_TOKEN,
    };

    if (!SUPABASE_URL) errors.push("Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!APP_SECRET) errors.push("Missing APP_SECRET");
    if (!BOT_TOKEN) errors.push("Missing TELEGRAM_BOT_TOKEN");

    let user = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = getSupabaseAdmin();
            status.db_connected = true;

            const { data, error } = await supabase
                .from("users")
                .select("*")
                .eq("id", SINGLE_PLAYER_ID)
                .single();

            if (error) {
                errors.push(`DB Error: ${error.message} (Hint: Run SQL patch?)`);
                status.db_user_found = false;
            } else {
                status.db_user_found = true;
                user = data;

                // Check columns existence by checking keys in returned object
                // Note: if column is null it exists. If undefined, it might not exist or not selected.
                // We selected "*".
                if (!("telegram_chat_id" in data)) errors.push("Column telegram_chat_id missing");
                if (!("telegram_remind_enabled" in data)) errors.push("Column telegram_remind_enabled missing");
            }
        } catch (e: any) {
            errors.push(`DB Connection Failed: ${e.message}`);
            status.db_connected = false;
        }
    }

    return NextResponse.json({
        ok: errors.length === 0,
        errors,
        status,
        user_summary: user ? { id: (user as any).id, name: (user as any).full_name } : null
    }, { status: errors.length ? 500 : 200 });
}
