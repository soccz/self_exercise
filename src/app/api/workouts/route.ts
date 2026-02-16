import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { requireAppSession } from "@/lib/server/app_lock";
import { applyBig3Prs, estimateBig3FromLogs } from "@/lib/server/prs";

function getClientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

export async function GET() {
  const requestId = newRequestId();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("workouts")
    .select("id, user_id, routine_id, workout_date, title, total_volume, average_rpe, duration_minutes, estimated_calories, cardio_distance_km, cardio_avg_speed_kph, cardio_avg_incline_pct, avg_heart_rate, logs, feedback, mood, created_at")
    .eq("user_id", SINGLE_PLAYER_ID)
    .order("workout_date", { ascending: false });

  if (error) {
    const res = NextResponse.json({ error: error.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const res = NextResponse.json({ workouts: data ?? [] });
  res.headers.set("x-request-id", requestId);
  return res;
}

export async function POST(req: Request) {
  const requestId = newRequestId();
  const session = requireAppSession(req);
  if (!session.ok) {
    const res = NextResponse.json({ error: session.error }, { status: session.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`workouts:post:${getClientKey(req)}`, 120, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", "0");
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { error } = await supabase
    .from("workouts")
    // Enforce single-player user id (do not allow client override).
    .insert({ ...(body as Record<string, unknown>), user_id: SINGLE_PLAYER_ID });

  if (error) {
    const res = NextResponse.json({ error: error.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const logs = Array.isArray((body as { logs?: unknown })?.logs)
    ? ((body as { logs?: unknown }).logs as unknown[])
    : [];
  // Only update PRs when we actually have typed logs from the UI parser.
  const typedLogs = logs
    .filter((l): l is { name: string; weight: number; reps: number; sets: number } => {
      if (typeof l !== "object" || l === null) return false;
      const r = l as Record<string, unknown>;
      return (
        typeof r["name"] === "string" &&
        typeof r["weight"] === "number" &&
        typeof r["reps"] === "number" &&
        typeof r["sets"] === "number"
      );
    })
    .map((l) => ({ ...l }));
  try {
    if (typedLogs.length > 0) {
      await applyBig3Prs(supabase, SINGLE_PLAYER_ID, estimateBig3FromLogs(typedLogs));
    }
  } catch (e) {
    // Non-fatal: workout is already saved.
    console.error("PR update failed:", e);
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-ratelimit-remaining", String(rl.remaining));
  res.headers.set("x-ratelimit-reset", String(rl.resetAt));
  return res;
}
