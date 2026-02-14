import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseWorkoutText, analyzePortfolio } from '@/lib/quant/engine';
import { analyzeMarketCondition } from '@/lib/quant/coach';
import { getMarketPosition, getGhostReplay } from '@/lib/quant/market';
import { buildWeeklyTelegramReport } from "@/lib/reports/weekly";
import { buildMonthlyTelegramReport } from "@/lib/reports/monthly";
import type { Database, Json } from "@/lib/supabase_database";
import type { ExerciseLog, Workout } from "@/lib/data/types";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { applyBig3Prs, estimateBig3FromLogs, recomputeBig3Prs } from "@/lib/server/prs";

// Telegram Bot Token (from env)
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || "https://self-exercise.vercel.app";

// Hardcoded User ID for single-player mode
const MY_ID = 'me';

// Use server-only key for Telegram writes to avoid client-side RLS issues.
// Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabaseAdmin() {
    if (!SUPABASE_URL) return null;
    if (!SUPABASE_SERVICE_ROLE_KEY) return null;
    return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];

function getSupabaseRefFromUrl(url: string) {
    try {
        const { hostname } = new URL(url);
        const subdomain = hostname.split(".")[0] ?? "unknown";
        return subdomain;
    } catch {
        return "unknown";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isExerciseLog(value: unknown): value is ExerciseLog {
    if (!isRecord(value)) return false;
    return (
        typeof value["name"] === "string" &&
        typeof value["sets"] === "number" &&
        typeof value["reps"] === "number" &&
        typeof value["weight"] === "number"
    );
}

function parseExerciseLogs(value: unknown): ExerciseLog[] {
    if (!Array.isArray(value)) return [];
    return value.filter(isExerciseLog);
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
}

function mapWorkoutRow(row: WorkoutRow): Workout {
    return {
        id: row.id,
        user_id: row.user_id ?? MY_ID,
        workout_date: row.workout_date ?? new Date().toISOString().split("T")[0],
        title: row.title ?? "",
        total_volume: toNumber(row.total_volume),
        average_rpe: toNumber(row.average_rpe),
        duration_minutes: row.duration_minutes ?? 0,
        logs: parseExerciseLogs(row.logs),
        feedback: row.feedback ?? undefined,
        mood: row.mood ?? undefined,
    };
}

async function ensureUserRow(supabaseAdmin: SupabaseClient<Database>) {
    const { error } = await supabaseAdmin
        .from("users")
        .upsert({ id: MY_ID }, { onConflict: "id" });
    if (error) {
        console.error("Failed to ensure users row:", error);
    }
}

async function linkTelegramChat(supabaseAdmin: SupabaseClient<Database>, chatId: string) {
    // Optional columns; if the DB wasn't patched yet, ignore errors.
    const { error } = await supabaseAdmin
        .from("users")
        .upsert({ id: MY_ID, telegram_chat_id: chatId }, { onConflict: "id" });
    if (error) {
        console.error("Failed to link telegram_chat_id (run supabase/telegram_reminder_patch.sql):", error);
    }
}

async function sendMessage(chatId: string, text: string, showButton: boolean = false) {
    if (!BOT_TOKEN) return;

    const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'Markdown' };
    if (showButton) {
        body["reply_markup"] = {
            inline_keyboard: [[
                { text: "📱 앱에서 보기", url: APP_URL }
            ]]
        };
    }

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
    } catch (e) {
        console.error("Failed to send telegram message", e);
    }
}

async function sendDocument(chatId: string, filename: string, contentType: string, content: string) {
    if (!BOT_TOKEN) return;
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("document", new Blob([content], { type: contentType }), filename);

    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: "POST",
            body: form,
        });
    } catch (e) {
        console.error("Failed to send telegram document", e);
    }
}

function helpText(): string {
    return [
        "*Iron Quant 도움말*",
        "",
        "*기록하기*",
        "- `스쿼트 100 5 5` (종목 무게 횟수 세트)",
        "",
        "*명령어*",
        "- `/status` 또는 `자산`: 자산 리포트",
        "- `/rec` 또는 `추천`: 최근 로그 기반 추천",
        "- `/name 홍길동`: 이름 변경",
        "- `/last`: 마지막 운동 확인",
        "- `/undo`: 방금 기록한 운동 되돌리기(최근 30분만)",
        "- `/edit 스쿼트 105 5 5`: 방금 기록 수정(최근 30분만)",
        "- `/export csv|json`: 데이터 내보내기",
        "- `/week` 또는 `주간`: 주간 리포트",
        "- `/month` 또는 `월간`: 월간 리포트(지난달)",
        "- `/recompute`: 1RM(3대) 재계산",
        "- `/remind`: 리마인더 설정(상태/ON/OFF/시간/타임존)",
        "- `/remind test`: 리마인더 테스트(즉시 1회)",
        "- `/debug`: 연결 상태 점검",
        "",
        "팁: 웹에서도 기록/수정이 가능합니다.",
    ].join("\n");
}

function minutesAgo(iso: string): number | null {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return null;
    return (Date.now() - t) / 60000;
}

export async function POST(req: NextRequest) {
    const requestId = newRequestId();
    const json = (body: unknown, init?: { status?: number }) => {
        const res = NextResponse.json(body, init);
        res.headers.set("x-request-id", requestId);
        return res;
    };

    if (!BOT_TOKEN) {
        console.error("TELEGRAM_BOT_TOKEN is not set");
        return json({ error: "Config missing" }, { status: 500 });
    }
    if (WEBHOOK_SECRET) {
        const provided = req.headers.get("x-telegram-bot-api-secret-token");
        if (provided !== WEBHOOK_SECRET) {
            return json({ error: "Unauthorized" }, { status: 401 });
        }
    }

    try {
        const supabaseAdmin = getSupabaseAdmin();
        if (!supabaseAdmin) {
            console.error("Supabase admin env missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
            return json({ error: "Supabase admin not configured" }, { status: 500 });
        }

        const body = await req.json();
        const message = body.message;

        if (!message || !message.text) {
            return json({ ok: true }); // Ignore non-text updates
        }

        const chatId = String(message.chat.id);
        const text: string = message.text.trim();

        const rl = rateLimit(`telegram:${chatId}`, 30, 60_000);
        if (!rl.ok) {
            // For Telegram webhooks, always return 200 to avoid retries.
            return json({ ok: true });
        }

        await ensureUserRow(supabaseAdmin);
        await linkTelegramChat(supabaseAdmin, chatId);

        // Help: /help, /start
        if (text === "/help" || text === "/start" || text === "/commands" || text === "help" || text === "도움말" || text === "?") {
            await sendMessage(chatId, helpText(), true);
            return json({ ok: true });
        }

        // 0. Debug: /debug
        if (text === "/debug") {
            const ref = SUPABASE_URL ? getSupabaseRefFromUrl(SUPABASE_URL) : "missing";
            const { count: workoutsCount } = await supabaseAdmin
                .from("workouts")
                .select("id", { count: "exact", head: true })
                .eq("user_id", MY_ID);
            const { data: user } = await supabaseAdmin
                .from("users")
                .select("id, full_name")
                .eq("id", MY_ID)
                .single();

            const report = [
                "*Iron Quant Debug*",
                `- Supabase ref: \`${ref}\``,
                `- user: \`${user?.id ?? "none"}\` / \`${user?.full_name ?? "none"}\``,
                `- workouts(me): \`${workoutsCount ?? 0}\``,
            ].join("\n");

            await sendMessage(chatId, report, true);
            return json({ ok: true });
        }

        // 0.5 Recompute PRs: /recompute
        if (text === "/recompute") {
            try {
                await recomputeBig3Prs(supabaseAdmin, MY_ID);
                await sendMessage(chatId, "✅ 1RM(3대) 재계산 완료", true);
            } catch (e) {
                console.error("PR recompute failed:", e);
                await sendMessage(chatId, "❌ 재계산 실패 (로그 확인)");
            }
            return json({ ok: true });
        }

        // Reminder settings: /remind on|off|time HH:MM|tz Area/City|status
        if (text === "/remind" || text.startsWith("/remind ")) {
            const arg = text.replace(/^\/remind\s*/, "").trim();

            if (!arg || arg === "status") {
                const { data: user, error } = await supabaseAdmin
                    .from("users")
                    .select("telegram_chat_id, telegram_remind_enabled, telegram_remind_time, telegram_timezone")
                    .eq("id", MY_ID)
                    .single();
                if (error) {
                    await sendMessage(chatId, `❌ 조회 실패: ${error.message}`);
                    return json({ ok: true });
                }
                const enabled = Boolean(user?.telegram_remind_enabled);
                const time = user?.telegram_remind_time ?? "21:00";
                const tz = user?.telegram_timezone ?? "Asia/Seoul";
                const linked = user?.telegram_chat_id ? "linked" : "not linked";
                await sendMessage(chatId, `*리마인더 상태*\n- chat: \`${linked}\`\n- enabled: \`${enabled}\`\n- time: \`${time}\`\n- tz: \`${tz}\`\n\n설정: \`/remind on\`, \`/remind off\`, \`/remind time 21:00\`, \`/remind tz Asia/Seoul\``, true);
                return json({ ok: true });
            }

            if (arg === "test") {
                const { data: user } = await supabaseAdmin
                    .from("users")
                    .select("telegram_remind_enabled, telegram_remind_time, telegram_timezone")
                    .eq("id", MY_ID)
                    .single();
                const enabled = Boolean(user?.telegram_remind_enabled);
                const time = user?.telegram_remind_time ?? "21:00";
                const tz = user?.telegram_timezone ?? "Asia/Seoul";
                await sendMessage(chatId, `✅ 리마인더 테스트\n- enabled: \`${enabled}\`\n- time: \`${time}\`\n- tz: \`${tz}\`\n\n오늘 기록이 없으면 설정된 시간에 알림이 갑니다.`, true);
                return json({ ok: true });
            }

            if (arg === "on" || arg === "off") {
                const { error } = await supabaseAdmin
                    .from("users")
                    .upsert({ id: MY_ID, telegram_remind_enabled: arg === "on" }, { onConflict: "id" });
                if (error) {
                    await sendMessage(chatId, `❌ 설정 실패: ${error.message}\n(먼저 supabase/telegram_reminder_patch.sql 실행 필요)`);
                } else {
                    await sendMessage(chatId, `✅ 리마인더: ${arg === "on" ? "ON" : "OFF"}`, true);
                }
                return json({ ok: true });
            }

            if (arg.startsWith("time ")) {
                const time = arg.replace(/^time\s+/, "").trim();
                if (!/^\d{2}:\d{2}$/.test(time)) {
                    await sendMessage(chatId, "사용법: `/remind time 21:00`");
                    return json({ ok: true });
                }
                const [hh, mm] = time.split(":").map((v) => Number(v));
                if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
                    await sendMessage(chatId, "시간 형식이 올바르지 않습니다. 예: `21:00`");
                    return json({ ok: true });
                }
                const { error } = await supabaseAdmin
                    .from("users")
                    .upsert({ id: MY_ID, telegram_remind_time: time }, { onConflict: "id" });
                if (error) {
                    await sendMessage(chatId, `❌ 설정 실패: ${error.message}\n(먼저 supabase/telegram_reminder_patch.sql 실행 필요)`);
                } else {
                    await sendMessage(chatId, `✅ 리마인더 시간: ${time}`, true);
                }
                return json({ ok: true });
            }

            if (arg.startsWith("tz ")) {
                const tz = arg.replace(/^tz\s+/, "").trim();
                if (!tz) {
                    await sendMessage(chatId, "사용법: `/remind tz Asia/Seoul`");
                    return json({ ok: true });
                }
                // We can't reliably validate IANA tz without extra deps; store as-is.
                const { error } = await supabaseAdmin
                    .from("users")
                    .upsert({ id: MY_ID, telegram_timezone: tz }, { onConflict: "id" });
                if (error) {
                    await sendMessage(chatId, `❌ 설정 실패: ${error.message}\n(먼저 supabase/telegram_reminder_patch.sql 실행 필요)`);
                } else {
                    await sendMessage(chatId, `✅ 타임존: ${tz}`, true);
                }
                return json({ ok: true });
            }

            await sendMessage(chatId, "사용법: `/remind status|on|off|time 21:00|tz Asia/Seoul`");
            return json({ ok: true });
        }

        // 0. Command: /name <new name>
        if (text.startsWith("/name ")) {
            const newName = text.replace(/^\/name\s+/, "").trim();
            if (!newName) {
                await sendMessage(chatId, "사용법: `/name 홍길동`");
                return json({ ok: true });
            }
            const { error } = await supabaseAdmin
                .from("users")
                .upsert({ id: MY_ID, full_name: newName }, { onConflict: "id" });
            if (error) {
                console.error("Name update error:", error);
                await sendMessage(chatId, `❌ 이름 변경 실패: ${error.message}`);
            } else {
                await sendMessage(chatId, `✅ 이름 변경: ${newName}`, true);
            }
            return json({ ok: true });
        }

        // 0.1 Command: /set <key> <value>
        // Keys: weight(몸무게), muscle(골격근), fat(체지방)
        if (text.startsWith("/set ")) {
            const parts = text.replace(/^\/set\s+/, "").trim().split(/\s+/);
            if (parts.length < 2) {
                await sendMessage(chatId, "사용법: `/set weight 75` 또는 `/set muscle 35`");
                return json({ ok: true });
            }
            const key = parts[0].toLowerCase();
            const val = parseFloat(parts[1]);

            if (isNaN(val)) {
                await sendMessage(chatId, "❌ 숫자를 입력해주세요.");
                return json({ ok: true });
            }

            const updatePayload: UserInsert = { id: MY_ID };
            let label = "";
            let storedValue = val;

            if (key === "weight" || key === "몸무게" || key === "체중") {
                updatePayload.weight = val;
                label = "체중";
            } else if (key === "muscle" || key === "골격근" || key === "골격근량" || key === "muscle_mass") {
                updatePayload.muscle_mass = val;
                label = "골격근량";
            } else if (key === "fat" || key === "체지방" || key === "체지방률" || key === "fat_percentage") {
                storedValue = val;
                if (val > 0 && val < 1) storedValue = val * 100; // Handle 0.15 as 15%
                updatePayload.fat_percentage = storedValue;
                label = "체지방률";
            } else {
                await sendMessage(chatId, "지원하는 항목: weight, muscle, fat");
                return json({ ok: true });
            }

            const { error } = await supabaseAdmin.from("users").upsert(updatePayload, { onConflict: "id" });

            if (error) {
                await sendMessage(chatId, `❌ 변경 실패: ${error.message}`);
            } else {
                await sendMessage(chatId, `✅ ${label} 업데이트: ${storedValue}`, true);
            }
            return json({ ok: true });
        }

        // 1. Command: /status
        if (text === '/status' || text === '자산') {
            const { data: user, error: userError } = await supabaseAdmin
                .from('users')
                .select('id, full_name, weight, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead')
                .eq('id', MY_ID)
                .single();
            const { data: workoutRows, error: workoutsError } = await supabaseAdmin
                .from('workouts')
                .select('id, user_id, routine_id, workout_date, title, total_volume, average_rpe, duration_minutes, logs, feedback, mood, created_at')
                .eq('user_id', MY_ID)
                .order('workout_date', { ascending: false })
                .limit(5);

            if (userError) console.error("Supabase user select error:", userError);
            if (workoutsError) console.error("Supabase workouts select error:", workoutsError);

            if (!user) {
                await sendMessage(chatId, "❌ 사용자 정보가 없습니다. `users` 테이블에 id=me row가 있는지 확인하세요.");
                return json({ ok: true });
            }

            const workouts = (workoutRows ?? []).map(mapWorkoutRow);

            const squat = typeof user.estimated_1rm_squat === "string" ? Number(user.estimated_1rm_squat) : (user.estimated_1rm_squat || 0);
            const bench = typeof user.estimated_1rm_bench === "string" ? Number(user.estimated_1rm_bench) : (user.estimated_1rm_bench || 0);
            const dead = typeof user.estimated_1rm_dead === "string" ? Number(user.estimated_1rm_dead) : (user.estimated_1rm_dead || 0);
            const totalAsset = (squat || 0) + (bench || 0) + (dead || 0);
            const advice = analyzePortfolio(workouts);
            const mainAdvice = advice[0]?.message || "균형이 잡혀있습니다.";

            const report = `
📊 *Iron Quant 자산 리포트*

💰 *3대 중량 (Total 1RM)*: ${totalAsset}kg
⚖ *현재 체중*: ${user.weight ?? 0}kg

📢 *투자 의견 (Iron Analyst)*
"${mainAdvice}"

최근 운동: ${workouts[0] ? workouts[0].workout_date : '없음'}
            `.trim();

            await sendMessage(chatId, report, true);
            return json({ ok: true });
        }

        // 2. Command: /rec (Recommendation)
        if (text === '/rec' || text === '추천') {
            const { data: workoutRows, error: workoutsError } = await supabaseAdmin
                .from('workouts')
                .select('id, user_id, routine_id, workout_date, title, total_volume, average_rpe, duration_minutes, logs, feedback, mood, created_at')
                .eq('user_id', MY_ID)
                .order('workout_date', { ascending: false })
                .limit(10);
            if (workoutsError) console.error("Supabase workouts select error:", workoutsError);
            const workouts = (workoutRows ?? []).map(mapWorkoutRow);
            const advice = analyzePortfolio(workouts);

            if (advice.length === 0) {
                await sendMessage(chatId, "데이터가 부족하여 추천할 수 없습니다. 운동을 기록해주세요!", true);
            } else {
                const topPick = advice.find(a => a.type === 'Buy');
                if (topPick) {
                    await sendMessage(chatId, `🚀 *강력 매수 추천*\n\n${topPick.message}\n추천 종목: ${topPick.recommendedWorkout}`, true);
                } else {
                    await sendMessage(chatId, `✅ *Hold 의견*\n\n${advice[0].message}`, true);
                }
            }
            return json({ ok: true });
        }

        // 2.2 Command: /week (Weekly report)
        if (text === "/week" || text === "주간" || text === "주간리포트" || text === "주간 리포트") {
            const { data: user } = await supabaseAdmin
                .from("users")
                .select("telegram_timezone")
                .eq("id", MY_ID)
                .single();
            const timeZone = (user?.telegram_timezone ?? "Asia/Seoul").trim() || "Asia/Seoul";
            const report = await buildWeeklyTelegramReport(supabaseAdmin, MY_ID, timeZone);
            await sendMessage(chatId, report.text, true);
            return json({ ok: true });
        }

        // 2.3 Command: /month (Monthly report)
        if (text === "/month" || text === "월간" || text === "월간리포트" || text === "월간 리포트") {
            const { data: user } = await supabaseAdmin
                .from("users")
                .select("telegram_timezone")
                .eq("id", MY_ID)
                .single();
            const timeZone = (user?.telegram_timezone ?? "Asia/Seoul").trim() || "Asia/Seoul";
            const report = await buildMonthlyTelegramReport(supabaseAdmin, MY_ID, timeZone);
            await sendMessage(chatId, report.text, true);
            return json({ ok: true });
        }

        // 2.5 Command: /last
        if (text === "/last") {
            const { data: rows, error } = await supabaseAdmin
                .from("workouts")
                .select("id, workout_date, title, total_volume, average_rpe, duration_minutes, logs, created_at")
                .eq("user_id", MY_ID)
                .order("created_at", { ascending: false })
                .limit(1);
            if (error) {
                await sendMessage(chatId, `❌ 조회 실패: ${error.message}`);
                return json({ ok: true });
            }
            const w = rows?.[0];
            if (!w) {
                await sendMessage(chatId, "최근 운동이 없습니다.");
                return json({ ok: true });
            }
            const logs = Array.isArray(w.logs) ? w.logs : [];
            const first = logs[0] as { name?: unknown; weight?: unknown; reps?: unknown; sets?: unknown } | undefined;
            const hint = first && typeof first.name === "string"
                ? `\n예: \`${first.name} ${Number(first.weight) || 0} ${Number(first.reps) || 0} ${Number(first.sets) || 0}\``
                : "";

            const msg = [
                "*마지막 운동*",
                `- 날짜: \`${w.workout_date ?? ""}\``,
                `- 제목: \`${w.title ?? ""}\``,
                `- RPE: \`${w.average_rpe ?? 0}\` / 시간: \`${w.duration_minutes ?? 0}분\``,
                `- 볼륨: \`${w.total_volume ?? 0}\``,
                `- id: \`${w.id}\``,
                hint,
            ].join("\n");
            await sendMessage(chatId, msg, true);
            return json({ ok: true });
        }

        // 2.6 Command: /undo (recent 30m only)
        if (text === "/undo" || text === "/undo!" || text.startsWith("/undo ")) {
            const force = text === "/undo!" || text.includes("force");
            const { data: rows, error } = await supabaseAdmin
                .from("workouts")
                .select("id, title, workout_date, created_at")
                .eq("user_id", MY_ID)
                .order("created_at", { ascending: false })
                .limit(1);
            if (error) {
                await sendMessage(chatId, `❌ 조회 실패: ${error.message}`);
                return json({ ok: true });
            }
            const w = rows?.[0];
            if (!w) {
                await sendMessage(chatId, "되돌릴 기록이 없습니다.");
                return json({ ok: true });
            }
            const mins = typeof w.created_at === "string" ? minutesAgo(w.created_at) : null;
            if (!force && mins !== null && mins > 30) {
                await sendMessage(chatId, "최근 기록이 30분이 지나서 /undo를 막았습니다. 정말 삭제하려면 `/undo!` 를 입력하세요.");
                return json({ ok: true });
            }

            const { error: delErr } = await supabaseAdmin
                .from("workouts")
                .delete()
                .eq("id", w.id)
                .eq("user_id", MY_ID);
            if (delErr) {
                await sendMessage(chatId, `❌ 삭제 실패: ${delErr.message}`);
                return json({ ok: true });
            }

            try {
                await recomputeBig3Prs(supabaseAdmin, MY_ID);
            } catch (e) {
                console.error("PR recompute failed:", e);
            }

            await sendMessage(chatId, `✅ 되돌림 완료: ${w.title ?? "운동"} (${w.workout_date ?? ""})`, true);
            return json({ ok: true });
        }

        // 2.7 Command: /edit <text> (recent 30m only)
        if (text.startsWith("/edit ")) {
            const newText = text.replace(/^\/edit\s+/, "").trim();
            if (!newText) {
                await sendMessage(chatId, "사용법: `/edit 스쿼트 105 5 5`");
                return json({ ok: true });
            }

            const { data: rows, error } = await supabaseAdmin
                .from("workouts")
                .select("id, created_at")
                .eq("user_id", MY_ID)
                .order("created_at", { ascending: false })
                .limit(1);
            if (error) {
                await sendMessage(chatId, `❌ 조회 실패: ${error.message}`);
                return json({ ok: true });
            }
            const last = rows?.[0];
            if (!last) {
                await sendMessage(chatId, "수정할 최근 기록이 없습니다.");
                return json({ ok: true });
            }
            const mins = typeof last.created_at === "string" ? minutesAgo(last.created_at) : null;
            if (mins !== null && mins > 30) {
                await sendMessage(chatId, "최근 기록이 30분이 지나서 /edit을 막았습니다. 웹에서 수정/추가로 기록하세요.");
                return json({ ok: true });
            }

            const { data: userData } = await supabaseAdmin
                .from("users")
                .select("weight")
                .eq("id", MY_ID)
                .single();
            const weightRaw = userData?.weight;
            const userWeight = typeof weightRaw === "number"
                ? weightRaw
                : typeof weightRaw === "string"
                    ? Number(weightRaw) || 75
                    : 75;

            const parsed = parseWorkoutText(newText, userWeight);
            if (!parsed || parsed.weight <= 0) {
                await sendMessage(chatId, "❌ 파싱 실패. 예: `스쿼트 100 5 5` 형태로 입력하세요.");
                return json({ ok: true });
            }

            const logs = [{ name: parsed.name, weight: parsed.weight, reps: parsed.reps, sets: parsed.sets }];
            const patch = {
                title: `${parsed.name} ${parsed.weight}kg`,
                workout_date: new Date().toISOString().split("T")[0],
                logs,
                total_volume: parsed.weight * parsed.reps * parsed.sets,
                duration_minutes: parsed.estimatedDuration,
                average_rpe: 8,
                mood: "Good",
            };

            const { error: upErr } = await supabaseAdmin
                .from("workouts")
                .update(patch)
                .eq("id", last.id)
                .eq("user_id", MY_ID);
            if (upErr) {
                await sendMessage(chatId, `❌ 수정 실패: ${upErr.message}`);
                return json({ ok: true });
            }

            try {
                await applyBig3Prs(supabaseAdmin, MY_ID, estimateBig3FromLogs(logs));
            } catch (e) {
                console.error("PR update failed:", e);
            }

            await sendMessage(chatId, `✅ 수정 완료: ${patch.title}`, true);
            return json({ ok: true });
        }

        // 2.8 Command: /export csv|json
        if (text === "/export" || text.startsWith("/export ")) {
            const arg = text.replace(/^\/export\s*/, "").trim().toLowerCase();
            const fmt = arg === "json" ? "json" : "csv";

            const [{ data: user, error: userError }, { data: workouts, error: wError }] = await Promise.all([
                supabaseAdmin
                    .from("users")
                    .select("id, full_name, weight, muscle_mass, fat_percentage, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead, level, xp, current_streak")
                    .eq("id", MY_ID)
                    .single(),
                supabaseAdmin
                    .from("workouts")
                    .select("id, workout_date, title, total_volume, average_rpe, duration_minutes, logs, feedback, mood, created_at")
                    .eq("user_id", MY_ID)
                    .order("workout_date", { ascending: false }),
            ]);

            if (userError) {
                await sendMessage(chatId, `❌ 내보내기 실패: ${userError.message}`);
                return json({ ok: true });
            }
            if (wError) {
                await sendMessage(chatId, `❌ 내보내기 실패: ${wError.message}`);
                return json({ ok: true });
            }

            const exportedAt = new Date().toISOString();
            if (fmt === "json") {
                const payload = JSON.stringify({ exported_at: exportedAt, user, workouts: workouts ?? [] }, null, 2);
                await sendDocument(chatId, "iron-quant-export.json", "application/json", payload);
                await sendMessage(chatId, "✅ JSON 내보내기 완료", true);
                return json({ ok: true });
            }

            const lines: string[] = [];
            const csvEscape = (value: unknown) => {
                const s = String(value ?? "");
                if (/[",\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
                return s;
            };
            lines.push(["id", "workout_date", "title", "total_volume", "average_rpe", "duration_minutes", "mood", "feedback", "created_at", "logs_json"].join(","));
            for (const w of workouts ?? []) {
                lines.push([
                    csvEscape(w.id),
                    csvEscape(w.workout_date),
                    csvEscape(w.title),
                    csvEscape(w.total_volume),
                    csvEscape(w.average_rpe),
                    csvEscape(w.duration_minutes),
                    csvEscape(w.mood ?? ""),
                    csvEscape(w.feedback ?? ""),
                    csvEscape(w.created_at ?? ""),
                    csvEscape(JSON.stringify(w.logs ?? [])),
                ].join(","));
            }
            await sendDocument(chatId, "iron-quant-workouts.csv", "text/csv", lines.join("\n"));
            await sendMessage(chatId, "✅ CSV 내보내기 완료", true);
            return json({ ok: true });
        }

        // 3. Log Parsing (Plain text)
        // Format: "Squat 100 5 5" (Name Weight Reps Sets)
        const { data: userData, error: userError } = await supabaseAdmin.from('users').select('weight').eq('id', MY_ID).single();
        if (userError) console.error("Supabase user weight select error:", userError);

        const weightRaw = userData?.weight;
        const userWeight = typeof weightRaw === "number"
            ? weightRaw
            : typeof weightRaw === "string"
                ? Number(weightRaw) || 75
                : 75;

        const parseLines = (raw: string): { ok: true; logs: ReturnType<typeof parseWorkoutText>[] } | { ok: false; bad: string[] } => {
            const rawLines = raw
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean)
                .map((l) => l.replace(/^[-*]\s+/, ""));

            const logs: ReturnType<typeof parseWorkoutText>[] = [];
            const bad: string[] = [];
            for (const line of rawLines) {
                if (!/\d/.test(line)) continue; // Allow headers like "오늘 운동"
                const parsed = parseWorkoutText(line, userWeight);
                if (parsed && parsed.weight > 0) {
                    logs.push(parsed);
                } else {
                    bad.push(line);
                }
            }
            if (bad.length > 0) return { ok: false, bad };
            return { ok: true, logs };
        };

        const parsedLines = parseLines(text);
        const parsedLogs = parsedLines.ok ? parsedLines.logs : [];

        if (!parsedLines.ok) {
            await sendMessage(
                chatId,
                [
                    "❌ 일부 줄을 해석하지 못했습니다.",
                    "",
                    ...parsedLines.bad.slice(0, 5).map((l) => `- \`${l}\``),
                    parsedLines.bad.length > 5 ? `- ... +${parsedLines.bad.length - 5}` : "",
                    "",
                    "예시:",
                    "- `스쿼트 100 5 5`",
                    "- `벤치 60x10x5 @9`",
                    "- 여러 종목은 줄바꿈으로 입력:",
                    "  `스쿼트 100 5 5`",
                    "  `벤치 60 10 5`",
                ].filter(Boolean).join("\n"),
            );
            return json({ ok: true });
        }

        if (parsedLogs.length > 0) {
            // Save to DB
            const logs = parsedLogs.map((l) => ({
                name: l!.name,
                weight: l!.weight,
                reps: l!.reps,
                sets: l!.sets,
                rpe: l!.rpe,
            }));

            const logsJson: Json = logs.map((l) => {
                const obj: Record<string, Json> = {
                    name: l.name,
                    weight: l.weight,
                    reps: l.reps,
                    sets: l.sets,
                };
                if (l.rpe !== undefined) obj.rpe = l.rpe;
                return obj;
            });

            const today = new Date().toISOString().split('T')[0];
            const title = logs.length === 1
                ? `${logs[0]?.name ?? ""} ${logs[0]?.weight ?? 0}kg`
                : `Telegram batch (${logs.length})`;
            const totalVolume = logs.reduce((acc, l) => acc + (l.weight * l.reps * l.sets), 0);
            const duration = parsedLogs.reduce((acc, l) => acc + (l?.estimatedDuration ?? 0), 0);
            const avgRpe = (() => {
                const rpes = logs.map((l) => (typeof l.rpe === "number" && Number.isFinite(l.rpe) ? l.rpe : 8));
                const sum = rpes.reduce((a, b) => a + b, 0);
                return rpes.length ? sum / rpes.length : 8;
            })();

            const { error } = await supabaseAdmin.from('workouts').insert({
                user_id: MY_ID,
                workout_date: today,
                title,
                logs: logsJson,
                total_volume: totalVolume,
                duration_minutes: duration || undefined,
                average_rpe: avgRpe,
                mood: 'Good'
            });

            if (error) {
                console.error("DB Insert Error", error);
                await sendMessage(chatId, `❌ 기록 실패: ${error.message}\n\n(대부분 users에 id=me가 없거나, 권한/RLS 문제입니다)`);
            } else {
                try {
                    await applyBig3Prs(supabaseAdmin, MY_ID, estimateBig3FromLogs(logs));
                } catch (e) {
                    console.error("PR update failed:", e);
                }

                // Algo-Trading Coach Logic
                const overheated = logs.map((l) => analyzeMarketCondition(l as ExerciseLog)).find((c) => c.status === "Overheated");
                const header = logs.length === 1 ? "✅ *운동 기록 완료*" : `✅ *운동 기록 완료* (${logs.length}종목)`;
                const items = logs
                    .slice(0, 10)
                    .map((l, i) => {
                        const rpeTxt = l.rpe ? ` @${l.rpe}` : "";
                        return `${i + 1}) ${l.name}: ${l.weight} x ${l.reps} x ${l.sets}${rpeTxt}`;
                    })
                    .join("\n");
                const tail = logs.length > 10 ? `\n... +${logs.length - 10}` : "";
                let msg = [
                    header,
                    "",
                    items + tail,
                    "",
                    `총 볼륨: ${Math.round(totalVolume).toLocaleString()}kg`,
                    `평균 RPE: ${avgRpe.toFixed(1)}`,
                    "자산 가치(1RM)에 반영되었습니다.",
                ].join("\n");

                // Circuit Breaker Warning
                if (overheated?.message) msg += `\n\n${overheated.message}`;

                // Market Index (S&P 500)
                try {
                    const { data: user } = await supabaseAdmin.from('users').select('weight').eq('id', MY_ID).single();
                    if (user && user.weight) {
                        const bw = Number(user.weight) || 75; // Convert string/number to number
                        const pick = logs[0];
                        const marketPos = pick ? getMarketPosition(pick.name, pick.weight, bw) : null;
                        if (marketPos) {
                            msg += `\n\n${marketPos.message} (${marketPos.index_name})`;
                        }
                    }
                } catch (e) {
                    console.error("Market Index Error", e);
                }

                // Ghost Replay (YoY)
                try {
                    const pick = logs[0];
                    const ghost = pick ? await getGhostReplay(supabaseAdmin, MY_ID, pick.name, pick.weight) : null;
                    if (ghost) {
                        msg += `\n\n${ghost.message}`;
                    }
                } catch (e) {
                    console.error("Ghost Replay Error", e);
                }

                await sendMessage(chatId, msg, true);
            }
        } else {
            // Echo or Help
            if (text.startsWith('/')) {
                await sendMessage(chatId, helpText(), true);
            }
        }

        return json({ ok: true });
    } catch (error) {
        console.error("Telegram Webhook Error", error);
        return json({ error: "Internal Error" }, { status: 500 });
    }
}
