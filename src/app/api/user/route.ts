import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { requireAppSession } from "@/lib/server/app_lock";
import { normalizeGoalMode } from "@/lib/goal_mode";

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

  // Ensure row exists (do not overwrite existing profile fields).
  await supabase
    .from("users")
    .upsert({ id: SINGLE_PLAYER_ID }, { onConflict: "id" });

  const { data, error } = await supabase
    .from("users")
    .select(
      "id, full_name, goal_mode, weight, muscle_mass, fat_percentage, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead, level, xp, current_streak",
    )
    .eq("id", SINGLE_PLAYER_ID)
    .single();

  if (error) {
    const res = NextResponse.json({ error: error.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const res = NextResponse.json({ user: data });
  res.headers.set("x-request-id", requestId);
  return res;
}

export async function PATCH(req: Request) {
  const requestId = newRequestId();
  const session = requireAppSession(req);
  if (!session.ok) {
    const res = NextResponse.json({ error: session.error }, { status: session.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`user:patch:${getClientKey(req)}`, 60, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", "0");
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const supabase = getSupabaseAdmin();
  const patch = await req.json();

  // Allow-list to avoid accidentally writing unexpected keys.
  const allowed = [
    "full_name",
    "goal_mode",
    "weight",
    "muscle_mass",
    "fat_percentage",
    "estimated_1rm_squat",
    "estimated_1rm_bench",
    "estimated_1rm_dead",
    "level",
    "xp",
    "current_streak",
  ] as const;

  const safePatch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      safePatch[key] = patch[key];
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "goal_mode")) {
    safePatch.goal_mode = normalizeGoalMode((patch as Record<string, unknown>).goal_mode);
  }

  const { error } = await supabase
    .from("users")
    .upsert({ id: SINGLE_PLAYER_ID, ...safePatch }, { onConflict: "id" });

  if (error) {
    const res = NextResponse.json({ error: error.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-ratelimit-remaining", String(rl.remaining));
  res.headers.set("x-ratelimit-reset", String(rl.resetAt));
  return res;
}
