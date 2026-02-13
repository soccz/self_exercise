import "server-only";

import crypto from "crypto";

export const APP_COOKIE_NAME = "iq_session";

function base64url(input: Buffer | string) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function hmac(secret: string, data: string) {
  return base64url(crypto.createHmac("sha256", secret).update(data).digest());
}

export function isAppLockEnabled(): boolean {
  return Boolean(process.env.APP_SECRET);
}

function getCookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

export function buildSessionCookie(): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    sameSite: "lax";
    secure: boolean;
    path: string;
    maxAge: number;
  };
} | null {
  const secret = process.env.APP_SECRET;
  if (!secret) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = `${now}`;
  const sig = hmac(secret, payload);
  const value = `${payload}.${sig}`;

  return {
    name: APP_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    },
  };
}

export function hasValidSession(req: Request): boolean {
  const secret = process.env.APP_SECRET;
  if (!secret) return true; // lock disabled

  const cookie = getCookieValue(req, APP_COOKIE_NAME);
  if (!cookie) return false;

  const [payload, sig] = cookie.split(".");
  if (!payload || !sig) return false;
  const expected = hmac(secret, payload);
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export function requireAppSession(
  req: Request,
): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.APP_SECRET;
  if (!secret) return { ok: true };

  // Allow header-based auth for scripts/curl
  const provided = req.headers.get("x-app-secret");
  if (provided && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return { ok: true };
  }

  if (hasValidSession(req)) return { ok: true };

  return { ok: false, status: 401, error: "App locked" };
}
