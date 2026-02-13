import { NextResponse } from "next/server";
import { buildSessionCookie, isAppLockEnabled } from "@/lib/server/app_lock";
import { newRequestId } from "@/lib/server/request_id";
import { rateLimit } from "@/lib/server/rate_limit";

function getClientKey(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  const xr = req.headers.get("x-real-ip");
  if (xr) return xr.trim();
  return "unknown";
}

export async function POST(req: Request) {
  const requestId = newRequestId();
  if (!isAppLockEnabled()) {
    const res = NextResponse.json({ ok: true, locked: false });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const rl = rateLimit(`session:post:${getClientKey(req)}`, 30, 60_000);
  if (!rl.ok) {
    const res = NextResponse.json({ error: "Rate limited" }, { status: 429 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", "0");
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const body = await req.json().catch(() => ({} as unknown));
  const secret = (body as { secret?: unknown })?.secret;
  if (typeof secret !== "string" || secret.length === 0) {
    const res = NextResponse.json({ error: "Missing secret" }, { status: 400 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  if (secret !== process.env.APP_SECRET) {
    const res = NextResponse.json({ error: "Invalid secret" }, { status: 401 });
    res.headers.set("x-request-id", requestId);
    res.headers.set("x-ratelimit-remaining", String(rl.remaining));
    res.headers.set("x-ratelimit-reset", String(rl.resetAt));
    return res;
  }

  const res = NextResponse.json({ ok: true, locked: true });
  const cookie = buildSessionCookie();
  if (cookie) {
    res.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-ratelimit-remaining", String(rl.remaining));
  res.headers.set("x-ratelimit-reset", String(rl.resetAt));
  return res;
}
