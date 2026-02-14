
import { NextResponse } from "next/server";
import { requireAppSession } from "@/lib/server/app_lock";
import { newRequestId } from "@/lib/server/request_id";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const requestId = newRequestId();
  const session = requireAppSession(req);
  if (!session.ok) {
    const res = NextResponse.json({ requestId, ok: false, error: session.error }, { status: session.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const envVars = Object.keys(process.env).sort();
  const debugInfo = {
    requestId,
    ok: true,
    hasAppSecret: !!process.env.APP_SECRET,
    hasTelegramToken: !!process.env.TELEGRAM_BOT_TOKEN,
    hasSupabaseUrl: !!process.env.SUPABASE_URL,
    hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    envKeys: envVars, // List all keys to see if there's a typo
  };

  const res = NextResponse.json(debugInfo);
  res.headers.set("x-request-id", requestId);
  return res;
}
