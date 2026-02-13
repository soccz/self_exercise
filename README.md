# Iron Quant

단일 사용자 운동 기록 앱입니다. 운동을 "자산"으로 보고, 최근 로그로 추천을 만듭니다.

- Web: 텍스트로 빠른 기록 (`스쿼트 100 5 5`)
- Telegram Bot: 채팅으로 기록/조회/내보내기/리마인더 설정
- DB: Supabase
- Deploy: Vercel (API Routes 사용)

## What You Get
- **자산(3대 1RM) 자동 반영**: 로그로 추정 1RM을 PR 기준으로 자동 업데이트
- **기록 UX**: 마지막 기록 불러오기 + 템플릿 + 저장 토스트
- **텔레그램 명령어**: `/help`, `/status`, `/rec`, `/undo`, `/edit`, `/export`, `/remind`
- **리마인더 자동화(무료)**: GitHub Actions Cron -> `/api/cron/remind`
- **오프라인 임시저장**: 네트워크 끊겨도 큐에 저장 후 온라인 시 자동 반영
- **최소 보안(App Lock)**: `APP_SECRET`로 write API 잠금(로그인 없이)

## Quick Start (Local)
```bash
npm install
npm run dev
```

## Setup
1. Supabase 준비: `DB_SETUP.md`
2. 배포: `DEPLOY_GUIDE.md`

## Env Vars
템플릿: `.env.example`

- `NEXT_PUBLIC_USE_MOCK`: `true`면 mock, `false`면 Supabase
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only; 권장)
- `APP_SECRET` (권장, 공개 배포 시)
- `TELEGRAM_BOT_TOKEN` (선택)
- `TELEGRAM_WEBHOOK_SECRET` (권장)
- `APP_URL` (텔레그램 버튼 링크)

## Telegram Commands
도움말: `/help` 또는 `/start`

- `/status` 또는 `자산`: 자산 리포트
- `/rec` 또는 `추천`: 추천
- `/name 홍길동`: 이름 변경
- `/last`: 마지막 운동 보기
- `/undo` (또는 `/undo!`): 방금 기록 되돌리기(최근 30분 / 강제)
- `/edit 스쿼트 105 5 5`: 방금 기록 수정(최근 30분)
- `/export csv|json`: 데이터 내보내기(파일 전송)
- `/recompute`: 1RM(3대) 재계산
- `/remind status|on|off|time 21:00|tz Asia/Seoul|test`: 리마인더 설정/테스트

## Reminder (GitHub Actions)
리마인더는 `.github/workflows/telegram-reminder.yml`로 10분마다 호출됩니다.
전송 여부는 Supabase의 설정(`telegram_remind_*`)과 중복 방지(`telegram_last_reminded_date`)로 결정합니다.

## Security Notes
- `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`은 **절대 Git에 커밋하지 마세요**.
- 공개 배포면 최소 `APP_SECRET`를 설정하세요(임의 요청으로 DB 변경 방지).

