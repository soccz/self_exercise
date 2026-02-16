import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { analyzePreMarket } from "@/lib/quant/coach";
import { calculateCalories } from "@/lib/quant/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_BASE_URL = "https://self-exercise.vercel.app";
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "live";
const APP_URL = `${APP_BASE_URL}/?v=${APP_VERSION}`;

function escapeTelegramMarkdown(text: string): string {
    // parse_mode: "Markdown" (legacy). Escape the few special characters it supports.
    return text.replace(/([\\_*`\[\]])/g, "\\$1");
}

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
            console.error("cron briefing: telegram send failed", res.status, detail);
            return false;
        }
        const j = (await res.json().catch(() => null)) as { ok?: unknown; description?: unknown } | null;
        if (j && j.ok === false) {
            console.error("cron briefing: telegram send failed", j.description);
            return false;
        }
        return true;
    } catch (e) {
        console.error("cron briefing: telegram send failed", e);
        return false;
    }
}

function dateInTz(timeZone: string): string {
    return new Date().toLocaleDateString("en-CA", { timeZone });
}

function addDays(ymd: string, days: number): string {
    const t = Date.parse(`${ymd}T00:00:00Z`);
    const d = new Date(t + days * 24 * 60 * 60 * 1000);
    return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
    const requestId = newRequestId();

    try {
        // 1. Auth Check (Security)
        const auth = requireCronAuth(req);
        if (!auth.ok) {
            return NextResponse.json({ requestId, ok: false, error: auth.error }, { status: auth.status });
        }

        // 2. Rate Limit
        const rl = rateLimit(`cron:briefing:${getClientKey(req)}`, 60, 60_000);
        if (!rl.ok) {
            return NextResponse.json({ requestId, ok: false, error: "Rate limited" }, { status: 429 });
        }

        if (!BOT_TOKEN) {
            return NextResponse.json({ requestId, ok: false, error: "TELEGRAM_BOT_TOKEN not set" }, { status: 500 });
        }

        const supabase = getSupabaseAdmin();

        // 3. User Check & Config
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("telegram_chat_id, telegram_remind_enabled, telegram_timezone, full_name, goal_mode, weight")
            .eq("id", SINGLE_PLAYER_ID)
            .single();

        if (userError || !user) {
            console.error("cron briefing: user error", userError);
            return NextResponse.json({ requestId, ok: false, error: userError?.message || "User not found" }, { status: 500 });
        }

        if (!user.telegram_chat_id || !user.telegram_remind_enabled) {
            return NextResponse.json({ requestId, ok: true, skipped: "disabled_or_no_chat" });
        }

        const timeZone = user.telegram_timezone || "Asia/Seoul";
        const goalMode = user.goal_mode === "muscle_gain" ? "muscle_gain" : "fat_loss";
        const today = dateInTz(timeZone);

        // 4. Check if already logged today?
        // If user already logged a workout, maybe skip the "Pre-Market" briefing.
        const { count } = await supabase
            .from("workouts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", SINGLE_PLAYER_ID)
            .eq("workout_date", today);

        if (count && count > 0) {
            return NextResponse.json({ requestId, ok: true, skipped: "already_logged" });
        }

        // 5. Generate Briefing (mode-aware)
        const safeName = escapeTelegramMarkdown(user.full_name ?? "Iron Quant");
        const msg = await (async (): Promise<string | null> => {
            if (goalMode === "fat_loss") {
                const start = addDays(today, -6);
                const { data: rows, error: wErr } = await supabase
                    .from("workouts")
                    .select("duration_minutes, average_rpe")
                    .eq("user_id", SINGLE_PLAYER_ID)
                    .gte("workout_date", start)
                    .lte("workout_date", today);

                if (wErr) {
                    console.error("cron briefing: fat mode workout query failed", wErr);
                    return null;
                }

                const workouts = rows ?? [];
                const minutes = workouts.reduce((acc, w) => acc + (Number(w.duration_minutes) || 0), 0);
                const calories = workouts.reduce(
                    (acc, w) => acc + calculateCalories(Number(user.weight) || 75, Number(w.duration_minutes) || 0, Number(w.average_rpe) || 6),
                    0,
                );
                const remain = Math.max(0, 150 - Math.round(minutes));
                const nextAction = remain > 0
                    ? `오늘 *${Math.min(30, remain)}분*만 걸으면 주간 목표에 더 가까워집니다.`
                    : "오늘은 20분 회복 유산소로 흐름만 유지하세요.";

                return [
                    `*🔔 Iron Quant 감량 브리핑*`,
                    `기준: ${safeName}`,
                    ``,
                    `- 최근 7일 유산소: *${Math.round(minutes)}분* / 150분`,
                    `- 최근 7일 추정 소모: *${Math.round(calories).toLocaleString()} kcal*`,
                    ``,
                    `💬 *오늘 액션*: ${nextAction}`,
                ].join("\n");
            }

            const briefing = await analyzePreMarket(supabase, SINGLE_PLAYER_ID);
            if (!briefing) return null;

            const icon = briefing.trend === "Bullish" ? "📈" : briefing.trend === "Bearish" ? "📉" : "⚖";
            return [
                `*🔔 Iron Quant 근육 브리핑*`,
                `기준: ${safeName}`,
                ``,
                `*${briefing.ticker} (Target)*`,
                `${icon} 추세: *${briefing.trend}*`,
                `종가: ${briefing.last_price}kg`,
                `목표가: *${briefing.target_price}kg*`,
                ``,
                `💬 *Analyst Note*:`,
                `${briefing.advice}`,
            ].join("\n");
        })();

        if (!msg) {
            return NextResponse.json({ requestId, ok: true, skipped: "no_analysis_data" });
        }

        const sent = await sendMessage(user.telegram_chat_id, msg);
        if (!sent) {
            return NextResponse.json({ requestId, ok: false, error: "Telegram send failed" }, { status: 502 });
        }

        return NextResponse.json({ requestId, ok: true, sent: true, mode: goalMode });
    } catch (e: unknown) {
        console.error("cron briefing: unhandled error", e);
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ requestId, ok: false, error: "Unhandled error", detail: msg }, { status: 500 });
    }
}
