import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.APP_URL || "https://self-exercise.vercel.app";

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

async function sendMessage(chatId: string, text: string) {
  if (!BOT_TOKEN) return;

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [[{ text: "📱 앱에서 기록하기", url: APP_URL }]],
    },
  };

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((e) => {
    console.error("cron remind: telegram send failed", e);
  });
}

function dateInTz(timeZone: string): string {
  // en-CA yields YYYY-MM-DD
  return new Date().toLocaleDateString("en-CA", { timeZone });
}

export async function POST(req: Request) {
  const requestId = newRequestId();

  const auth = requireCronAuth(req);
  if (!auth.ok) {
    const res = NextResponse.json({ error: auth.error }, { status: auth.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`cron:remind:${getClientKey(req)}`, 60, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const supabase = getSupabaseAdmin();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "telegram_chat_id, telegram_remind_enabled, telegram_remind_time, telegram_timezone, telegram_last_reminded_date, full_name",
    )
    .eq("id", SINGLE_PLAYER_ID)
    .single();
  if (userError) {
    const res = NextResponse.json({ error: userError.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const chatId = user?.telegram_chat_id ?? null;
  const enabled = Boolean(user?.telegram_remind_enabled);
  const time = (user?.telegram_remind_time ?? "21:00").trim();
  const timeZone = (user?.telegram_timezone ?? "Asia/Seoul").trim() || "Asia/Seoul";
  const name = user?.full_name ?? "Iron Quant";

  if (!BOT_TOKEN) {
    const res = NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }
  if (!chatId) {
    const res = NextResponse.json({ ok: true, skipped: "no_chat_id" });
    res.headers.set("x-request-id", requestId);
    return res;
  }
  if (!enabled) {
    const res = NextResponse.json({ ok: true, skipped: "disabled" });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  // If you schedule the cron exactly at remind_time, this is enough.
  // But we also double-check within a 10-minute window to be resilient.
  const now = new Date();
  const hhmm = now.toLocaleTimeString("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" });
  const [h0, m0] = hhmm.split(":").map((v) => Number(v));
  const [h1, m1] = time.split(":").map((v) => Number(v));
  const delta = Math.abs((h0 * 60 + m0) - (h1 * 60 + m1));
  if (!Number.isFinite(delta) || delta > 10) {
    const res = NextResponse.json({ ok: true, skipped: "outside_window", now: hhmm, target: time });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const today = dateInTz(timeZone);
  const lastReminded = user?.telegram_last_reminded_date ?? null;
  if (lastReminded === today) {
    const res = NextResponse.json({ ok: true, skipped: "already_reminded", date: today });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const { data: workouts, error: wError } = await supabase
    .from("workouts")
    .select("id")
    .eq("user_id", SINGLE_PLAYER_ID)
    .eq("workout_date", today)
    .limit(1);
  if (wError) {
    const res = NextResponse.json({ error: wError.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  if ((workouts ?? []).length > 0) {
    const res = NextResponse.json({ ok: true, skipped: "already_logged", date: today });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  await sendMessage(
    chatId,
    `⏰ *${name}* 오늘 운동 기록이 없습니다.\n\n예: \`스쿼트 100 5 5\`\n또는 앱에서 기록 버튼을 눌러주세요.`,
  );

  // Mark as reminded (best-effort). If DB isn't patched yet, this may fail.
  try {
    await supabase
      .from("users")
      .upsert({ id: SINGLE_PLAYER_ID, telegram_last_reminded_date: today }, { onConflict: "id" });
  } catch (e) {
    console.error("cron remind: failed to update telegram_last_reminded_date", e);
  }

  const res = NextResponse.json({ ok: true, sent: true, date: today });
  res.headers.set("x-request-id", requestId);
  return res;
}
