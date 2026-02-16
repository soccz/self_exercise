import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase_database";
import type { GoalMode } from "@/lib/data/types";
import { calculateCalories } from "@/lib/quant/engine";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];
type UserRow = Database["public"]["Tables"]["users"]["Row"];
type BuildMonthlyOptions = {
  goalMode?: GoalMode;
  userWeight?: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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

function getYearMonthInTz(timeZone: string, d = new Date()): { year: number; month: number } {
  const fmt = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit" });
  const parts = fmt.formatToParts(d);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return { year, month };
}

function prevMonthOf(year: number, month: number): { year: number; month: number } {
  // month: 1..12
  if (month > 1) return { year, month: month - 1 };
  return { year: year - 1, month: 12 };
}

function lastDayOfMonth(year: number, month: number): number {
  // month: 1..12
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sparkline(values: number[]): string {
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const max = Math.max(...values, 0);
  if (!Number.isFinite(max) || max <= 0) return "▁▁▁▁";
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

function scanBestWeights(rows: Array<Pick<WorkoutRow, "logs" | "title">>): Record<"squat" | "bench" | "dead", number> {
  const best = { squat: 0, bench: 0, dead: 0 };
  for (const r of rows) {
    const names = [...parseLogNames(r.logs), ...(typeof r.title === "string" ? [r.title] : [])];
    // We only have names here; weight is in logs. Try logs first.
    if (Array.isArray(r.logs)) {
      for (const item of r.logs) {
        if (!isRecord(item)) continue;
        const name = typeof item["name"] === "string" ? item["name"] : "";
        const key = name ? big3Key(name) : null;
        if (!key) continue;
        const w = toNumber(item["weight"], 0);
        if (w > best[key]) best[key] = w;
      }
    } else {
      // title-only can't give weight reliably; ignore.
      void names;
    }
  }
  return best;
}

export async function buildMonthlyTelegramReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeZone: string,
  options: BuildMonthlyOptions = {},
): Promise<{ text: string; meta: { start: string; end: string; ym: string } }> {
  const { year, month } = getYearMonthInTz(timeZone);
  const { year: py, month: pm } = prevMonthOf(year, month);
  const start = `${py}-${pad2(pm)}-01`;
  const end = `${py}-${pad2(pm)}-${pad2(lastDayOfMonth(py, pm))}`;
  const ym = `${py}-${pad2(pm)}`;

  const [{ data: workouts, error: wErr }, { data: user, error: uErr }] = await Promise.all([
    supabase
      .from("workouts")
      .select("workout_date, total_volume, average_rpe, duration_minutes, logs, title")
      .eq("user_id", userId)
      .gte("workout_date", start)
      .lte("workout_date", end)
      .order("workout_date", { ascending: true }),
    supabase
      .from("users")
      .select("current_streak, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead, goal_mode, weight")
      .eq("id", userId)
      .single(),
  ]);

  if (wErr) {
    return { text: `❌ 월간 리포트 생성 실패: ${wErr.message}`, meta: { start, end, ym } };
  }
  if (uErr) {
    return { text: `❌ 월간 리포트 생성 실패: ${uErr.message}`, meta: { start, end, ym } };
  }

  const rows = workouts ?? [];
  const mode: GoalMode = options.goalMode ?? ((user as Pick<UserRow, "goal_mode"> | null)?.goal_mode === "muscle_gain" ? "muscle_gain" : "fat_loss");
  const userWeight = toNumber(options.userWeight ?? (user as Pick<UserRow, "weight"> | null)?.weight, 75);
  const sessions = rows.length;
  const totalVolume = rows.reduce((acc, r) => acc + toNumber(r.total_volume, 0), 0);
  const totalMinutes = rows.reduce((acc, r) => acc + toNumber(r.duration_minutes, 0), 0);
  const totalCalories = rows.reduce(
    (acc, r) => acc + calculateCalories(userWeight, toNumber(r.duration_minutes, 0), toNumber(r.average_rpe, 0)),
    0,
  );
  const avgRpe = (() => {
    const vals = rows.map((r) => toNumber(r.average_rpe, 0)).filter((v) => v > 0);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  })();

  // Active days
  const daySet = new Set<string>();
  for (const r of rows) if (r.workout_date) daySet.add(r.workout_date);
  const activeDays = daySet.size;

  // Upper/lower volume ratio (approx)
  let upperVol = 0;
  let lowerVol = 0;
  for (const r of rows) {
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

  // Weekly buckets within month (5 buckets)
  const volumeBuckets = [0, 0, 0, 0, 0];
  const minuteBuckets = [0, 0, 0, 0, 0];
  for (const r of rows) {
    const d = r.workout_date;
    if (!d || d.length < 10) continue;
    const day = Number(d.slice(8, 10));
    if (!Number.isFinite(day) || day <= 0) continue;
    const idx = Math.min(4, Math.floor((day - 1) / 7));
    volumeBuckets[idx] += toNumber(r.total_volume, 0);
    minuteBuckets[idx] += toNumber(r.duration_minutes, 0);
  }

  const best = scanBestWeights(rows);
  const streak = toNumber((user as Pick<UserRow, "current_streak"> | null)?.current_streak, 0);

  const squat1 = toNumber((user as Pick<UserRow, "estimated_1rm_squat"> | null)?.estimated_1rm_squat, 0);
  const bench1 = toNumber((user as Pick<UserRow, "estimated_1rm_bench"> | null)?.estimated_1rm_bench, 0);
  const dead1 = toNumber((user as Pick<UserRow, "estimated_1rm_dead"> | null)?.estimated_1rm_dead, 0);
  const total1 = Math.round(squat1 + bench1 + dead1);

  // Top names (by frequency)
  const freq: Record<string, number> = {};
  for (const r of rows) {
    for (const n of parseLogNames(r.logs)) {
      const k = n.toLowerCase();
      freq[k] = (freq[k] ?? 0) + 1;
    }
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const muscleAdvice = (() => {
    if (sessions === 0) return "지난달 기록이 없습니다. 이번 달은 주 3회만 먼저 복구하세요.";
    if (activeDays <= 5) return "활동일이 적습니다. 다음 달은 '기록하는 날'을 2일만 더 늘리세요.";
    if (avgRpe !== null && avgRpe >= 8.7) return "피로가 높습니다. 다음 달은 1주 델로드를 계획하세요.";
    return "좋습니다. 다음 달은 약한 섹터(상체/하체) 1개만 집중 보강하세요.";
  })();

  const fatAdvice = (() => {
    if (sessions === 0) return "지난달 감량 기록이 없습니다. 이번 달은 주 3회 유산소부터 복구하세요.";
    if (totalMinutes < 450) return `월 유산소 시간이 부족합니다. 다음 달은 최소 ${Math.max(0, 600 - Math.round(totalMinutes))}분 추가를 목표로 하세요.`;
    if (avgRpe !== null && avgRpe >= 8.7) return "강도가 높습니다. 다음 달은 1주간 회복 중심(Zone2 위주)으로 조정하세요.";
    return "좋습니다. 다음 달도 주간 150분 유산소를 유지하면 감량 추세가 안정됩니다.";
  })();

  const ratio = (() => {
    const denom = upperVol + lowerVol;
    if (denom <= 0) return null;
    const u = Math.round((upperVol / denom) * 100);
    const l = 100 - u;
    return { u, l };
  })();

  const lines: string[] = [];
  if (mode === "fat_loss") {
    lines.push(`*🗓 월간 감량 리포트* (${ym})`);
    lines.push(`기간: ${start} ~ ${end}`);
    lines.push("");
    lines.push(`- 활동: *${activeDays}일* | 세션: *${sessions}회*`);
    lines.push(`- 유산소 시간: *${Math.round(totalMinutes)}분*`);
    lines.push(`- 추정 소모 칼로리: *${Math.round(totalCalories).toLocaleString()} kcal*`);
    if (avgRpe !== null) lines.push(`- 평균 RPE: *${avgRpe.toFixed(1)}*`);
    lines.push(`- 주간 시간 흐름: \`${sparkline(minuteBuckets)}\``);
    lines.push(`- 현재 스트릭: ${streak}일`);
    if (top.length > 0) lines.push(`Top 기록: ${top.slice(0, 3).map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
    lines.push(`💬 *다음 액션*: ${fatAdvice}`);
  } else {
    lines.push(`*🗓 월간 리포트* (${ym})`);
    lines.push(`기간: ${start} ~ ${end}`);
    lines.push("");
    lines.push(`- 활동: *${activeDays}일* | 세션: *${sessions}회*`);
    lines.push(`- 총 볼륨: *${Math.round(totalVolume).toLocaleString()}kg*`);
    if (avgRpe !== null) lines.push(`- 평균 RPE: *${avgRpe.toFixed(1)}*`);
    lines.push(`- 주간 볼륨: \`${sparkline(volumeBuckets)}\``);
    if (ratio) lines.push(`- 상/하 비중(볼륨): 상체 ${ratio.u}% | 하체 ${ratio.l}%`);
    lines.push("");
    lines.push(`*Big3 월간 최고(세션 기준)*: S ${best.squat} | B ${best.bench} | D ${best.dead}`);
    lines.push(`*현재 3대 1RM*: Total ${total1} (S ${Math.round(squat1)}, B ${Math.round(bench1)}, D ${Math.round(dead1)})`);
    lines.push(`*현재 스트릭*: ${streak}일`);
    if (top.length > 0) lines.push(`Top 종목: ${top.slice(0, 3).map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
    lines.push(`💬 *다음 액션*: ${muscleAdvice}`);
  }

  return { text: lines.join("\n"), meta: { start, end, ym } };
}
