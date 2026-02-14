import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase_database";

type WorkoutRow = Database["public"]["Tables"]["workouts"]["Row"];

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

export async function buildWeeklyTelegramReport(
  supabase: SupabaseClient<Database>,
  userId: string,
  timeZone: string,
): Promise<{ text: string; meta: { start: string; end: string } }> {
  const end = dateInTz(timeZone);
  const start = addDays(end, -6);
  const days = Array.from({ length: 7 }, (_v, i) => addDays(start, i));

  const { data: rows, error } = await supabase
    .from("workouts")
    .select("workout_date, total_volume, average_rpe, logs, title")
    .eq("user_id", userId)
    .gte("workout_date", start)
    .lte("workout_date", end)
    .order("workout_date", { ascending: true });

  if (error) {
    return {
      text: `❌ 주간 리포트 생성 실패: ${error.message}`,
      meta: { start, end },
    };
  }

  const byDay: Record<string, { count: number; volume: number; rpeSum: number; rpeN: number; names: string[] }> = {};
  for (const d of days) byDay[d] = { count: 0, volume: 0, rpeSum: 0, rpeN: 0, names: [] };

  for (const r of (rows ?? []) as Pick<WorkoutRow, "workout_date" | "total_volume" | "average_rpe" | "logs" | "title">[]) {
    const d = r.workout_date ?? "";
    if (!byDay[d]) continue;
    byDay[d].count += 1;
    const v = toNumber(r.total_volume, 0);
    byDay[d].volume += v;
    const rpe = toNumber(r.average_rpe, 0);
    if (rpe > 0) {
      byDay[d].rpeSum += rpe;
      byDay[d].rpeN += 1;
    }
    byDay[d].names.push(...parseLogNames(r.logs));
    if (typeof r.title === "string" && r.title.trim()) byDay[d].names.push(r.title.trim());
  }

  const volumes = days.map((d) => byDay[d]?.volume ?? 0);
  const sessions = days.reduce((acc, d) => acc + (byDay[d]?.count ?? 0), 0);
  const activeDays = days.reduce((acc, d) => acc + ((byDay[d]?.count ?? 0) > 0 ? 1 : 0), 0);
  const totalVolume = volumes.reduce((a, b) => a + b, 0);
  const avgRpeAll = (() => {
    const sum = days.reduce((acc, d) => acc + (byDay[d]?.rpeSum ?? 0), 0);
    const n = days.reduce((acc, d) => acc + (byDay[d]?.rpeN ?? 0), 0);
    if (n <= 0) return null;
    return sum / n;
  })();

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

  const advice = (() => {
    if (activeDays === 0) return "이번 주 기록이 없습니다. 다음 주는 1회라도 기록하는 게 최우선입니다.";
    if (activeDays <= 2) return "거래일이 적습니다. 다음 주는 주 3회(분할/전신 아무거나)만 맞추면 급상승합니다.";
    if (avgRpeAll !== null && avgRpeAll >= 8.7) return "피로가 높습니다. 다음 주는 1일 휴식 또는 델로드(90%)를 섞으세요.";
    return "좋습니다. 다음 주는 가장 약한 섹터(상체/하체) 1개만 더 보강하세요.";
  })();

  const lines: string[] = [];
  lines.push(`*📅 주간 리포트* (${start} ~ ${end})`);
  lines.push("");
  lines.push(`- 활동: *${activeDays}일* / 7일`);
  lines.push(`- 세션: *${sessions}회*`);
  lines.push(`- 총 볼륨: *${Math.round(totalVolume).toLocaleString()}kg*`);
  if (avgRpeAll !== null) lines.push(`- 평균 RPE: *${avgRpeAll.toFixed(1)}*`);
  lines.push(`- 볼륨 스파크: \`${sparkline(volumes)}\``);
  if (top.length > 0) lines.push(`- Top: ${top.map((t) => `\`${t}\``).join(", ")}`);
  lines.push("");
  lines.push(`💬 *다음 액션*: ${advice}`);

  return { text: lines.join("\n"), meta: { start, end } };
}

