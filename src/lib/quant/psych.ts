import type { CouncilAdvice, CouncilInput } from "./types";

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

export function analyzeByPsych(input: CouncilInput): CouncilAdvice[] {
  const today = dayKey(input.now);
  const sorted = [...input.workouts].sort((a, b) => (a.workout_date > b.workout_date ? -1 : 1));
  const last = sorted[0] ?? null;

  const advices: CouncilAdvice[] = [];

  if (!last) {
    advices.push({
      agent: "psych",
      mode: input.user.mode,
      priority: 91,
      confidence: 0.9,
      risk: "high",
      horizon: "today",
      headline: "시장 이탈 감지",
      reason: ["최근 기록이 없습니다."],
      action: "오늘 10분만 기록 가능한 최소 행동(걷기/가벼운 루틴)으로 시장에 재진입하세요.",
      tags: ["adherence", "restart"],
    });
    return advices;
  }

  const gap = Math.max(0, daysBetween(last.workout_date, today));
  if (gap >= 4) {
    advices.push({
      agent: "psych",
      mode: input.user.mode,
      priority: 89,
      confidence: 0.88,
      risk: "high",
      horizon: "today",
      headline: "작심삼일 패턴 경고",
      reason: [`마지막 기록 이후 ${gap}일 경과`],
      action: "강도보다 재개가 우선입니다. 오늘은 12~20분의 아주 쉬운 세션을 완료하세요.",
      tags: ["streak", "habit"],
    });
  } else if (gap >= 2) {
    advices.push({
      agent: "psych",
      mode: input.user.mode,
      priority: 72,
      confidence: 0.8,
      risk: "medium",
      horizon: "today",
      headline: "이탈 전조",
      reason: [`최근 공백 ${gap}일`],
      action: "오늘 15분 루틴으로 연속성을 방어하세요. 길게보다 반드시 수행이 중요합니다.",
      tags: ["streak", "consistency"],
    });
  }

  // Weekday dropout detection (last 28 days)
  const since = new Date(input.now.getTime() - 27 * 24 * 60 * 60 * 1000);
  const byDow = new Array<number>(7).fill(0);
  for (const w of input.workouts) {
    const d = new Date(`${w.workout_date}T00:00:00Z`);
    if (d < since) continue;
    byDow[d.getUTCDay()] += 1;
  }
  const minCount = Math.min(...byDow);
  const maxCount = Math.max(...byDow);
  if (maxCount >= 3 && minCount === 0) {
    const missingDow = byDow.findIndex((v) => v === 0);
    const labels = ["일", "월", "화", "수", "목", "금", "토"];
    advices.push({
      agent: "psych",
      mode: input.user.mode,
      priority: 64,
      confidence: 0.72,
      risk: "low",
      horizon: "week",
      headline: "요일 편향 패턴",
      reason: [`최근 4주 ${labels[missingDow] ?? "특정"}요일 기록이 비어 있습니다.`],
      action: `다음 ${labels[missingDow] ?? "해당"}요일에는 10분짜리 미니 세션을 먼저 예약하세요.`,
      tags: ["weekday", "habit"],
    });
  }

  if (advices.length === 0) {
    advices.push({
      agent: "psych",
      mode: input.user.mode,
      priority: 50,
      confidence: 0.7,
      risk: "low",
      horizon: "week",
      headline: "행동 지속성 양호",
      reason: [`현재 스트릭 ${input.user.current_streak}일`],
      action: "시장을 떠나지 마십시오. 내일도 동일 시간대에 1세트부터 시작하세요.",
      tags: ["habit", "motivation"],
    });
  }

  return advices;
}
