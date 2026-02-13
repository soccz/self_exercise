import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase_database";

function epley1rm(weight: number, reps: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  // Epley: 1RM = w * (1 + reps/30). Clamp reps to reduce absurd estimates.
  const r = Math.min(reps, 12);
  return weight * (1 + r / 30);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function isSquat(name: string): boolean {
  const n = normalize(name);
  return n.includes("squat") || n.includes("스쿼트");
}

function isBench(name: string): boolean {
  const n = normalize(name);
  return n.includes("bench") || n.includes("벤치");
}

function isDeadlift(name: string): boolean {
  const n = normalize(name);
  return n.includes("dead") || n.includes("데드");
}

export type Big3Prs = { squat?: number; bench?: number; dead?: number };

export type LogLike = { name: string; weight: number; reps: number; sets: number; rpe?: number };

export function estimateBig3FromLogs(logs: LogLike[]): Big3Prs {
  let squat = 0;
  let bench = 0;
  let dead = 0;

  for (const l of logs) {
    const est = epley1rm(l.weight, l.reps);
    if (est <= 0) continue;
    if (isSquat(l.name)) squat = Math.max(squat, est);
    if (isBench(l.name)) bench = Math.max(bench, est);
    if (isDeadlift(l.name)) dead = Math.max(dead, est);
  }

  const out: Big3Prs = {};
  if (squat > 0) out.squat = Math.round(squat);
  if (bench > 0) out.bench = Math.round(bench);
  if (dead > 0) out.dead = Math.round(dead);
  return out;
}

export async function applyBig3Prs(
  supabase: SupabaseClient<Database>,
  userId: string,
  prs: Big3Prs,
): Promise<void> {
  if (!prs.squat && !prs.bench && !prs.dead) return;

  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  const { data: user, error } = await supabase
    .from("users")
    .select("id, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead")
    .eq("id", userId)
    .single();
  if (error) throw error;

  const next = {
    estimated_1rm_squat: Math.max(toNumber(user?.estimated_1rm_squat), prs.squat ?? 0),
    estimated_1rm_bench: Math.max(toNumber(user?.estimated_1rm_bench), prs.bench ?? 0),
    estimated_1rm_dead: Math.max(toNumber(user?.estimated_1rm_dead), prs.dead ?? 0),
  };

  await supabase
    .from("users")
    .upsert({ id: userId, ...next }, { onConflict: "id" });
}

export async function recomputeBig3Prs(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("workouts")
    .select("logs")
    .eq("user_id", userId)
    .order("workout_date", { ascending: false })
    .limit(250);
  if (error) throw error;

  let squat = 0;
  let bench = 0;
  let dead = 0;

  for (const row of data ?? []) {
    const raw = row.logs;
    if (!Array.isArray(raw)) continue;
    for (const l of raw) {
      if (typeof l !== "object" || l === null) continue;
      const name = (l as { name?: unknown }).name;
      const reps = (l as { reps?: unknown }).reps;
      const weight = (l as { weight?: unknown }).weight;
      if (typeof name !== "string") continue;
      const est = epley1rm(Number(weight), Number(reps));
      if (est <= 0) continue;
      if (isSquat(name)) squat = Math.max(squat, est);
      if (isBench(name)) bench = Math.max(bench, est);
      if (isDeadlift(name)) dead = Math.max(dead, est);
    }
  }

  await supabase
    .from("users")
    .upsert(
      {
        id: userId,
        estimated_1rm_squat: Math.round(squat),
        estimated_1rm_bench: Math.round(bench),
        estimated_1rm_dead: Math.round(dead),
      },
      { onConflict: "id" },
    );
}
