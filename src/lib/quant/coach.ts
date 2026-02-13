import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase_database";
import { ExerciseLog, Workout } from "@/lib/data/types";

// --- Types ---
type MarketBriefing = {
    ticker: string; // e.g. "SQT" (Squat)
    trend: "Bullish" | "Bearish" | "Neutral";
    last_price: number; // Last weight
    target_price: number; // Recommended weight
    advice: string;
};

type MarketCondition = {
    status: "Normal" | "Overheated" | "Volatile";
    message?: string;
};

// --- Helper: Parsing ---
function parseLogs(logs: any[]): ExerciseLog[] {
    if (!Array.isArray(logs)) return [];
    return logs.map((l) => ({
        name: l.name,
        weight: Number(l.weight),
        reps: Number(l.reps),
        sets: Number(l.sets),
        rpe: l.rpe ? Number(l.rpe) : undefined,
    }));
}

// --- Core Logic 1: Pre-Market Briefing (Trend Analysis) ---
export async function analyzePreMarket(
    supabase: SupabaseClient<Database>,
    userId: string
): Promise<MarketBriefing | null> {
    // 1. Identify "Ticker" (Which lift is due?)
    // Strategy: Find the Big 3 lift that hasn't been done for the longest time (but within 10 days).
    const { data: recentWorkouts } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", userId)
        .order("workout_date", { ascending: false })
        .limit(10); // Look back 10 sessions

    if (!recentWorkouts || recentWorkouts.length === 0) return null;

    const lifts = ["Squat", "Bench", "Deadlift", "Overhead Press"];
    const lastDates: Record<string, { date: string; log: ExerciseLog; id: string } | null> = {
        Squat: null,
        Bench: null,
        Deadlift: null,
        "Overhead Press": null,
    };

    // Scan history to find last occurrence of each lift
    for (const w of recentWorkouts) {
        const logs = parseLogs(w.logs);
        for (const lift of lifts) {
            if (lastDates[lift]) continue; // Already found most recent
            // Fuzzy match name (e.g. "Back Squat" matches "Squat")
            const match = logs.find((l) => l.name.toLowerCase().includes(lift.toLowerCase()) || (lift === "Overhead Press" && l.name.toLowerCase().includes("press")));
            if (match) {
                lastDates[lift] = { date: w.workout_date, log: match, id: w.id };
            }
        }
    }

    // Find the lift that is "Due" (oldest date, but exists)
    let targetLift = "";
    let oldestDate = new Date().toISOString();
    let lastSession: { date: string; log: ExerciseLog; id: string } | null = null;

    for (const lift of lifts) {
        const data = lastDates[lift];
        if (data) {
            if (data.date < oldestDate) {
                oldestDate = data.date;
                targetLift = lift;
                lastSession = data;
            }
        } else {
            // Never done recently -> Recommend it? Maybe. 
            // For now, prioritize existing data to calc trend.
        }
    }

    if (!targetLift || !lastSession) return null;

    // 2. Trend Analysis (Algo)
    const lastLog = lastSession.log;
    const lastRpe = lastLog.rpe ?? 8; // Default to 8 if unknown
    const lastWeight = lastLog.weight;

    // Logic from roadmap
    let trend: "Bullish" | "Bearish" | "Neutral" = "Neutral";
    let targetWeight = lastWeight;
    let advice = "";

    if (lastRpe <= 8) {
        // Bullish: Easy -> Increase
        trend = "Bullish";
        targetWeight = lastWeight + 2.5; // Aggressive Buy
        advice = `상승 추세(Last RPE ${lastRpe}). 오늘 ${targetWeight}kg로 증량(불타기) 추천.`;
    } else if (lastRpe >= 9.5) {
        // Bearish: Hard -> Deload
        trend = "Bearish";
        targetWeight = Math.floor(lastWeight * 0.9); // Defensive Hold
        advice = `과열/하락 리스크(Last RPE ${lastRpe}). 오늘 ${targetWeight}kg로 비중 축소(방어) 추천.`;
    } else {
        // Neutral: Maintain
        trend = "Neutral";
        targetWeight = lastWeight;
        advice = `보합세(Last RPE ${lastRpe}). 기존 ${targetWeight}kg 유지(관망) 추천.`;
    }

    return {
        ticker: targetLift,
        trend,
        last_price: lastWeight,
        target_price: targetWeight,
        advice,
    };
}

// --- Core Logic 2: Real-time Circuit Breaker ---
export function analyzeMarketCondition(log: ExerciseLog): MarketCondition {
    // Overheat Logic
    // If user inputs RPE (e.g. "Squat 100 5 5 @10"), we check it.
    // The parser might extract RPE if formatted correctly, or we infer?
    // Implicitly, the current parser doesn't extract RPE from "100 5 5".
    // But if the user types extended format or we add RPE parsing later.
    // For now, let's assume the log passed here MIGHT have RPE if we upgrade the parser.
    // OR, if the user explicitly types "/edit ... rpe 10" (future).

    // Wait, the requirement is "RPE 9~10 기록하면".
    // Currently the bot defaults RPE to 8 in `route.ts`. 
    // We need to parse RPE from text like "Squat 100 5 5 @9.5" or similar?
    // The user prompt didn't specify *how* to input RPE, just "if I record RPE 9~10".
    // I will support data check here. Parsing logic is separate.

    const rpe = log.rpe ?? 0;

    if (rpe >= 9) {
        return {
            status: "Overheated",
            message: `⚠ **Market Overheated** (RPE ${rpe} 감지)\n부상 리스크가 높습니다. 다음 세트는 무게를 10% 낮추거나(비중 축소), 휴식 시간을 늘리세요.`,
        };
    }

    return { status: "Normal" };
}
