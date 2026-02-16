import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import type { Database } from "@/lib/supabase_database";
import { requireAppSession } from "@/lib/server/app_lock";
import { newRequestId } from "@/lib/server/request_id";

export const dynamic = 'force-dynamic';

function errorMessage(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

export async function GET(req: Request) {
    const requestId = newRequestId();
    const session = requireAppSession(req);
    if (!session.ok) {
        const res = NextResponse.json({ requestId, ok: false, error: session.error }, { status: session.status });
        res.headers.set("x-request-id", requestId);
        return res;
    }

    const errors: string[] = [];
    const status: Record<string, unknown> = {};

    // 1. Env Check
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const APP_SECRET = process.env.APP_SECRET;
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const BUILD_SHA = process.env.VERCEL_GIT_COMMIT_SHA || null;
    const BUILD_SHORT = BUILD_SHA ? BUILD_SHA.slice(0, 7) : null;
    const APP_URL = process.env.APP_URL || null;

    status.env = {
        SUPABASE_URL: !!SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!SUPABASE_SERVICE_ROLE_KEY,
        APP_SECRET: !!APP_SECRET,
        BOT_TOKEN: !!BOT_TOKEN,
        BUILD_SHA,
        BUILD_SHORT,
        APP_URL,
    };

    if (!SUPABASE_URL) errors.push("Missing SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) errors.push("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!APP_SECRET) errors.push("Missing APP_SECRET");
    if (!BOT_TOKEN) errors.push("Missing TELEGRAM_BOT_TOKEN");

    let user: Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "full_name"> | null = null;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = getSupabaseAdmin();
            status.db_connected = true;

            const { data, error } = await supabase
                .from("users")
                .select("id, full_name, telegram_chat_id, telegram_remind_enabled, telegram_last_reminded_date, telegram_timezone, telegram_remind_time")
                .eq("id", SINGLE_PLAYER_ID)
                .single();

            if (error) {
                errors.push(`DB Error: ${error.message} (Hint: Run SQL patch?)`);
                status.db_user_found = false;
            } else {
                status.db_user_found = true;
                user = data;
            }
        } catch (e: unknown) {
            errors.push(`DB Connection Failed: ${errorMessage(e)}`);
            status.db_connected = false;
        }
    }

    const res = NextResponse.json({
        requestId,
        ok: errors.length === 0,
        errors,
        status,
        user_summary: user ? { id: user.id, name: user.full_name } : null
    }, { status: errors.length ? 500 : 200 });
    res.headers.set("x-request-id", requestId);
    return res;
}
