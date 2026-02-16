import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { buildMonthlyTelegramReport } from "@/lib/reports/monthly";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_BASE_URL = "https://self-exercise.vercel.app";
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "live";
const APP_URL = `${APP_BASE_URL}/?v=${APP_VERSION}`;

function getClientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

function requireCronAuth(req: Request): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.APP_SECRET;
  if (!secret) return { ok: false, status: 500, error: "APP_SECRET not set" };
  const provided = req.headers.get("x-app-secret");
  if (!provided) return { ok: false, status: 401, error: "Missing x-app-secret" };
  if (provided !== secret) return { ok: false, status: 401, error: "Invalid secret" };
  return { ok: true };
}

async function sendMessage(chatId: string, text: string): Promise<boolean> {
  if (!BOT_TOKEN) return false;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "📱 앱 열기", url: APP_URL }]],
    },
  };

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("cron monthly: telegram send failed", res.status, detail);
      return false;
    }
    const j = (await res.json().catch(() => null)) as { ok?: unknown; description?: unknown } | null;
    if (j && j.ok === false) {
      console.error("cron monthly: telegram send failed", j.description);
      return false;
    }
    return true;
  } catch (e) {
    console.error("cron monthly: telegram send failed", e);
    return false;
  }
}

export async function POST(req: Request) {
  const requestId = newRequestId();

  try {
    const auth = requireCronAuth(req);
    if (!auth.ok) {
      const res = NextResponse.json({ requestId, ok: false, error: auth.error }, { status: auth.status });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const rl = rateLimit(`cron:monthly:${getClientKey(req)}`, 10, 60_000);
    if (!rl.ok) {
      const res = NextResponse.json({ requestId, ok: false, error: "Rate limited" }, { status: 429 });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    if (!BOT_TOKEN) {
      const res = NextResponse.json({ requestId, ok: false, error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("telegram_chat_id, telegram_timezone")
      .eq("id", SINGLE_PLAYER_ID)
      .single();

    if (userError || !user) {
      console.error("cron monthly: user error", userError);
      const res = NextResponse.json({ requestId, ok: false, error: userError?.message || "User not found" }, { status: 500 });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    if (!user.telegram_chat_id) {
      const res = NextResponse.json({ requestId, ok: true, skipped: "no_chat_id" });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const timeZone = (user.telegram_timezone ?? "Asia/Seoul").trim() || "Asia/Seoul";
    const report = await buildMonthlyTelegramReport(supabase, SINGLE_PLAYER_ID, timeZone);

    const sent = await sendMessage(user.telegram_chat_id, report.text);
    if (!sent) {
      const res = NextResponse.json({ requestId, ok: false, error: "Telegram send failed" }, { status: 502 });
      res.headers.set("x-request-id", requestId);
      return res;
    }

    const res = NextResponse.json({ requestId, ok: true, sent: true, range: report.meta });
    res.headers.set("x-request-id", requestId);
    return res;
  } catch (e: unknown) {
    console.error("cron monthly: unhandled error", e);
    const msg = e instanceof Error ? e.message : String(e);
    const res = NextResponse.json({ requestId, ok: false, error: "Unhandled error", detail: msg }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }
}
