import type { CouncilAdvice, CouncilInput, CouncilWorkout } from "./types";

function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function inRange(rows: CouncilWorkout[], from: string, to: string): CouncilWorkout[] {
  return rows.filter((r) => r.workout_date >= from && r.workout_date <= to);
}

function sumBy(rows: CouncilWorkout[], fn: (r: CouncilWorkout) => number): number {
  return rows.reduce((acc, r) => acc + fn(r), 0);
}

export function analyzeByAnalyst(input: CouncilInput): CouncilAdvice[] {
  const now = input.now;
  const end = toDayKey(now);
  const start = addDays(end, -6);
  const prevStart = addDays(end, -13);
  const prevEnd = addDays(end, -7);

  const cur = inRange(input.workouts, start, end);
  const prev = inRange(input.workouts, prevStart, prevEnd);

  if (input.user.mode === "fat_loss") {
    const minutes = sumBy(cur, (r) => r.duration_minutes || 0);
    const prevMinutes = sumBy(prev, (r) => r.duration_minutes || 0);
    const distance = sumBy(cur, (r) => r.cardio_distance_km || 0);
    const calories = sumBy(cur, (r) => r.estimated_calories || 0);

    const advices: CouncilAdvice[] = [];

    if (minutes < 120) {
      advices.push({
        agent: "analyst",
        mode: "fat_loss",
        priority: 88,
        confidence: 0.9,
        risk: "medium",
        horizon: "week",
        headline: "매수세(활동량) 부족",
        reason: [
          `최근 7일 유산소 ${Math.round(minutes)}분 (권장 150분+)`,
          `최근 7일 이동거리 ${distance.toFixed(1)}km`,
        ],
        action: "이번 주 남은 기간에 Zone2 유산소 25~35분 세션 2회를 추가하세요.",
        tags: ["fat", "minutes", "distance"],
      });
    } else if (minutes < 150) {
      advices.push({
        agent: "analyst",
        mode: "fat_loss",
        priority: 74,
        confidence: 0.8,
        risk: "low",
        horizon: "week",
        headline: "목표선 근접, 마감 관리 필요",
        reason: [
          `최근 7일 유산소 ${Math.round(minutes)}분`,
          `추정 소모 ${Math.round(calories).toLocaleString()}kcal`,
        ],
        action: "20~30분 유산소 1회만 추가하면 주간 목표선(150분)에 도달합니다.",
        tags: ["fat", "target"],
      });
    }

    if (prevMinutes > 0 && minutes < prevMinutes * 0.75) {
      advices.push({
        agent: "analyst",
        mode: "fat_loss",
        priority: 79,
        confidence: 0.84,
        risk: "medium",
        horizon: "week",
        headline: "추세선 하락 전환",
        reason: [
          `전주 ${Math.round(prevMinutes)}분 → 이번 주 ${Math.round(minutes)}분`,
          "활동량 모멘텀이 둔화되었습니다.",
        ],
        action: "유산소를 짧고 자주(15~20분)로 쪼개어 빈도를 회복하세요.",
        tags: ["fat", "trend"],
      });
    }

    if (advices.length === 0) {
      advices.push({
        agent: "analyst",
        mode: "fat_loss",
        priority: 58,
        confidence: 0.75,
        risk: "low",
        horizon: "week",
        headline: "데이터상 감량 추세 양호",
        reason: [
          `최근 7일 유산소 ${Math.round(minutes)}분`,
          `최근 7일 이동거리 ${distance.toFixed(1)}km`,
        ],
        action: "현재 페이스를 유지하고, 수면과 식사 시간대를 고정하세요.",
        tags: ["fat", "stable"],
      });
    }

    return advices;
  }

  const volume = sumBy(cur, (r) => r.total_volume || 0);
  const prevVolume = sumBy(prev, (r) => r.total_volume || 0);
  const sessions = cur.length;

  const advice: CouncilAdvice = {
    agent: "analyst",
    mode: "muscle_gain",
    priority: 62,
    confidence: 0.74,
    risk: "low",
    horizon: "week",
    headline: "데이터상 보합권",
    reason: [
      `최근 7일 총 볼륨 ${Math.round(volume).toLocaleString()}kg`,
      `세션 ${sessions}회`,
    ],
    action: "핵심 종목 탑셋 1개만 소폭 증량해 상승 신호를 만드세요.",
    tags: ["muscle", "volume"],
  };

  if (sessions < 3) {
    advice.priority = 84;
    advice.confidence = 0.9;
    advice.risk = "medium";
    advice.headline = "거래량 부족(세션 부족)";
    advice.reason = [`최근 7일 세션 ${sessions}회`, "주당 3회 미만은 과부하 추세 분석 신뢰도가 낮습니다."];
    advice.action = "이번 주 최소 1회 세션을 추가해 주당 3회 이상을 확보하세요.";
  } else if (prevVolume > 0 && volume < prevVolume * 0.9) {
    advice.priority = 78;
    advice.confidence = 0.82;
    advice.risk = "medium";
    advice.headline = "볼륨 모멘텀 둔화";
    advice.reason = [`전주 ${Math.round(prevVolume).toLocaleString()}kg → 이번 주 ${Math.round(volume).toLocaleString()}kg`];
    advice.action = "다음 세션에서 주요 종목 총 반복수(또는 중량)를 5~8% 상향하세요.";
  } else if (prevVolume > 0 && volume > prevVolume * 1.05) {
    advice.priority = 55;
    advice.confidence = 0.8;
    advice.risk = "low";
    advice.headline = "상승장 유지";
    advice.reason = [`볼륨 증가율 ${(100 * (volume / prevVolume - 1)).toFixed(1)}%`];
    advice.action = "현재 증량 폭을 유지하되 피로 누적 지표를 함께 모니터링하세요.";
  }

  return [advice];
}
