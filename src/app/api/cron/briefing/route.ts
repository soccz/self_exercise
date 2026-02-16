import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { estimateWorkoutCalories } from "@/lib/quant/engine";
import { consultCouncil } from "@/lib/quant/ensemble";
import type { CouncilCondition, CouncilWorkout } from "@/lib/quant/types";
import type { Json } from "@/lib/supabase_database";

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
            .select("telegram_chat_id, telegram_remind_enabled, telegram_timezone, full_name, goal_mode, weight, current_streak")
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

        // 5. Generate Briefing (mode-aware council)
        const safeName = escapeTelegramMarkdown(user.full_name ?? "Iron Quant");
        const historyStart = addDays(today, -27);
        const weekStart = addDays(today, -6);
        const [{ data: rows, error: wErr }, { data: conditions, error: cErr }] = await Promise.all([
            supabase
                .from("workouts")
                .select("workout_date, total_volume, average_rpe, duration_minutes, estimated_calories, cardio_distance_km, logs")
                .eq("user_id", SINGLE_PLAYER_ID)
                .gte("workout_date", historyStart)
                .lte("workout_date", today)
                .order("workout_date", { ascending: true }),
            supabase
                .from("daily_conditions")
                .select("condition_date, sleep_hours, fatigue_score, stress_score, soreness_score, resting_hr")
                .eq("user_id", SINGLE_PLAYER_ID)
                .gte("condition_date", addDays(today, -13))
                .lte("condition_date", today)
                .order("condition_date", { ascending: true }),
        ]);

        if (wErr) {
            console.error("cron briefing: workout query failed", wErr);
            return NextResponse.json({ requestId, ok: false, error: wErr.message }, { status: 500 });
        }

        const safeConditions = cErr
            ? (cErr.message.includes("daily_conditions") && cErr.message.includes("does not exist") ? [] : [])
            : (conditions ?? []);
        const userWeight = Number(user.weight) || 75;
        const streak = Number(user.current_streak) || 0;
        const workoutRows = rows ?? [];
        const weekRows = workoutRows.filter((w) => (w.workout_date ?? "") >= weekStart);
        const weekMinutes = weekRows.reduce((acc, w) => acc + (Number(w.duration_minutes) || 0), 0);
        const weekDistance = weekRows.reduce((acc, w) => acc + (Number(w.cardio_distance_km) || 0), 0);
        const weekCalories = weekRows.reduce((acc, w) => (
            acc + ((Number(w.estimated_calories) || 0) > 0
                ? (Number(w.estimated_calories) || 0)
                : estimateWorkoutCalories(userWeight, Number(w.duration_minutes) || 0, Number(w.average_rpe) || 6, w.logs))
        ), 0);
        const weekVolume = weekRows.reduce((acc, w) => acc + (Number(w.total_volume) || 0), 0);
        const weekAvgRpe = (() => {
            const vals = weekRows.map((w) => Number(w.average_rpe) || 0).filter((v) => v > 0);
            if (vals.length === 0) return 0;
            return vals.reduce((a, b) => a + b, 0) / vals.length;
        })();

        const council = consultCouncil({
            now: new Date(`${today}T00:00:00Z`),
            user: {
                id: SINGLE_PLAYER_ID,
                mode: goalMode,
                weight: userWeight,
                current_streak: streak,
            },
            workouts: workoutRows.map((w) => ({
                workout_date: w.workout_date ?? today,
                total_volume: Number(w.total_volume) || 0,
                average_rpe: Number(w.average_rpe) || 0,
                duration_minutes: Number(w.duration_minutes) || 0,
                estimated_calories: Number(w.estimated_calories) || 0,
                cardio_distance_km: Number(w.cardio_distance_km) || 0,
            })) as CouncilWorkout[],
            conditions: safeConditions.map((c) => ({
                condition_date: c.condition_date,
                sleep_hours: Number(c.sleep_hours) || undefined,
                fatigue_score: c.fatigue_score ?? undefined,
                stress_score: c.stress_score ?? undefined,
                soreness_score: c.soreness_score ?? undefined,
                resting_hr: c.resting_hr ?? undefined,
            })) as CouncilCondition[],
        });

        if (council.top.length === 0 || !council.primary) {
            return NextResponse.json({ requestId, ok: true, skipped: "no_analysis_data" });
        }

        const agentLabel = (agent: string) => agent === "analyst" ? "Analyst" : agent === "physio" ? "Physio" : "Psych";
        const lines: string[] = [];
        lines.push(goalMode === "fat_loss" ? "*🔔 Iron Quant Council 브리핑 (감량)*" : "*🔔 Iron Quant Council 브리핑 (근육)*");
        lines.push(`기준: ${safeName}`);
        lines.push("");
        if (goalMode === "fat_loss") {
            lines.push(`- 최근 7일 유산소: *${Math.round(weekMinutes)}분* / 150분`);
            lines.push(`- 최근 7일 이동거리: *${weekDistance.toFixed(1)}km*`);
            lines.push(`- 최근 7일 추정 소모: *${Math.round(weekCalories).toLocaleString()} kcal*`);
        } else {
            lines.push(`- 최근 7일 총 볼륨: *${Math.round(weekVolume).toLocaleString()}kg*`);
            lines.push(`- 최근 7일 세션: *${weekRows.length}회*`);
            if (weekAvgRpe > 0) lines.push(`- 최근 평균 RPE: *${weekAvgRpe.toFixed(1)}*`);
        }
        lines.push("");
        lines.push(`*최우선 액션*: ${council.primary.action}`);
        if (council.primary.reason.length > 0) lines.push(`근거: ${council.primary.reason[0]}`);
        lines.push("");
        lines.push("*Council Minutes*");
        for (const advice of council.top.slice(0, 3)) {
            lines.push(`- [${agentLabel(advice.agent)}] ${advice.headline}`);
        }

        const msg = lines.join("\n");

        // Non-fatal audit log
        const { error: logErr } = await supabase
            .from("advice_logs")
            .insert({
                user_id: SINGLE_PLAYER_ID,
                event_date: today,
                source: "briefing",
                mode: goalMode,
                advice_json: council.top as unknown as Json,
            });
        if (logErr && !logErr.message.includes("advice_logs")) {
            console.error("cron briefing: advice log failed", logErr);
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
