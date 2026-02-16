import { Workout } from "../data/types";

// ===============================
// 1. Asset Value Logic (The "Stock Price" of your Body)
// ===============================

export interface BodyAsset {
    name: string;
    currentValue: number; // Estimated 1RM or Volume Capacity
    momentum: number; // Recent trend (positive/negative)
    lastUpdated: string;
    status: 'Rising' | 'Stable' | 'Falling';
}

/**
 * Total 1RM (Big 3) in kg.
 *
 * Note: numeric columns may be strings (Supabase). Callers should normalize first.
 */
export function calculateTotalAssetValue(userStats: { squat: number, bench: number, dead: number }): number {
    return Math.round((userStats.squat || 0) + (userStats.bench || 0) + (userStats.dead || 0));
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
    distance_km?: number;
    speed_kph?: number;
    incline_pct?: number;
    avg_hr?: number;
    calorie_confidence?: "low" | "medium" | "high";
    estimatedDuration: number;
    estimatedCalories: number;
}

function splitDigitSeparators(input: string): string {
    // Turn "60x10x5" / "60×10×5" / "60*10*5" into "60 10 5" without breaking words like "box".
    let out = input;
    while (true) {
        const next = out.replace(/(\d)\s*[xX×*]\s*(\d)/g, "$1 $2");
        if (next === out) return out;
        out = next;
    }
}

function isNumericToken(token: string): boolean {
    return /^[-+]?\d+(?:\.\d+)?$/.test(token);
}

function isCardioName(name: string): boolean {
    const n = name.toLowerCase();
    return [
        "run",
        "running",
        "runner",
        "treadmill",
        "walk",
        "walking",
        "bike",
        "cycle",
        "cycling",
        "cardio",
        "러닝",
        "런",
        "러너",
        "러닝머신",
        "걷기",
        "사이클",
        "자전거",
        "유산소",
    ].some((k) => n.includes(k));
}

function cardioMets(name: string, rpe?: number): number {
    const n = name.toLowerCase();
    let mets = 5;
    if (["run", "running", "runner", "treadmill", "러닝", "런", "러닝머신"].some((k) => n.includes(k))) mets = 8;
    else if (["walk", "walking", "걷기"].some((k) => n.includes(k))) mets = 4.3;
    else if (["bike", "cycle", "cycling", "사이클", "자전거"].some((k) => n.includes(k))) mets = 6.8;
    if (n.includes("incline") || n.includes("경사")) mets += 0.7;
    if (typeof rpe === "number" && Number.isFinite(rpe)) {
        mets += (Math.max(1, Math.min(10, rpe)) - 6) * 0.4;
    }
    return Math.max(3, Math.min(12, mets));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
    if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
}

function extractMetric(text: string, pattern: RegExp): { value?: number; text: string } {
    const m = text.match(pattern);
    if (!m) return { text };
    const raw = m.slice(1).find((g) => typeof g === "string" && g.trim().length > 0);
    const value = Number(raw);
    return {
        value: Number.isFinite(value) ? value : undefined,
        text: text.replace(m[0], " ").replace(/\s+/g, " ").trim(),
    };
}

export interface CardioCalorieInput {
    name: string;
    userWeight: number;
    durationMinutes: number;
    distanceKm?: number;
    speedKph?: number;
    inclinePct?: number;
    avgHeartRate?: number;
    rpe?: number;
}

export function estimateCardioCalories(input: CardioCalorieInput): { calories: number; confidence: "low" | "medium" | "high" } {
    const durationMinutes = Math.max(0, input.durationMinutes || 0);
    if (durationMinutes <= 0) return { calories: 0, confidence: "low" };

    const durationHours = durationMinutes / 60;
    const speedKph = input.speedKph && input.speedKph > 0
        ? input.speedKph
        : input.distanceKm && input.distanceKm > 0
            ? input.distanceKm / durationHours
            : undefined;
    const distanceKm = input.distanceKm && input.distanceKm > 0
        ? input.distanceKm
        : speedKph && speedKph > 0
            ? speedKph * durationHours
            : undefined;
    const inclinePct = Math.max(-3, Math.min(30, input.inclinePct || 0));

    let confidence: "low" | "medium" | "high" = "low";
    if (speedKph && speedKph > 0 && durationMinutes > 0) confidence = "high";
    else if (distanceKm && durationMinutes > 0) confidence = "high";
    else if (input.rpe && input.rpe > 0) confidence = "medium";

    const name = input.name.toLowerCase();
    const weight = Math.max(30, input.userWeight || 75);

    // ACSM treadmill equation when speed is known (best available estimate).
    if ((name.includes("러닝") || name.includes("런") || name.includes("treadmill") || name.includes("run") || name.includes("walk") || name.includes("걷기")) && speedKph) {
        const v = speedKph * 1000 / 60; // m/min
        const grade = inclinePct / 100;
        const running = speedKph >= 8;
        const vo2 = running
            ? (0.2 * v) + (0.9 * v * grade) + 3.5
            : (0.1 * v) + (1.8 * v * grade) + 3.5;
        let kcalPerMin = vo2 * weight / 200;
        if (input.avgHeartRate && input.avgHeartRate > 0) {
            const hrAdj = Math.max(-0.08, Math.min(0.18, (input.avgHeartRate - 120) / 300));
            kcalPerMin *= (1 + hrAdj);
        }
        return { calories: Math.max(0, Math.round(kcalPerMin * durationMinutes)), confidence };
    }

    // Cycling heuristic by speed.
    if ((name.includes("cycle") || name.includes("bike") || name.includes("사이클") || name.includes("자전거")) && speedKph) {
        let mets = 5.5;
        if (speedKph >= 16 && speedKph < 19) mets = 6.8;
        else if (speedKph >= 19 && speedKph < 22) mets = 8.0;
        else if (speedKph >= 22 && speedKph < 25) mets = 10.0;
        else if (speedKph >= 25) mets = 12.0;
        return { calories: Math.max(0, Math.round(mets * weight * durationHours)), confidence };
    }

    // Fallback to METs lookup.
    const mets = cardioMets(input.name, input.rpe);
    return {
        calories: Math.max(0, Math.round(mets * weight * durationHours)),
        confidence: confidence === "low" ? "medium" : confidence,
    };
}

export function summarizeCardioFromLogs(logs: unknown, fallbackDurationMinutes = 0): {
    distanceKm: number;
    avgSpeedKph: number;
    avgInclinePct: number;
    avgHr: number;
} {
    if (!Array.isArray(logs) || logs.length === 0) {
        return { distanceKm: 0, avgSpeedKph: 0, avgInclinePct: 0, avgHr: 0 };
    }

    let distanceKm = 0;
    let weightedSpeed = 0;
    let weightedIncline = 0;
    let weightedHr = 0;
    let speedWeight = 0;
    let inclineWeight = 0;
    let hrWeight = 0;

    for (const item of logs) {
        if (!isRecord(item)) continue;
        const d = toNumber(item["distance_km"], 0);
        const s = toNumber(item["speed_kph"], 0);
        const inPct = toNumber(item["incline_pct"], 0);
        const hr = toNumber(item["avg_hr"], 0);
        const dur = toNumber(item["duration_minutes"], 0);
        const w = dur > 0 ? dur : 1;

        distanceKm += d;
        if (s > 0) {
            weightedSpeed += s * w;
            speedWeight += w;
        }
        if (inPct !== 0) {
            weightedIncline += inPct * w;
            inclineWeight += w;
        }
        if (hr > 0) {
            weightedHr += hr * w;
            hrWeight += w;
        }
    }

    const durationHours = fallbackDurationMinutes > 0 ? fallbackDurationMinutes / 60 : 0;
    const avgSpeedKph = speedWeight > 0
        ? weightedSpeed / speedWeight
        : (distanceKm > 0 && durationHours > 0 ? distanceKm / durationHours : 0);

    return {
        distanceKm,
        avgSpeedKph,
        avgInclinePct: inclineWeight > 0 ? weightedIncline / inclineWeight : 0,
        avgHr: hrWeight > 0 ? weightedHr / hrWeight : 0,
    };
}

export function estimateWorkoutCalories(
    userWeight: number,
    durationMinutes: number,
    avgRpe: number,
    logs?: unknown,
): number {
    if (!Array.isArray(logs) || logs.length === 0) {
        return calculateCalories(userWeight, durationMinutes, avgRpe);
    }

    let hasExplicit = false;
    let total = 0;
    for (const item of logs) {
        if (!isRecord(item)) continue;
        const explicit = toNumber(item["estimated_calories"], 0);
        if (explicit > 0) {
            hasExplicit = true;
            total += explicit;
            continue;
        }

        const name = typeof item["name"] === "string" ? item["name"] : "";
        if (!name || !isCardioName(name)) continue;
        const d = toNumber(item["duration_minutes"], 0);
        const dist = toNumber(item["distance_km"], 0);
        const speed = toNumber(item["speed_kph"], 0);
        const inPct = toNumber(item["incline_pct"], 0);
        const hr = toNumber(item["avg_hr"], 0);
        const rpe = toNumber(item["rpe"], avgRpe || 6);
        const cal = estimateCardioCalories({
            name,
            userWeight,
            durationMinutes: d > 0 ? d : 0,
            distanceKm: dist > 0 ? dist : undefined,
            speedKph: speed > 0 ? speed : undefined,
            inclinePct: inPct,
            avgHeartRate: hr > 0 ? hr : undefined,
            rpe,
        }).calories;
        if (cal > 0) total += cal;
    }

    if (total > 0) return Math.round(total);
    if (hasExplicit) return Math.round(total);
    return calculateCalories(userWeight, durationMinutes, avgRpe);
}

// Format: "Squat 100 5 5 @9" (Name Weight Reps Sets RPE)
export function parseWorkoutText(text: string, userWeight: number = 75): ParsedWorkout | null {
    let cleanText = text.trim().replace(/^[-*]\s+/, "");
    let rpe: number | undefined;

    // Extract RPE first (syntax: @9 or rpe 9, or fullwidth @)
    const rpeMatch = cleanText.match(/(@|＠|rpe\s?)([\d\.]+)/i);
    if (rpeMatch) {
        rpe = parseFloat(rpeMatch[2]);
        cleanText = cleanText.replace(rpeMatch[0], "").trim();
    }

    const extractedDuration = extractMetric(cleanText, /(?:^|\s)(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes|분|시간)(?=$|\s)/i);
    cleanText = extractedDuration.text;
    const extractedDistance = extractMetric(cleanText, /(?:거리|distance)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:km|킬로(?:미터)?)?|(?:^|\s)(\d+(?:\.\d+)?)\s*(?:km|킬로(?:미터)?)(?=$|\s)/i);
    cleanText = extractedDistance.text;
    const extractedSpeed = extractMetric(cleanText, /(?:속도|speed)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:kph|kmh|km\/h)?|(?:^|\s)(\d+(?:\.\d+)?)\s*(?:kph|kmh|km\/h)(?=$|\s)/i);
    cleanText = extractedSpeed.text;
    const extractedIncline = extractMetric(cleanText, /(?:incline|경사)\s*([+-]?\d+(?:\.\d+)?)\s*%?/i);
    cleanText = extractedIncline.text;
    const extractedHr = extractMetric(cleanText, /(?:hr|심박)\s*([0-9]{2,3})\s*(?:bpm)?(?=$|\s)/i);
    cleanText = extractedHr.text;

    cleanText = splitDigitSeparators(cleanText);

    const parts = cleanText.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    let tailStart = parts.length;
    while (tailStart > 0 && isNumericToken(parts[tailStart - 1] ?? "")) {
        tailStart -= 1;
    }
    const nameTokens = parts.slice(0, tailStart);
    const tailNumbers = parts.slice(tailStart).map((v) => Number(v)).filter((v) => Number.isFinite(v));

    let name = nameTokens.length > 0 ? nameTokens.join(" ") : parts[0] ?? "";
    let weight = 0, reps = 0, sets = 1;
    const cardio = isCardioName(name);

    if (cardio && tailNumbers.length >= 1) {
        // Cardio shorthand:
        // 러닝머신 30
        // 러닝머신 30 8
        // 러닝머신 30 8 1
        weight = tailNumbers[0] ?? 0;
        reps = tailNumbers[1] ?? 1;
        sets = tailNumbers[2] ?? 1;
    } else if (cardio && name && (extractedDuration.value || extractedDistance.value || extractedSpeed.value)) {
        // Explicit metric-only cardio:
        // 러닝머신 30분 8km/h
        // 사이클 speed 20 30분
        weight = extractedDuration.value ?? 1;
        reps = 1;
        sets = 1;
    }

    // Pattern 1: Name... Weight Reps Sets (supports multi-word exercise names)
    // e.g. "벤치 프레스 60 10 5", "Back Squat 100 5 5"
    else if (parts.length >= 4) {
        name = parts.slice(0, -3).join(" ");
        weight = parseFloat(parts[parts.length - 3]);
        reps = parseFloat(parts[parts.length - 2]);
        sets = parseFloat(parts[parts.length - 1]);
    }
    // Pattern 2: Name... Weight Reps (Sets default to 3)
    else if (parts.length === 3) {
        const w = parseFloat(parts[1]);
        const r = parseFloat(parts[2]);
        if (!isNaN(w) && !isNaN(r)) {
            name = parts.slice(0, -2).join(" ");
            weight = w;
            reps = r;
            sets = 3; // Default to 3 sets if not specified
        } else {
            // Pattern 2b: Name... Weight (e.g. "벤치 프레스 60")
            name = parts.slice(0, -1).join(" ");
            weight = parseFloat(parts[parts.length - 1]);
            reps = 1;
            sets = 1;
        }
    }
    // Pattern 3: Name Weight (e.g., Run 30)
    else if (parts.length === 2) {
        weight = parseFloat(parts[1]);
        reps = 1;
        sets = 1;
    }

    if (!name || isNaN(weight) || isNaN(reps) || isNaN(sets)) return null;

    let distanceKm = extractedDistance.value;
    let speedKph = extractedSpeed.value;
    let inclinePct = extractedIncline.value;
    const avgHr = extractedHr.value;

    // Optional shorthand hints from numeric tail (duration speed incline)
    if (cardio && !speedKph && tailNumbers.length >= 2) {
        const maybeSpeed = tailNumbers[1] ?? 0;
        if (maybeSpeed >= 3 && maybeSpeed <= 30) speedKph = maybeSpeed;
    }
    if (cardio && inclinePct === undefined && tailNumbers.length >= 3) {
        const maybeIncline = tailNumbers[2] ?? 0;
        if (maybeIncline >= -5 && maybeIncline <= 30) inclinePct = maybeIncline;
    }

    // Auto-Calculate Stats
    let estimatedDuration = extractedDuration.value ?? ((sets * 3) + 5);
    if (cardio && weight > 0 && !extractedDuration.value) {
        // Cardio shorthand: first number is treated as minutes.
        estimatedDuration = Math.max(5, Math.round(weight));
    }

    if (cardio && speedKph && speedKph > 0 && (!distanceKm || distanceKm <= 0)) {
        distanceKm = speedKph * (estimatedDuration / 60);
    }
    if (cardio && distanceKm && distanceKm > 0 && (!speedKph || speedKph <= 0) && estimatedDuration > 0) {
        speedKph = distanceKm / (estimatedDuration / 60);
    }

    let estimatedCalories = 0;
    let calorie_confidence: "low" | "medium" | "high" | undefined;
    if (cardio) {
        const est = estimateCardioCalories({
            name,
            userWeight,
            durationMinutes: estimatedDuration,
            distanceKm: distanceKm && distanceKm > 0 ? distanceKm : undefined,
            speedKph: speedKph && speedKph > 0 ? speedKph : undefined,
            inclinePct: inclinePct ?? undefined,
            avgHeartRate: avgHr && avgHr > 0 ? avgHr : undefined,
            rpe,
        });
        estimatedCalories = est.calories;
        calorie_confidence = est.confidence;
    } else {
        let mets = 4.5;
        if (weight > 60) mets = 6.0;
        estimatedCalories = Math.round(mets * userWeight * (estimatedDuration / 60));
        calorie_confidence = "medium";
    }

    return {
        name,
        weight,
        reps,
        sets,
        rpe,
        distance_km: distanceKm && distanceKm > 0 ? Number(distanceKm.toFixed(3)) : undefined,
        speed_kph: speedKph && speedKph > 0 ? Number(speedKph.toFixed(2)) : undefined,
        incline_pct: inclinePct,
        avg_hr: avgHr,
        calorie_confidence,
        estimatedDuration,
        estimatedCalories,
    };
}

// Legacy helper if needed
export function calculateCalories(userWeight: number, durationMinutes: number, avgRpe: number): number {
    let mets = 3;
    if (avgRpe >= 8) mets = 6;
    else if (avgRpe >= 6) mets = 5;
    else if (avgRpe >= 4) mets = 4;
    return Math.round(mets * userWeight * (durationMinutes / 60));
}
