# 🗄️ Supabase Setup Guide for Single Player

**로그인 없는** 단일 사용자 앱 기준 DB 연결 절차입니다.

## 1. Project Creation
1. [Supabase Dashboard](https://supabase.com/dashboard) 접속 → `New Project`.
2. Name: `iron-quant`, Password: (기억하기 쉬운 것).
3. Region: `Seoul` (가까운 곳).

## 2. Execute SQL
1. 좌측 메뉴 `SQL Editor` 클릭.
2. `exercise_app/real/supabase/schema.sql` 파일의 내용을 복사해서 붙여넣기.
3. `Run` 버튼 클릭. (테이블 3개 생성됨)

## 2.5. (선택) 텔레그램 리마인더 컬럼 추가
리마인더 기능을 쓰려면 Supabase에 컬럼을 한 번 추가해야 합니다.

1. SQL Editor에서 `supabase/telegram_reminder_patch.sql` 실행

> 참고: 이미 실행했어도 `IF NOT EXISTS`라 안전합니다.

## 3. Connect to App
1. 좌측 메뉴 `Project Settings` (톱니바퀴) → `API`.
2. `Project URL`, `anon public key`, `service_role key` 확인
3. 프로젝트 루트에 `.env.local` 파일 생성 (로컬 개발용):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_anon_public_key>

# server-only (절대 NEXT_PUBLIC로 노출하지 않기)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
```

4. **완료!** 이제 앱을 실행하면 됩니다.

## 보안 메모
- 이 프로젝트는 서버(API Routes)가 `service_role`로 DB를 대행하는 구조입니다. (RLS를 억지로 풀 필요 없음)
- `supabase/grants.sql`로 anon 권한을 여는 방식은 공개 배포에서 권장하지 않습니다.
