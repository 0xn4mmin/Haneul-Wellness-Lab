# Supabase + Vercel 셋업 가이드

호스팅 구성: **프론트엔드 → Vercel**, **백엔드(DB·인증·스토리지·실시간) → Supabase**,
(나중에 OCR 워커가 필요하면 → Railway). 자세한 설계는 [`BACKEND_PLAN.md`](BACKEND_PLAN.md).

> 환경 변수가 없으면 앱은 **목업 데이터**로 그대로 동작합니다. 아래를 마치면 실제 백엔드로 전환됩니다.

---

## 1. Supabase 프로젝트 생성

1. <https://supabase.com> 에서 프로젝트 생성(리전: 서울 권장).
2. **Project Settings → API** 에서 `Project URL` 과 `anon public` 키 복사.
3. 로컬 `.env` 작성:

   ```bash
   cp .env.example .env
   # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 채우기
   ```

## 2. 스키마 적용 (택 1)

**A. Supabase CLI (권장)**
```bash
npm i -g supabase
supabase link --project-ref <YOUR-PROJECT-REF>
supabase db push          # supabase/migrations/*.sql 적용
```

**B. 대시보드**
- **SQL Editor** 에 `supabase/migrations/20260625120000_init.sql` 전체를 붙여넣고 실행.
- 이어서 `supabase/seed.sql` 도 실행(시드 함수 `seed_demo_data` 등록).

생성되는 것: 테이블 + **RLS 정책(지표별 공개/비공개 강제)** + 스토리지 버킷
(`avatars` 공개 / `inbody-results` 비공개) + 채팅 Realtime + 신규 가입 시 프로필 자동 생성 트리거.

## 3. 데모 데이터 주입

1. 앱에서 회원가입(또는 대시보드 **Authentication → Add user**).
2. 로그인 상태로 **SQL Editor** 에서:
   ```sql
   select public.seed_demo_data(auth.uid());
   ```
   (또는 명시적으로 `select public.seed_demo_data('<user-uuid>');`)
3. 박지우 6개월 인바디 시계열·목표·컨디션 로그가 채워지고, 공개/비공개 분할이 적용됩니다.

## 4. 타입 생성(선택)

```bash
supabase gen types typescript --project-id <REF> > src/types/database.ts
```
이후 `src/lib/supabase.ts` 의 `createClient<Database>(...)` 로 타입을 강화할 수 있습니다.
(현재 스캐폴딩은 도메인 타입을 `src/data/api.ts` 에 직접 둔 untyped 클라이언트입니다.)

## 5. 프론트 연동 순서

`src/data/api.ts` 함수로 `portalState` 목업을 점진 교체:
1. 로그인 게이트 → `signIn` / `signUp`, 세션은 supabase-js가 보관.
2. 대시보드 시계열 → `fetchMetricSeries(userId)` 결과를 `portalData.ts` 산출 함수에 그대로 투입.
3. 공개/비공개 토글 → `setPrivacy`, 멤버 탐색 → `fetchMembers` + `fetchMetricSeries`(RLS가 비공개 자동 차단).
4. 피드/코멘트/채팅 → `fetchPosts`/`createPost`/`fetchMessages`/`sendMessage`/`subscribeMessages`.
5. 프로필/사진 → `updateProfile`/`uploadAvatar`.

## 6. Vercel 배포

1. <https://vercel.com> 에서 GitHub 레포(`0xn4mmin/Haneul-Wellness-Lab`) Import.
2. 프레임워크 자동 감지(Vite). `vercel.json` 이 SPA rewrite 를 처리(`/portal` 새로고침 OK).
3. **Settings → Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 추가.
4. **Supabase → Authentication → URL Configuration** 에 Vercel 도메인을 Redirect/Site URL 로 등록.
5. Deploy. 이후 `main` push 시 자동 배포.

## 보안 체크리스트

- `anon` 키는 공개되어도 되지만(클라이언트용), **`service_role` 키는 절대 프론트/레포에 두지 말 것**.
- 모든 테이블 RLS 활성 — 새 테이블 추가 시 정책도 함께 작성.
- 건강 민감정보: 접근 로깅, 탈퇴 시 파기 정책, 스토리지 버킷 권한 주기 점검.
