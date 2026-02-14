
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
    const envVars = Object.keys(process.env).sort();
    const debugInfo = {
        hasAppSecret: !!process.env.APP_SECRET,
        hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        envKeys: envVars, // List all keys to see if there's a typo
    };

    return NextResponse.json(debugInfo);
}
