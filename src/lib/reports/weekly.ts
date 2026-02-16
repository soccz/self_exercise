import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase_database";
import type { GoalMode } from "@/lib/data/types";
import { calculateCalories } from "@/lib/quant/engine";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];
type BuildWeeklyOptions = {
  goalMode?: GoalMode;
  userWeight?: number;
};

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseLogNames(logs: unknown): string[] {
  if (!Array.isArray(logs)) return [];
  const out: string[] = [];
  for (const item of logs) {
    if (!isRecord(item)) continue;
    const n = item["name"];
    if (typeof n === "string" && n.trim()) out.push(n.trim());
  }
  return out;
}

function dateInTz(timeZone: string, d = new Date()): string {
  // en-CA yields YYYY-MM-DD
  return d.toLocaleDateString("en-CA", { timeZone });
}

function addDays(ymd: string, days: number): string {
  const t = Date.parse(`${ymd}T00:00:00Z`);
  const d = new Date(t + days * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function sparkline(values: number[]): string {
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...values, 0);
  if (!Number.isFinite(max) || max <= 0) return "▁▁▁▁▁▁▁";
  return values
    .map((v) => {
      const x = Math.max(0, v);
      const idx = Math.min(bars.length - 1, Math.floor((x / max) * (bars.length - 1)));
      return bars[idx] ?? bars[0];
    })
    .join("");
}

function classifyName(name: string): "upper" | "lower" | "other" {
  const n = name.toLowerCase();
  const upper = ["bench", "press", "row", "pull", "pushup", "푸시업", "벤치", "상체", "가슴", "등", "어깨"];
  const lower = ["squat", "dead", "lunge", "leg", "스쿼트", "데드", "런지", "하체", "다리"];
  if (upper.some((k) => n.includes(k))) return "upper";
  if (lower.some((k) => n.includes(k))) return "lower";
  return "other";
}

function big3Key(name: string): "squat" | "bench" | "dead" | null {
  const n = name.toLowerCase();
  if (["squat", "스쿼트", "백스쿼트", "front squat"].some((k) => n.includes(k))) return "squat";
  if (["bench", "벤치", "벤치프레스", "bench press"].some((k) => n.includes(k))) return "bench";
  if (["dead", "데드", "deadlift", "데드리프트"].some((k) => n.includes(k))) return "dead";
  return null;
}

function scanBestWeights(rows: Array<Pick<WorkoutRow, "logs">>): Record<"squat" | "bench" | "dead", number> {
  const best = { squat: 0, bench: 0, dead: 0 };
  for (const r of rows) {
    if (!Array.isArray(r.logs)) continue;
    for (const item of r.logs) {
      if (!isRecord(item)) continue;
      const name = typeof item["name"] === "string" ? item["name"] : "";
      const key = name ? big3Key(name) : null;
      if (!key) continue;
      const w = toNumber(item["weight"], 0);
      if (w > best[key]) best[key] = w;
    }
  }
  return best;
}

function diffText(curr: number, prev: number): string {
  const d = curr - prev;
  if (!Number.isFinite(d) || d === 0) return "=";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d}`;
}

export async function buildWeeklyTelegramReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeZone: string,
  options: BuildWeeklyOptions = {},
): Promise<{ text: string; meta: { start: string; end: string } }> {
  const end = dateInTz(timeZone);
  const start = addDays(end, -6);
  const days = Array.from({ length: 7 }, (_v, i) => addDays(start, i));

  const prevStart = addDays(end, -13);

  const [{ data: rows, error }, { data: user, error: uErr }] = await Promise.all([
    supabase
      .from("workouts")
      .select("workout_date, total_volume, average_rpe, logs, title")
      .eq("user_id", userId)
      .gte("workout_date", prevStart)
      .lte("workout_date", end)
      .order("workout_date", { ascending: true }),
    supabase
      .from("users")
      .select("current_streak, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead, goal_mode, weight")
      .eq("id", userId)
      .single(),
  ]);

  if (error) {
    return {
      text: `❌ 주간 리포트 생성 실패: ${error.message}`,
      meta: { start, end },
    };
  }
  if (uErr) {
    return {
      text: `❌ 주간 리포트 생성 실패: ${uErr.message}`,
      meta: { start, end },
    };
  }

  const byDay: Record<string, { count: number; volume: number; minutes: number; rpeSum: number; rpeN: number; names: string[] }> = {};
  for (const d of days) byDay[d] = { count: 0, volume: 0, minutes: 0, rpeSum: 0, rpeN: 0, names: [] };

  const all = (rows ?? []) as Pick<WorkoutRow, "workout_date" | "total_volume" | "average_rpe" | "duration_minutes" | "logs" | "title">[];
  const curRows = all.filter((r) => (r.workout_date ?? "") >= start);
  const prevRows = all.filter((r) => (r.workout_date ?? "") < start);

  for (const r of curRows) {
    const d = r.workout_date ?? "";
    if (!byDay[d]) continue;
    byDay[d].count += 1;
    const v = toNumber(r.total_volume, 0);
    byDay[d].volume += v;
    byDay[d].minutes += toNumber(r.duration_minutes, 0);
    const rpe = toNumber(r.average_rpe, 0);
    if (rpe > 0) {
      byDay[d].rpeSum += rpe;
      byDay[d].rpeN += 1;
    }
    byDay[d].names.push(...parseLogNames(r.logs));
    if (typeof r.title === "string" && r.title.trim()) byDay[d].names.push(r.title.trim());
  }

  const volumes = days.map((d) => byDay[d]?.volume ?? 0);
  const minutesByDay = days.map((d) => byDay[d]?.minutes ?? 0);
  const sessions = days.reduce((acc, d) => acc + (byDay[d]?.count ?? 0), 0);
  const activeDays = days.reduce((acc, d) => acc + ((byDay[d]?.count ?? 0) > 0 ? 1 : 0), 0);
  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  const totalMinutes = minutesByDay.reduce((a, b) => a + b, 0);
  const userWeight = toNumber(options.userWeight ?? (user as Pick<UserRow, "weight"> | null)?.weight, 75);
  const totalCalories = curRows.reduce(
    (acc, r) => acc + calculateCalories(userWeight, toNumber(r.duration_minutes, 0), toNumber(r.average_rpe, 0)),
    0,
  );
  const mode: GoalMode = options.goalMode ?? ((user as Pick<UserRow, "goal_mode"> | null)?.goal_mode === "muscle_gain" ? "muscle_gain" : "fat_loss");
  const avgRpeAll = (() => {
    const sum = days.reduce((acc, d) => acc + (byDay[d]?.rpeSum ?? 0), 0);
    const n = days.reduce((acc, d) => acc + (byDay[d]?.rpeN ?? 0), 0);
    if (n <= 0) return null;
    return sum / n;
  })();

  // Upper/lower ratio (approx) for this week
  let upperVol = 0;
  let lowerVol = 0;
  for (const r of curRows) {
    const v = toNumber(r.total_volume, 0);
    let upperHits = 0;
    let lowerHits = 0;
    if (Array.isArray(r.logs)) {
      for (const item of r.logs) {
        if (!isRecord(item)) continue;
        const name = typeof item["name"] === "string" ? item["name"] : "";
        const cls = name ? classifyName(name) : "other";
        if (cls === "upper") upperHits += 1;
        if (cls === "lower") lowerHits += 1;
      }
    } else if (typeof r.title === "string") {
      const cls = classifyName(r.title);
      if (cls === "upper") upperHits += 1;
      if (cls === "lower") lowerHits += 1;
    }
    if (upperHits > lowerHits) upperVol += v;
    else if (lowerHits > upperHits) lowerVol += v;
  }
  const ratio = (() => {
    const denom = upperVol + lowerVol;
    if (denom <= 0) return null;
    const u = Math.round((upperVol / denom) * 100);
    const l = 100 - u;
    return { u, l };
  })();

  // Big3 best weights: this week vs last week
  const bestCur = scanBestWeights(curRows);
  const bestPrev = scanBestWeights(prevRows);

  const streak = toNumber((user as Pick<UserRow, "current_streak"> | null)?.current_streak, 0);
  const squat1 = toNumber((user as Pick<UserRow, "estimated_1rm_squat"> | null)?.estimated_1rm_squat, 0);
  const bench1 = toNumber((user as Pick<UserRow, "estimated_1rm_bench"> | null)?.estimated_1rm_bench, 0);
  const dead1 = toNumber((user as Pick<UserRow, "estimated_1rm_dead"> | null)?.estimated_1rm_dead, 0);
  const total1 = Math.round(squat1 + bench1 + dead1);

  // Top names (roughly: most frequent token)
  const freq: Record<string, number> = {};
  for (const d of days) {
    for (const n of byDay[d]?.names ?? []) {
      const k = n.toLowerCase();
      freq[k] = (freq[k] ?? 0) + 1;
    }
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k)
    .filter(Boolean);

  const muscleAdvice = (() => {
    if (activeDays === 0) return "이번 주 기록이 없습니다. 다음 주는 1회라도 기록하는 게 최우선입니다.";
    if (activeDays <= 2) return "거래일이 적습니다. 다음 주는 주 3회(분할/전신 아무거나)만 맞추면 급상승합니다.";
    if (avgRpeAll !== null && avgRpeAll >= 8.7) return "피로가 높습니다. 다음 주는 1일 휴식 또는 델로드(90%)를 섞으세요.";
    return "좋습니다. 다음 주는 가장 약한 섹터(상체/하체) 1개만 더 보강하세요.";
  })();

  const fatAdvice = (() => {
    if (activeDays === 0) return "이번 주 유산소 기록이 없습니다. 15~20분 걷기 1회부터 다시 시작하세요.";
    if (totalMinutes < 90) return "유산소 시간이 부족합니다. 다음 주는 20~30분 세션을 3회 확보해 보세요.";
    if (totalMinutes < 150) return `목표 150분까지 ${150 - Math.round(totalMinutes)}분 남았습니다. 짧은 걷기 2회만 추가하세요.`;
    if (avgRpeAll !== null && avgRpeAll >= 8.7) return "강도가 높습니다. 다음 주 1~2회는 회복용 Zone2로 낮춰서 지속성을 지키세요.";
    return "좋은 감량 페이스입니다. 현재 루틴을 유지하면서 수면/식단만 안정화하세요.";
  })();

  const lines: string[] = [];
  if (mode === "fat_loss") {
    const targetMinutes = 150;
    const progress = Math.min(100, Math.round((totalMinutes / targetMinutes) * 100));
    lines.push(`*📅 주간 감량 리포트* (${start} ~ ${end})`);
    lines.push("");
    lines.push(`- 활동: *${activeDays}일* / 7일`);
    lines.push(`- 세션: *${sessions}회*`);
    lines.push(`- 유산소 시간: *${Math.round(totalMinutes)}분* / ${targetMinutes}분 (${progress}%)`);
    lines.push(`- 추정 소모 칼로리: *${Math.round(totalCalories).toLocaleString()} kcal*`);
    if (avgRpeAll !== null) lines.push(`- 평균 RPE: *${avgRpeAll.toFixed(1)}*`);
    lines.push(`- 시간 스파크: \`${sparkline(minutesByDay)}\``);
    lines.push(`- 스트릭: ${streak}일`);
    if (top.length > 0) lines.push(`- 주요 기록: ${top.map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
    lines.push(`💬 *다음 액션*: ${fatAdvice}`);
  } else {
    lines.push(`*📅 주간 리포트* (${start} ~ ${end})`);
    lines.push("");
    lines.push(`- 활동: *${activeDays}일* / 7일`);
    lines.push(`- 세션: *${sessions}회*`);
    lines.push(`- 총 볼륨: *${Math.round(totalVolume).toLocaleString()}kg*`);
    if (avgRpeAll !== null) lines.push(`- 평균 RPE: *${avgRpeAll.toFixed(1)}*`);
    lines.push(`- 볼륨 스파크: \`${sparkline(volumes)}\``);
    if (ratio) lines.push(`- 상/하 비중(볼륨): 상체 ${ratio.u}% | 하체 ${ratio.l}%`);
    lines.push(
      `- Big3 최고(주간): S ${bestCur.squat} (${diffText(bestCur.squat, bestPrev.squat)}) | B ${bestCur.bench} (${diffText(bestCur.bench, bestPrev.bench)}) | D ${bestCur.dead} (${diffText(bestCur.dead, bestPrev.dead)})`,
    );
    lines.push(`- 현재 3대 1RM: Total ${total1} (S ${Math.round(squat1)}, B ${Math.round(bench1)}, D ${Math.round(dead1)})`);
    lines.push(`- 스트릭: ${streak}일`);
    if (top.length > 0) lines.push(`- Top: ${top.map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
    lines.push(`💬 *다음 액션*: ${muscleAdvice}`);
  }

  return { text: lines.join("\n"), meta: { start, end } };
}
