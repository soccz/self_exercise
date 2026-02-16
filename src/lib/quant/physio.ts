import type { CouncilAdvice, CouncilCondition, CouncilInput } from "./types";

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function latestCondition(conditions: CouncilCondition[]): CouncilCondition | null {
  if (conditions.length === 0) return null;
  const sorted = [...conditions].sort((a, b) => (a.condition_date > b.condition_date ? -1 : 1));
  return sorted[0] ?? null;
}

export function analyzeByPhysio(input: CouncilInput): CouncilAdvice[] {
  const recent = [...input.workouts]
    .sort((a, b) => (a.workout_date > b.workout_date ? -1 : 1))
    .slice(0, 8);

  const rpes = recent.map((w) => w.average_rpe).filter((v) => Number.isFinite(v) && v > 0);
  const highRpeDays = rpes.filter((v) => v >= 8.5).length;
  const maxRpe = rpes.length ? Math.max(...rpes) : 0;
  const avgRpe = avg(rpes);

  const condition = latestCondition(input.conditions);
  const fatigue = Number(condition?.fatigue_score ?? 0);
  const stress = Number(condition?.stress_score ?? 0);
  const soreness = Number(condition?.soreness_score ?? 0);
  const sleepHours = Number(condition?.sleep_hours ?? 0);

  const advices: CouncilAdvice[] = [];

  if (maxRpe >= 9.5 || highRpeDays >= 4) {
    advices.push({
      agent: "physio",
      mode: input.user.mode,
      priority: 96,
      confidence: 0.92,
      risk: "high",
      horizon: "today",
      headline: "부상 리스크 고위험 구간",
      reason: [
        `최고 RPE ${maxRpe.toFixed(1)}`,
        `고강도 일수 ${highRpeDays}일`,
      ],
      action: "오늘은 매매 중단(휴식) 또는 델로드 60~70% 강도로 전환하세요.",
      tags: ["recovery", "injury", "veto"],
    });
  } else if (avgRpe >= 8.3) {
    advices.push({
      agent: "physio",
      mode: input.user.mode,
      priority: 80,
      confidence: 0.84,
      risk: "medium",
      horizon: "today",
      headline: "과열 직전 구간",
      reason: [`최근 평균 RPE ${avgRpe.toFixed(1)}`],
      action: "다음 세션은 RPE 7~8 범위로 낮춰 회복 여유를 확보하세요.",
      tags: ["recovery", "rpe"],
    });
  }

  if ((sleepHours > 0 && sleepHours < 6) || fatigue >= 8 || stress >= 8 || soreness >= 8) {
    advices.push({
      agent: "physio",
      mode: input.user.mode,
      priority: 90,
      confidence: 0.88,
      risk: "high",
      horizon: "today",
      headline: "회복 지표 경고",
      reason: [
        sleepHours > 0 ? `수면 ${sleepHours.toFixed(1)}h` : "수면 데이터 부족",
        `피로 ${fatigue || 0}/10 · 스트레스 ${stress || 0}/10 · 근육통 ${soreness || 0}/10`,
      ],
      action: "오늘은 회복 세션(가벼운 유산소/스트레칭)으로 전환하고 강훈련은 하루 미루세요.",
      tags: ["sleep", "fatigue", "stress"],
    });
  }

  if (advices.length === 0) {
    advices.push({
      agent: "physio",
      mode: input.user.mode,
      priority: 52,
      confidence: 0.7,
      risk: "low",
      horizon: "today",
      headline: "리스크 관리 양호",
      reason: ["과열/회복 지표에서 즉각적인 경고 신호가 없습니다."],
      action: "계획 강도를 유지하되, 세션 종료 후 10분 쿨다운을 고정하세요.",
      tags: ["recovery", "stable"],
    });
  }

  return advices;
}
