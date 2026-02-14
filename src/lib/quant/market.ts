import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/lib/supabase_database";
import { ExerciseLog } from "@/lib/data/types";

// --- Types ---
export type MarketPosition = {
    index_name: string; // e.g. "S&P 500", "KOSPI 200"
    percentile: string; // "Top 10%"
    performance: "Outperform" | "Market Perform" | "Underperform";
    message: string;
};

export type GhostReplay = {
    date: string; // "2023-02-14"
    weight: number;
    yoy_growth: number; // Percentage
    message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

// --- Core Logic 1: Market Index (Strength Standards) ---
// Simplified Standards (Multiplier of Bodyweight)
const STANDARDS: Record<string, { intermediate: number; advanced: number; elite: number }> = {
    squat: { intermediate: 1.5, advanced: 2.0, elite: 2.5 },
    bench: { intermediate: 1.0, advanced: 1.5, elite: 2.0 },
    deadlift: { intermediate: 1.8, advanced: 2.2, elite: 2.8 },
    overhead: { intermediate: 0.7, advanced: 0.9, elite: 1.1 },
};

export function getMarketPosition(
    liftName: string,
    weight: number,
    bodyweight: number
): MarketPosition | null {
    const lift = Object.keys(STANDARDS).find((k) => liftName.toLowerCase().includes(k));
    if (!lift) return null; // No standard for this lift (e.g. Curl)

    const std = STANDARDS[lift];
    const ratio = weight / bodyweight;

    // S&P 500 Metaphor
    // Elite = Top 1% (Institutional)
    // Advanced = Top 10% (Index Beaters)
    // Intermediate = Market Average (ETF)
    // Beginner = Underperform

    if (ratio >= std.elite) {
        return {
            index_name: "Nasdaq 100 (Elite)",
            percentile: "Top 1%",
            performance: "Outperform",
            message: `🏆 **Institutional Player**: 체중의 ${ratio.toFixed(1)}배! 기관 투자자급 (상위 1%) 퍼포먼스입니다.`,
        };
    } else if (ratio >= std.advanced) {
        return {
            index_name: "S&P 500 (Advanced)",
            percentile: "Top 10%",
            performance: "Outperform",
            message: `🚀 **Alpha Producer**: 체중의 ${ratio.toFixed(1)}배! 시장 수익률을 상회(Outperform)하고 있습니다.`,
        };
    } else if (ratio >= std.intermediate) {
        return {
            index_name: "KOSPI 200 (Intermediate)",
            percentile: "Top 30%",
            performance: "Market Perform",
            message: `📊 **Market Perform**: 체중의 ${ratio.toFixed(1)}배. 시장 평균 수준의 견고한 펀더멘탈입니다.`,
        };
    } else {
        return {
            index_name: "Small Cap (Beginner)",
            percentile: "Bottom 50%",
            performance: "Underperform",
            message: `🌱 **Growth Stock**: 아직 저평가 상태(Underperform). 성장 잠재력이 가장 높은 구간입니다.`,
        };
    }
}

// --- Core Logic 2: Ghost Replay (YoY Growth) ---
export async function getGhostReplay(
    supabase: SupabaseClient<Database>,
    userId: string,
    liftName: string,
    currentWeight: number
): Promise<GhostReplay | null> {
    // Find log from ~1 year ago (+- 30 days)
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const start = new Date(oneYearAgo); start.setDate(start.getDate() - 30);
    const end = new Date(oneYearAgo); end.setDate(end.getDate() + 30);

    const { data: workouts } = await supabase
        .from("workouts")
        .select("workout_date, logs")
        .eq("user_id", userId)
        .gte("workout_date", start.toISOString().split("T")[0])
        .lte("workout_date", end.toISOString().split("T")[0])
        .order("workout_date", { ascending: false });

    if (!workouts || workouts.length === 0) return null;

    // Helper to parse logs
    const parseLogs = (logs: unknown): ExerciseLog[] => {
        if (!Array.isArray(logs)) return [];
        const out: ExerciseLog[] = [];
        for (const item of logs) {
            if (!isRecord(item)) continue;
            const name = typeof item.name === "string" ? item.name : "";
            if (!name) continue;
            const weight = Number(item.weight);
            const reps = Number(item.reps);
            const sets = Number(item.sets);
            if (!Number.isFinite(weight) || !Number.isFinite(reps) || !Number.isFinite(sets)) continue;
            out.push({ name, weight, reps, sets });
        }
        return out;
    };

    let ghostLog: { date: string; weight: number } | null = null;

    for (const w of workouts) {
        if (!w.workout_date) continue;
        const logs = parseLogs(w.logs);
        const match = logs.find(l => l.name.toLowerCase().includes(liftName.toLowerCase()));
        if (match && match.weight > 0) {
            ghostLog = { date: w.workout_date, weight: match.weight };
            break; // Use the most recent one in that window
        }
    }

    if (!ghostLog) return null;

    const prev = ghostLog.weight;
    const growth = ((currentWeight - prev) / prev) * 100;
    const sign = growth > 0 ? "+" : "";

    return {
        date: ghostLog.date,
        weight: ghostLog.weight,
        yoy_growth: growth,
        message: `👻 **Ghost Replay**: 1년 전(${ghostLog.date}) 보다 수익률 **${sign}${growth.toFixed(1)}%** (YoY) 달성! (${prev}kg -> ${currentWeight}kg)`
    };
}
