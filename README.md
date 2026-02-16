# Iron Quant 사용자 가이드

운동 초보도 바로 쓸 수 있는 단일 사용자 운동 기록 앱입니다.  
웹과 텔레그램을 함께 써서 기록을 빠르게 남기고, 목표(감량/근육)에 맞는 추천을 받는 데 초점을 맞췄습니다.

## 1. 이 앱으로 할 수 있는 것
- 목표 모드 전환: `감량(fat_loss)` / `근육(muscle_gain)`
- 텍스트 기록: `스쿼트 100 5 5`, `러닝머신 30 1 1`
- 오늘 추천 자동 제공 (모드 기반)
- 텔레그램 고정 버튼 사용:
  - `기록` 또는 `유산소 기록`
  - `오늘 추천`
  - `마지막 수정`
  - `상태`
  - `도움말`
  - `📱 앱 열기`
- 오프라인 임시저장 + 온라인 복구 동기화
- CSV/JSON 내보내기

## 2. 빠른 시작 (로컬)
```bash
npm install
npm run dev
```
브라우저에서 앱을 열고 바로 기록을 시작할 수 있습니다.

## 3. 목표 모드 사용법
`내 정보` 화면에서 목표 모드를 바꿀 수 있습니다.

- `감량(fat_loss)`:
  - 홈 카드에 주간 유산소 진행률/칼로리 중심 표시
  - 유산소 템플릿 중심 추천
- `근육(muscle_gain)`:
  - 1RM/운동 자산 중심 표시
  - 중량/볼륨 중심 추천

## 4. 웹 앱 사용법
### 홈
- 현재 모드에 맞는 핵심 지표와 오늘 추천을 확인합니다.

### 기록
- 예시 입력:
  - 근육: `스쿼트 100 5 5`, `벤치 60x10x5 @9`
  - 감량: `러닝머신 30 1 1`, `빠르게걷기 25 1 1`
- 여러 줄 입력도 가능합니다.

### 분석
- 최근 기록, 주간 요약, 내보내기(CSV/JSON)를 확인합니다.

### 내 정보
- 이름/체중/체성분/1RM 및 목표 모드를 수정합니다.
- 동기화 상태(`저장됨/동기화중/완료/충돌/실패`)를 확인하고 재시도할 수 있습니다.

## 5. 텔레그램 사용법
### 먼저 할 일
- 봇에 `/start` 또는 `/help` 입력

### 고정 버튼(권장)
명령어를 외우지 않아도 버튼으로 대부분 작업이 됩니다.

### 주요 명령어
- `/status` 또는 `자산`: 현재 상태 리포트
- `/rec` 또는 `추천`: 오늘 추천
- `/mode fat|muscle` 또는 `mode fat|muscle`: 모드 전환
- `/last`: 마지막 운동 조회
- `/edit ...`: 마지막 운동 수정
- `/undo` 또는 `/undo!`: 마지막 운동 삭제
- `/export csv|json`: 내보내기
- `/remind ...`: 리마인더 설정
- `/debug`: 연결 상태 점검

## 6. 배포 요약 (Vercel)
이 프로젝트는 정적 배포가 아니라 **Vercel + API Routes** 기준입니다.

1. Supabase 준비 후 `supabase/schema.sql` 실행
2. 기존 DB라면 아래 패치 추가 실행
   - `supabase/telegram_reminder_patch.sql`
   - `supabase/goal_mode_patch.sql`
3. Vercel 환경변수 설정
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_SECRET`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `APP_URL`
4. Telegram webhook를 현재 배포 도메인으로 설정

상세 절차는 `DEPLOY_GUIDE.md`, DB는 `DB_SETUP.md`를 참고하세요.

## 7. 개인정보/보안 안내 (중요)
- 민감정보(토큰/키/시크릿)는 절대 Git에 커밋하지 마세요.
- 특히 아래 값은 저장소에 올리면 안 됩니다.
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `TELEGRAM_BOT_TOKEN`
  - `TELEGRAM_WEBHOOK_SECRET`
  - `APP_SECRET`
- 공개 배포 시 `APP_SECRET` 잠금을 반드시 사용하세요.

## 8. 문제 해결 체크리스트
### 텔레그램 버튼/명령이 안 먹을 때
1. `/debug`로 연결 상태 확인
2. webhook URL이 현재 배포 도메인인지 확인
3. Vercel 최신 배포가 반영됐는지 확인

### 저장이 안 될 때
1. `APP_SECRET` 잠금 해제 여부 확인
2. Supabase env 설정 확인
3. 오프라인 상태면 `내 정보`에서 동기화 상태 확인 후 재시도

---
필요하면 다음 단계로, 이 README를 기준으로 `처음 설치하는 사람용 5분 체크리스트`도 별도 파일로 만들어드릴 수 있습니다.
