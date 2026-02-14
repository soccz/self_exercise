# Error Notes (Iron Quant) - 2026-02-14

Workspace root (absolute): `/mnt/20t/자기관리/final/exercise_app/real`

This file is a snapshot of what we found, fixed, and what is still pending.

## 1) Local Build/Type/Lint Status

### A. ESLint
- Initially failed due to `@typescript-eslint/no-explicit-any` and unused vars in:
  - `src/app/api/debug/deployment/route.ts`
  - `src/app/api/telegram/route.ts`
  - `src/lib/quant/coach.ts`
  - `src/lib/quant/market.ts`
- Fixed by removing `any`, adding minimal guards/types.

### B. TypeScript (strict)
- We run `tsc --noEmit` for correctness.
- `tsconfig.json` now excludes `.next/` so `npm run typecheck` works even on a fresh clone (no TS6053 missing `.next/types`).

### C. Next build (Turbopack issue)
- `next build` with Turbopack previously crashed:
  - `Operation not permitted (os error 1)` related to "binding to a port" while processing CSS (Turbopack).
- Fix applied: force webpack builds.
  - `package.json` script `build` changed to `next build --webpack`.

## 2) GitHub Actions (Cron)

### A. Workflows
- Files:
  - `.github/workflows/telegram-reminder.yml`
  - `.github/workflows/telegram-briefing.yml`
- Both workflows were updated to:
  - Accept either `CRON_BASE_URL` (recommended, like `https://<domain>`) or legacy `CRON_ENDPOINT`.
  - Normalize whitespace/CRLF in secrets.
  - Use `curl -fsS` and `tee` to print the JSON response body into logs (so we can see exact server error/skip reason).

### B. Reminder failing but briefing works
Most likely causes (need actual Actions log JSON to confirm):
- Wrong URL composition (secret contains full endpoint but workflow appends again, producing 404).
- `APP_SECRET` mismatch (GitHub secret != Vercel env) -> 401.
- Vercel missing `TELEGRAM_BOT_TOKEN` or Supabase env -> 500.
- Supabase missing reminder patch columns -> 500 when updating `telegram_last_reminded_date`.
- Telegram send failing -> now returns 502 (see endpoint changes below).

## 3) Web App: Profile Save Only Changes Name

Symptom reported:
- Clicking "Save" in Profile updates only `full_name`; numeric fields (weight/muscle/1RM/etc.) don't change.

Likely root causes (ranked):
1. Input parsing: fields like `75kg`, `75,5`, `1,234` were parsed as `undefined` and thus omitted.
2. App lock: when `APP_SECRET` is enabled and the session is locked, PATCH should return 401 "App locked".
3. Supabase/RLS/env misconfig: `/api/user` PATCH fails (500) but UI shows only partial changes.

Fix applied:
- `src/components/profile/ProfileEditor.tsx`
  - More robust numeric parsing (accepts `kg`, commas, etc.).
  - If a numeric field is non-empty but cannot be parsed, show a toast listing the bad fields and abort the save.

Additional security correctness fix:
- `src/lib/data/supabase_service.ts`
  - If server API responds "App locked", do NOT fall back to direct Supabase writes. (Otherwise `APP_SECRET` can be bypassed when anon grants exist.)

## 4) API/Server Behavior Changes

### A. Safer App Lock comparisons
- `src/lib/server/app_lock.ts`
  - `crypto.timingSafeEqual` can throw if lengths differ.
  - Now we treat length mismatch as invalid session/header instead of throwing 500.

### B. Cron endpoints now fail loudly if Telegram send fails
- `src/app/api/cron/remind/route.ts`
- `src/app/api/cron/briefing/route.ts`
Changes:
- Telegram `sendMessage` now checks HTTP response; if it fails, endpoint returns:
  - `502 Telegram send failed`
- Reminder endpoint updates `telegram_last_reminded_date` only after a successful send; if DB update fails, it returns 500.

### C. Single-player enforcement on workout create
- `src/app/api/workouts/route.ts`
  - Enforces `user_id = me` even if client sends `user_id`.

## 5) Parser Improvement (Quality)

### Multi-word exercise names
- `src/lib/quant/engine.ts`
  - `parseWorkoutText()` now supports multi-word exercise names by taking the last 3 tokens as `weight reps sets`.
  - This fixes cases like `벤치 프레스 60 10 5`.

## 6) Current Modified/Noted Files

Modified (not committed):
- `.github/workflows/telegram-briefing.yml`
- `.github/workflows/telegram-reminder.yml`
- `package.json`, `package-lock.json`
- `src/app/api/cron/briefing/route.ts`
- `src/app/api/cron/remind/route.ts`
- `src/app/api/debug/deployment/route.ts`
- `src/app/api/telegram/route.ts`
- `src/app/api/workouts/route.ts`
- `src/components/profile/ProfileEditor.tsx`
- `src/lib/data/supabase_service.ts`
- `src/lib/quant/coach.ts`
- `src/lib/quant/engine.ts`
- `src/lib/quant/market.ts`
- `src/lib/server/app_lock.ts`

Untracked:
- `improvements.md`
- `repro_parse.ts`

## 7) When You Resume: Minimal Checks

### A. Web profile save validation
1. In browser, open `https://<domain>/api/user` and confirm numeric fields change after saving.
2. If 401 "App locked": unlock via `/profile` lock UI (POST `/api/session`) or send `x-app-secret` for scripts.
3. If 500: open `https://<domain>/api/debug/deployment` and read `errors`.
   - Note: debug endpoints are protected by app lock when `APP_SECRET` is enabled; unlock first if you get 401 "App locked".

### B. GitHub Actions reminder debug
1. Copy the Actions run log JSON response from the curl step.
2. Also verify the printed `POST <url>` line is exactly `.../api/cron/remind`.
