import { NextResponse } from "next/server";
import { getSupabaseAdmin, SINGLE_PLAYER_ID } from "@/lib/server/supabase_admin";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";
import { requireAppSession } from "@/lib/server/app_lock";

function getClientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

export async function GET(req: Request) {
  const requestId = newRequestId();
  const session = requireAppSession(req);
  if (!session.ok) {
    const res = NextResponse.json({ error: session.error }, { status: session.status });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`export:get:${getClientKey(req)}`, 30, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";

  const supabase = getSupabaseAdmin();
  const [{ data: user, error: userError }, { data: workouts, error: wError }] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, full_name, weight, muscle_mass, fat_percentage, estimated_1rm_squat, estimated_1rm_bench, estimated_1rm_dead, level, xp, current_streak",
      )
      .eq("id", SINGLE_PLAYER_ID)
      .single(),
    supabase
      .from("workouts")
      .select("id, workout_date, title, total_volume, average_rpe, duration_minutes, logs, feedback, mood, created_at")
      .eq("user_id", SINGLE_PLAYER_ID)
      .order("workout_date", { ascending: false }),
  ]);

  if (userError) {
    const res = NextResponse.json({ error: userError.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }
  if (wError) {
    const res = NextResponse.json({ error: wError.message }, { status: 500 });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const payload = { exported_at: new Date().toISOString(), user, workouts: workouts ?? [] };

  if (format === "json") {
    const res = NextResponse.json(payload);
    res.headers.set("x-request-id", requestId);
    res.headers.set("content-disposition", `attachment; filename="iron-quant-export.json"`);
    return res;
  }

  const lines: string[] = [];
  lines.push(
    [
      "id",
      "workout_date",
      "title",
      "total_volume",
      "average_rpe",
      "duration_minutes",
      "mood",
      "feedback",
      "created_at",
      "logs_json",
    ].join(","),
  );
  for (const w of workouts ?? []) {
    lines.push(
      [
        csvEscape(w.id),
        csvEscape(w.workout_date),
        csvEscape(w.title),
        csvEscape(w.total_volume),
        csvEscape(w.average_rpe),
        csvEscape(w.duration_minutes),
        csvEscape(w.mood ?? ""),
        csvEscape(w.feedback ?? ""),
        csvEscape(w.created_at ?? ""),
        csvEscape(JSON.stringify(w.logs ?? [])),
      ].join(","),
    );
  }
  const csv = lines.join("\n");

  const res = new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="iron-quant-workouts.csv"`,
      "x-request-id": requestId,
    },
  });
  return res;
}

