import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { requireAppSession } from "@/lib/server/app_lock";
import { recomputeBig3Prs } from "@/lib/server/prs";

function getClientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const requestId = newRequestId();
  const session = requireAppSession(_req);
  if (!session.ok) {
    const res = NextResponse.json({ error: session.error }, { status: session.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`workouts:delete:${getClientKey(_req)}`, 120, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", "0");
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();

  const { error } = await supabase
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", SINGLE_PLAYER_ID);

  if (error) {
    const res = NextResponse.json({ error: error.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  try {
    await recomputeBig3Prs(supabase, SINGLE_PLAYER_ID);
  } catch (e) {
    console.error("PR recompute failed:", e);
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-ratelimit-remaining", String(rl.remaining));
  res.headers.set("x-ratelimit-reset", String(rl.resetAt));
  return res;
}
