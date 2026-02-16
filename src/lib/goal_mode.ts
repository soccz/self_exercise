import type { GoalMode, Workout } from "@/lib/data/types";
import { analyzePortfolio, type AssetAdvice } from "@/lib/quant/engine";

export function normalizeGoalMode(value: unknown): GoalMode {
  return value === "muscle_gain" ? "muscle_gain" : "fat_loss";
}

export function goalModeLabel(mode: GoalMode): string {
  return mode === "muscle_gain" ? "근육 모드" : "감량 모드";
}

export function analyzeAdviceForGoal(mode: GoalMode, workouts: Workout[]): AssetAdvice[] {
  if (mode === "muscle_gain") {
    return analyzePortfolio(workouts);
  }
  return analyzeFatLoss(workouts);
}

function analyzeFatLoss(workouts: Workout[]): AssetAdvice[] {
  if (workouts.length === 0) {
    return [
      {
        type: "Buy",
        message: "오늘은 유산소 20분부터 시작하세요. 빠르게 걷기 한 번이면 충분합니다.",
        priority: 5,
        recommendedWorkout: "빠르게 걷기 20분",
      },
    ];
  }

  const advice: AssetAdvice[] = [];
  const today = new Date();
  const lastWorkout = new Date(workouts[0].workout_date);
  const dayDiff = (today.getTime() - lastWorkout.getTime()) / (1000 * 3600 * 24);

  if (dayDiff > 2) {
    advice.push({
      type: "Buy",
      message: "최근 운동 공백이 있습니다. 오늘은 짧게 15분만 걸어서 흐름을 복구하세요.",
      priority: 5,
      recommendedWorkout: "경사 걷기 15분",
    });
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weeklyRows = workouts.filter((w) => {
    const t = Date.parse(w.workout_date);
    return Number.isFinite(t) && t >= sevenDaysAgo;
  });

  const weeklyMinutes = weeklyRows.reduce((acc, w) => acc + (w.duration_minutes || 0), 0);
  const weeklyDistance = weeklyRows.reduce((acc, w) => acc + (w.cardio_distance_km || 0), 0);
  const weeklyCalories = weeklyRows.reduce((acc, w) => acc + (w.estimated_calories || 0), 0);
  const remain = Math.max(0, 150 - weeklyMinutes);
  if (remain > 0) {
    advice.push({
      type: "Buy",
      message: `이번 주 유산소 시간이 부족합니다. ${remain}분만 더 채우면 감량 페이스가 안정됩니다.`,
      priority: 4,
      recommendedWorkout: "빠르게 걷기 30분",
    });
  }

  if (weeklyMinutes >= 90 && weeklyDistance < 10) {
    advice.push({
      type: "Buy",
      message: `유산소 시간 대비 이동거리가 낮습니다(${weeklyDistance.toFixed(1)}km). 속도/경사 중 하나를 소폭 올려 효율을 높이세요.`,
      priority: 4,
      recommendedWorkout: "러닝머신 25~30분 (속도 또는 경사 +1)",
    });
  }

  if (weeklyMinutes >= 120 && weeklyCalories > 0 && weeklyCalories < 1000) {
    advice.push({
      type: "Buy",
      message: `추정 소모 칼로리가 낮습니다(${Math.round(weeklyCalories)}kcal). Zone2 기반으로 10~15분 추가 세션을 붙여보세요.`,
      priority: 3,
      recommendedWorkout: "빠르게 걷기 15분 추가",
    });
  }

  const avgRpe = (() => {
    const rows = weeklyRows.filter((w) => w.average_rpe > 0);
    if (rows.length === 0) return 0;
    return rows.reduce((acc, w) => acc + w.average_rpe, 0) / rows.length;
  })();

  if (avgRpe >= 8.7) {
    advice.unshift({
      type: "Hold",
      message: "피로가 높습니다. 오늘은 강도를 낮춰 20분 회복 유산소를 권장합니다.",
      priority: 4,
      recommendedWorkout: "가벼운 걷기 20분",
    });
  }

  if (advice.length === 0) {
    advice.push({
      type: "Hold",
      message: `좋은 흐름입니다. 최근 7일 ${Math.round(weeklyMinutes)}분 / ${weeklyDistance.toFixed(1)}km를 유지 중입니다.`,
      priority: 2,
      recommendedWorkout: "Zone2 유산소 30분",
    });
  }

  return advice.sort((a, b) => b.priority - a.priority);
}

export function modeRecordTemplates(mode: GoalMode): string[] {
  if (mode === "muscle_gain") {
    return ["스쿼트 100 5 5", "벤치 60x10x5", "데드 120 5 5"];
  }
  return ["러닝머신 30 8 1", "러닝머신 30분 8km/h 경사1", "사이클 35분 20km/h"];
}
