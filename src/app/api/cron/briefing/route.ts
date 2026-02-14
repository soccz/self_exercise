import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { analyzePreMarket } from "@/lib/quant/coach";

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
            .select("telegram_chat_id, telegram_remind_enabled, telegram_timezone, full_name")
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

        // 5. Generate Briefing (Algo Analysis)
        const briefing = await analyzePreMarket(supabase, SINGLE_PLAYER_ID);

        if (!briefing) {
            return NextResponse.json({ requestId, ok: true, skipped: "no_analysis_data" });
        }

        // 6. Send Telegram Message
        const icon = briefing.trend === "Bullish" ? "📈" : briefing.trend === "Bearish" ? "📉" : "⚖";
        const msg = [
            `*🔔 Iron Quant 장전(Pre-Market) 브리핑*`,
            `기준: ${user.full_name ?? "Iron Quant"} 포트폴리오`,
            ``,
            `*${briefing.ticker} (Target)*`,
            `${icon} 추세: *${briefing.trend}*`,
            `종가: ${briefing.last_price}kg`,
            `목표가: *${briefing.target_price}kg*`,
            ``,
            `💬 *Analyst Note*:`,
            `${briefing.advice}`,
        ].join("\n");

        const sent = await sendMessage(user.telegram_chat_id, msg);
        if (!sent) {
            return NextResponse.json({ requestId, ok: false, error: "Telegram send failed" }, { status: 502 });
        }

        return NextResponse.json({ requestId, ok: true, sent: true, briefing });
    } catch (e: unknown) {
        console.error("cron briefing: unhandled error", e);
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ requestId, ok: false, error: "Unhandled error", detail: msg }, { status: 500 });
    }
}
