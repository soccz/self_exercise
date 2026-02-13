import { Workout } from "../data/types";

// ===============================
// 1. Asset Value Logic (The "Stock Price" of your Body)
// ===============================

// Base value: 1kg of 1RM = $10 (arbitrary unit)
// Multipliers for different lifts to normalize difficulty
const VALUE_MULTIPLIERS = {
    // Lower Body
    squat: 1.0,
    deadlift: 1.0,
    lunge: 0.8,
    // Upper Body
    bench: 1.2, // Harder to increase raw weight than squat
    overhead_press: 1.5,
    row: 1.2,
    pullup: 1.5, // Bodyweight + added weight
    pushup: 0.5, // High rep, lower load usually
    // Core
    plank: 2.0 // Per minute?
};

export interface BodyAsset {
    name: string;
    currentValue: number; // Estimated 1RM or Volume Capacity
    momentum: number; // Recent trend (positive/negative)
    lastUpdated: string;
    status: 'Rising' | 'Stable' | 'Falling';
}

/**
 * Calculate the "Total Market Cap" of the user's body
 */
export function calculateTotalAssetValue(userStats: { squat: number, bench: number, dead: number }): number {
    // Simple 3-major lifts valuation
    // In future, this updates dynamically based on workout logs
    const squatVal = userStats.squat * 10 * VALUE_MULTIPLIERS.squat;
    const benchVal = userStats.bench * 10 * VALUE_MULTIPLIERS.bench;
    const deadVal = userStats.dead * 10 * VALUE_MULTIPLIERS.deadlift;

    return Math.round(squatVal + benchVal + deadVal);
}


// ===============================
// 2. Reactive Analysis (Investment Advisor)
// ===============================

export interface AssetAdvice {
    type: 'Buy' | 'Hold' | 'Sell'; // Sell isn't really used in fitness, maybe "Rest"
    message: string;
    priority: number; // 1 (Info) to 5 (Critical)
    recommendedWorkout?: string;
}

export function analyzePortfolio(workouts: Workout[]): AssetAdvice[] {
    const advice: AssetAdvice[] = [];
    if (workouts.length === 0) {
        advice.push({
            type: 'Buy',
            message: "자산 데이터가 없습니다. 기초 자산(스쿼트, 푸시업 등)을 매수하여 포트폴리오를 구성하세요.",
            priority: 5,
            recommendedWorkout: "전신 기초 루틴"
        });
        return advice;
    }

    const today = new Date();
    const lastWorkout = new Date(workouts[0].workout_date);
    const dayDiff = (today.getTime() - lastWorkout.getTime()) / (1000 * 3600 * 24);

    // 1. Market Crash Warning (Inactivity)
    if (dayDiff > 4) {
        advice.push({
            type: 'Buy',
            message: `⚠ 4일간 거래(운동)가 없어 근손실(자산 가치 하락)이 우려됩니다. 즉시 유동성(혈류)을 공급하세요!`,
            priority: 5,
            recommendedWorkout: "가벼운 전신 순환 운동"
        });
    }

    // 2. Sector Analysis (Upper vs Lower Imbalance)
    // Prefer logs over title keywords. Weight by volume so one heavy day matters more than labels.
    let upperScore = 0;
    let lowerScore = 0;
    const recent = workouts.slice(0, 5);

    const isUpperName = (name: string) => {
        const n = name.toLowerCase();
        return (
            n.includes("bench") ||
            n.includes("press") ||
            n.includes("row") ||
            n.includes("pull") ||
            n.includes("pushup") ||
            n.includes("푸시업") ||
            n.includes("벤치") ||
            n.includes("상체") ||
            n.includes("가슴") ||
            n.includes("등") ||
            n.includes("어깨")
        );
    };

    const isLowerName = (name: string) => {
        const n = name.toLowerCase();
        return (
            n.includes("squat") ||
            n.includes("dead") ||
            n.includes("lunge") ||
            n.includes("leg") ||
            n.includes("스쿼트") ||
            n.includes("데드") ||
            n.includes("런지") ||
            n.includes("하체") ||
            n.includes("다리")
        );
    };

    const volumeOf = (weight: number, reps: number, sets: number) => {
        // For bodyweight/unknown weight exercises, use reps*sets as a fallback signal.
        const w = weight > 0 ? weight : 1;
        return w * reps * sets;
    };

    recent.forEach((w) => {
        const logs = w.logs || [];
        if (logs.length > 0) {
            logs.forEach((l) => {
                const v = volumeOf(l.weight || 0, l.reps || 0, l.sets || 0);
                if (isUpperName(l.name)) upperScore += v;
                if (isLowerName(l.name)) lowerScore += v;
            });
            return;
        }

        // Fallback: title-based if logs are empty
        const title = w.title?.toLowerCase() || "";
        if (isUpperName(title)) upperScore += 1;
        if (isLowerName(title)) lowerScore += 1;
    });

    if (upperScore > lowerScore * 1.4) {
        advice.push({
            type: 'Buy',
            message: "📉 하체 섹터가 저평가되어 있습니다. 스쿼트를 매수하여 포트폴리오 균형을 맞추세요.",
            priority: 3,
            recommendedWorkout: "스쿼트 집중 데이"
        });
    } else if (lowerScore > upperScore * 1.4) {
        advice.push({
            type: 'Buy',
            message: "📉 상체 섹터의 비중이 낮습니다. 벤치프레스나 푸시업으로 가치를 끌어올리세요.",
            priority: 3,
            recommendedWorkout: "상체 볼륨 데이"
        });
    } else {
        // Balanced
        if (dayDiff <= 2) {
            advice.push({
                type: 'Hold',
                message: "⚖ 포트폴리오 균형이 아주 좋습니다. 현재 성장세를 유지하세요.",
                priority: 1
            });
        }
    }

    // 3. Recovery (Volatility Check)
    const recentRpes = recent.map(w => w.average_rpe).filter(r => r > 0);
    const avgRpe = recentRpes.length > 0 ? recentRpes.reduce((a, b) => a + b, 0) / recentRpes.length : 0;

    if (avgRpe > 8.5) {
        advice.unshift({
            type: 'Hold',
            message: "🔥 시장 과열(피로도 누적). 부상 리스크 관리를 위해 하루 정도 휴장(휴식)을 권장합니다.",
            priority: 4,
            recommendedWorkout: "스트레칭 및 폼롤러"
        });
    }

    return advice.sort((a, b) => b.priority - a.priority);
}



// ===============================
// 3. Command Parser & Auto-Calculator
// ===============================

export interface ParsedWorkout {
    name: string;
    weight: number;
    reps: number;
    sets: number;
    rpe?: number;
    estimatedDuration: number;
    estimatedCalories: number;
}

// Format: "Squat 100 5 5 @9" (Name Weight Reps Sets RPE)
export function parseWorkoutText(text: string, userWeight: number = 75): ParsedWorkout | null {
    let cleanText = text.trim();
    let rpe: number | undefined;

    // Extract RPE first (syntax: @9 or rpe 9)
    const rpeMatch = cleanText.match(/(@|rpe\s?)([\d\.]+)/i);
    if (rpeMatch) {
        rpe = parseFloat(rpeMatch[2]);
        cleanText = cleanText.replace(rpeMatch[0], "").trim();
    }

    const parts = cleanText.split(/\s+/);
    if (parts.length < 2) return null;

    const name = parts[0];
    let weight = 0, reps = 0, sets = 1;

    // Pattern 1: Name Weight Reps Sets (e.g., Squat 100 5 5)
    if (parts.length >= 4) {
        weight = parseFloat(parts[1]);
        reps = parseFloat(parts[2]);
        sets = parseFloat(parts[3]);
    }
    // Pattern 2: Name Weight Reps (Sets default to 3)
    else if (parts.length === 3) {
        weight = parseFloat(parts[1]);
        reps = parseFloat(parts[2]);
        sets = 3; // Default to 3 sets if not specified
    }
    // Pattern 3: Name Weight (e.g., Run 30)
    else if (parts.length === 2) {
        weight = parseFloat(parts[1]);
        reps = 1;
        sets = 1;
    }

    if (isNaN(weight) || isNaN(reps) || isNaN(sets)) return null;

    // Auto-Calculate Stats
    const estimatedDuration = (sets * 3) + 5;

    // METs Calculation
    let mets = 4.5;
    if (weight > 60) mets = 6.0;

    const durationHours = estimatedDuration / 60;
    const estimatedCalories = Math.round(mets * userWeight * durationHours);

    return { name, weight, reps, sets, rpe, estimatedDuration, estimatedCalories };
}

// Legacy helper if needed
export function calculateCalories(userWeight: number, durationMinutes: number, avgRpe: number): number {
    let mets = 3;
    if (avgRpe >= 8) mets = 6;
    else if (avgRpe >= 6) mets = 5;
    else if (avgRpe >= 4) mets = 4;
    return Math.round(mets * userWeight * (durationMinutes / 60));
}
