# Deployment Guide (Vercel)

이 프로젝트는 `Next.js + API Routes(텔레그램 webhook)`를 사용하므로, **GitHub Pages(정적 export)** 대신 **Vercel 배포**를 기준으로 설명합니다.

## 1. Supabase 준비
1. Supabase에서 프로젝트 생성
2. `SQL Editor`에서 `supabase/schema.sql` 실행
3. `Project Settings -> API`에서 아래 값 확인
- `Project URL`
- `anon public key`
- `service_role key` (server-only; Telegram webhook write용)

## 2. Vercel 배포
1. Vercel에서 GitHub 저장소 `soccz/self_exercise` Import
2. `Environment Variables`에 아래 추가
- `NEXT_PUBLIC_USE_MOCK=false`
- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
- `SUPABASE_URL=...` (보통 Project URL과 동일)
- `SUPABASE_SERVICE_ROLE_KEY=...` (server-only)

배포 후 앱 URL을 확인합니다. (예: `https://self-exercise.vercel.app`)

## 3. Telegram Bot 연동 (선택)
이 프로젝트는 `src/app/api/telegram/route.ts`에 webhook 엔드포인트가 있습니다.

1. BotFather에서 봇 생성 후 `TELEGRAM_BOT_TOKEN` 발급
2. Vercel env에 추가
- `TELEGRAM_BOT_TOKEN=...`
- `APP_URL=https://<your-vercel-domain>`
- (권장) `TELEGRAM_WEBHOOK_SECRET=랜덤문자열`
3. webhook 설정
- URL: `https://<your-vercel-domain>/api/telegram`
- secret_token: `TELEGRAM_WEBHOOK_SECRET`와 동일하게 (권장)

예시(curl):
```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d "url=https://<your-vercel-domain>/api/telegram" \
  -d "secret_token=$TELEGRAM_WEBHOOK_SECRET"
```

## 3.5 App Lock (권장, 공개 배포 시)
로그인 없이 단일 사용자로 쓰는 구조라서, 서버가 `service_role`로 쓰기를 대행합니다.
공개 URL에서 임의 요청으로 데이터가 변하는 걸 막고 싶으면 아래를 설정하세요.

1. Vercel env에 추가
- `APP_SECRET=랜덤문자열`
2. 앱에서 해제
- `/profile` 화면 오른쪽 상단의 자물쇠 버튼 -> `APP_SECRET` 입력

## 3.6 Telegram 리마인더(무료, GitHub Actions)
매일 정해진 시간에 "오늘 운동 기록 없음" 리마인더를 텔레그램으로 보냅니다.

1. Supabase에 컬럼 추가(1회)
- Supabase `SQL Editor`에서 `supabase/telegram_reminder_patch.sql` 실행

2. 텔레그램에서 리마인더 켜기
- `/remind on`
- (선택) `/remind time 21:00`
- (선택) `/remind tz Asia/Seoul`

3. GitHub Actions Secrets 추가
- GitHub 레포 `Settings -> Secrets and variables -> Actions`
- `APP_SECRET`: Vercel env의 `APP_SECRET`와 동일
- `CRON_ENDPOINT`: `https://<your-vercel-domain>/api/cron/remind`

4. 스케줄 확인
- `.github/workflows/telegram-reminder.yml`은 10분마다 실행되며, API가 DB 설정(time/tz/중복방지)을 보고 실제 전송 여부를 결정합니다.
- 테스트: 텔레그램에서 `/remind test`

## 4. 동작 확인
- 웹: 하단 `기록` 버튼 -> 저장 -> `/analytics`에서 최근 운동 확인
- 텔레그램: `/status`, `/rec`, 또는 `스쿼트 100 5 5` 같은 텍스트 기록 입력

## 보안 메모
- 현재는 단일 사용자(No Auth) 전제로 설계되어 있습니다.
- 공개 배포에서 데이터 보호가 필요하면 최소 `APP_SECRET` 잠금 또는 Auth + RLS를 적용하세요.
