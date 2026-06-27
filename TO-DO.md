# TO-DO · 하늘 웰니스 랩 백엔드 연동 & 배포

프론트엔드 + Supabase 스캐폴딩은 끝난 상태입니다. 여기서부터는 **실제 백엔드 연결 →
프론트 연동 → 배포** 순서입니다.

## 범례
- 👤 **내가(사용자) 직접** — 계정·키·결제·콘솔 작업 (이 문서에 단계별 방법 전부 기재)
- 🤖 **클로드가 대신** — 코드 작성/연동 (요청하면 PR/커밋으로 진행)
- ✅ 완료

## 큰 그림
```
1) 👤 Supabase 프로젝트 생성 + 키 발급        ← 먼저
2) 👤 스키마 적용(마이그레이션) + 시드
3) 👤 인증 설정 + 데모 계정
4) 🤖 프론트 연동(로그인→데이터→privacy→소셜→채팅→프로필)
5) 👤 Vercel 배포 + 환경변수 + 인증 URL 등록
6) 🤖/👤 (나중) OCR 워커(Railway)
```

---

## ✅ 0. 이미 끝난 것
- ✅ 프론트엔드 전체(인트로 + 포털 6개 뷰, 3D, 차트) — 미드나잇 네이비 테마
- ✅ Supabase 스키마/RLS/시드/스토리지 마이그레이션 (`supabase/`)
- ✅ 프론트 연동용 데이터 레이어 (`src/data/api.ts`) + env 가드 클라이언트 (`src/lib/supabase.ts`)
- ✅ Vercel 설정(`vercel.json`), 문서(`docs/SUPABASE.md`, `docs/BACKEND_PLAN.md`)

> 지금은 환경 변수가 없어 앱이 **목업 데이터**로 동작합니다. 아래를 마치면 실제 DB로 전환됩니다.

---

## 👤 1. Supabase 프로젝트 생성 + 키 발급

**1-1. 프로젝트 만들기**
1. <https://supabase.com> 접속 → **Start your project** → GitHub로 로그인.
2. **New project** 클릭.
3. 입력:
   - **Name**: `haneul-wellness-lab`
   - **Database Password**: 강한 비밀번호 생성 후 **반드시 따로 저장**(비밀번호 관리자에). CLI 연결 때 필요.
   - **Region**: `Northeast Asia (Seoul)` 권장.
   - **Plan**: Free.
4. **Create new project** → 약 1~2분 프로비저닝 대기.

**1-2. URL/키 복사**
1. 좌측 하단 **⚙ Project Settings → API**.
2. 복사할 값:
   - **Project URL** (예: `https://abcd1234.supabase.co`)
   - **Project API keys → `anon` `public`** 키
3. ⚠️ **`service_role` 키는 절대** 프론트엔드·`.env`·깃에 넣지 말 것(서버 전용, 무제한 권한).

**1-3. 로컬 `.env` 작성**
```bash
cd ~/Haneul-Wellness-Lab
cp .env.example .env
```
`.env` 를 열어 채우기:
```
VITE_SUPABASE_URL=https://<당신-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public 키>
```
> `.env` 는 이미 `.gitignore` 처리되어 깃에 안 올라갑니다.

**확인**: `npm run dev` 실행 후 브라우저 콘솔에 `[supabase] ... running on mock data` 경고가
**사라지면** 키가 정상 인식된 것(아직 화면은 목업 — 프론트 연동은 4단계 = 클로드 몫).

---

## 👤 2. 스키마 적용(마이그레이션) + 시드

두 방법 중 하나. **A(CLI)** 를 권장하지만, 설치가 번거로우면 **B(대시보드)** 로 충분합니다.

### 방법 A — Supabase CLI (권장)
```bash
# 1) CLI 설치 (macOS)
brew install supabase/tap/supabase      # 또는: npm i -g supabase

# 2) 로그인 (브라우저로 액세스 토큰 발급됨)
supabase login

# 3) 프로젝트 ref 확인: Settings → General → "Reference ID"
supabase link --project-ref <YOUR-PROJECT-REF>
#   → 1-1에서 저장한 Database Password 입력

# 4) 마이그레이션 적용
supabase db push
```
> `supabase/config.toml` 의 `project_id` 를 당신 ref 로 바꿔두면 이후 명령이 매끄럽습니다.

### 방법 B — 대시보드 SQL Editor
1. Supabase 대시보드 → 좌측 **SQL Editor → New query**.
2. 레포의 `supabase/migrations/20260625120000_init.sql` **전체 내용**을 붙여넣고 **Run**.
   - 성공하면 테이블·RLS·스토리지 버킷·트리거가 생성됩니다.
3. 새 쿼리에서 `supabase/seed.sql` **전체 내용**을 붙여넣고 **Run** (시드 *함수* 등록).

**적용 확인** (SQL Editor에서):
```sql
select table_name from information_schema.tables
where table_schema='public' order by 1;          -- 16개 테이블 보이면 OK
select * from storage.buckets;                    -- avatars / inbody-results 2개
```

---

## 👤 3. 인증 설정 + 데모 계정 + 데이터 주입

**3-1. 이메일 인증 설정(개발 편의)**
1. **Authentication → Sign In / Providers → Email** 이 활성인지 확인.
2. 개발 중엔 **Authentication → … → Email** 의 **"Confirm email" 을 OFF** 로 두면
   가입 즉시 로그인됩니다(메일 확인 생략). 운영 전환 시 다시 ON 권장.

**3-2. URL 설정**
- **Authentication → URL Configuration**
  - **Site URL**: `http://localhost:5173`
  - (배포 후) **Redirect URLs** 에 Vercel 도메인 추가 (5단계에서).

**3-3. 데모 계정 만들기** (택1)
- 앱에서 회원가입(로그인 게이트), **또는**
- 대시보드 **Authentication → Users → Add user** → 이메일/비밀번호 입력 →
  **Auto Confirm User 체크** → Create.

**3-4. 데모 데이터 주입** ⚠️ 중요 디테일
SQL Editor 쿼리는 **서비스 역할**로 실행돼 `auth.uid()` 가 `null` 입니다. 그래서
`auth.uid()` 대신 **사용자 UUID를 직접 넣어야** 합니다.
1. **Authentication → Users** 에서 방금 만든 계정의 **UID(uuid)** 복사.
2. SQL Editor:
   ```sql
   select public.seed_demo_data('붙여넣은-uuid');
   ```
3. **확인**:
   ```sql
   select metric_key, count(*) from metric_readings group by 1;   -- 9개 metric × 6
   select metric_key, visibility from metric_privacy
     where user_id='붙여넣은-uuid' order by 1;                     -- 공개/비공개 분할
   ```

이 시점에서 **DB·인증·데이터 준비 완료**. 화면 연결은 4단계(클로드).

---

## 🤖 4. 프론트엔드 연동 (요청 시 클로드가 진행)

각 항목을 작은 PR/커밋으로 진행합니다. 원하는 순서로 요청하세요.

- [ ] **4-1. 인증 연결** — 로그인 게이트를 `signIn`/`signUp`(`src/data/api.ts`)에 연결,
  세션 유지(supabase-js), 로그아웃, 미인증 시 게이트 표시.
- [ ] **4-2. 대시보드 데이터** — `fetchMetricSeries(userId)` 결과를 `portalData.ts` 차트
  산출 함수에 투입(추이/게이지/레이더/비교). 로딩·에러 상태 추가.
- [ ] **4-3. 공개/비공개** — 게이지 토글을 `setPrivacy` 에 연결.
- [ ] **4-4. 멤버 탐색** — `fetchMembers` + 타인 시계열(RLS가 비공개 자동 차단) + 잠금 표시.
- [ ] **4-5. 차트 코멘트** — `fetchChartComments`/`addChartComment`.
- [ ] **4-6. 커뮤니티 피드** — `fetchPosts`/`createPost`/`toggleLike`/`addPostComment`.
- [ ] **4-7. 그룹 채팅** — `fetchMessages`/`sendMessage` + `subscribeMessages`(Realtime).
- [ ] **4-8. 프로필/사진** — `updateProfile`/`uploadAvatar`(Storage).
- [ ] **4-9. 트레이너 스튜디오** — 로스터/코칭 노트(`coach_notes`) 연결.
- [ ] **4-10. 타입 강화** — `supabase gen types` 결과를 적용해 클라이언트 타입화
  (이건 **타입 파일 생성만 👤**, 적용은 🤖 — 아래 4-10 참고).
- [ ] **4-11. 데이터 패칭 정리** — React Query 도입(캐시·로딩·낙관적 업데이트).
- [x] **4-12. 남은 디테일** ✅
  - Compare: 측정일 전체 날짜 라벨 + 길이 가변 데이터 인덱스 클램프(같은 달 여러 측정 구분)
  - 그룹 채팅: 채팅방 생성(공개/비공개+입장코드), 코드로 입장, 방 전환, 입장코드 공유
    (`migration 20260627130000_chat_rooms.sql` 적용 필요 👤)
  - 멤버 탐색: 상세에 측정 횟수·최근일, 점수 비공개 시 "—" 표시

> **4-10 타입 생성(👤 1줄)**: `supabase gen types typescript --project-id <REF> > src/types/database.ts`
> 실행만 해주시면, 클라이언트/`api.ts` 타입 적용은 제가 합니다.

---

## 👤 5. Vercel 배포

**5-1. Import**
1. <https://vercel.com> → GitHub로 로그인.
2. **Add New… → Project** → `0xn4mmin/Haneul-Wellness-Lab` **Import**.
3. **Framework Preset**: `Vite` 자동 감지(빌드/출력은 `vercel.json` 사용).

**5-2. 환경 변수**
- **Environment Variables** 섹션에서 추가(또는 배포 후 Settings → Environment Variables):
  - `VITE_SUPABASE_URL` = (1-2의 Project URL)
  - `VITE_SUPABASE_ANON_KEY` = (anon public 키)
  - 적용 범위: **Production / Preview / Development** 모두 체크.

**5-3. Deploy**
- **Deploy** 클릭 → 빌드 완료 후 `https://<프로젝트>.vercel.app` 발급.
- 이후 `main` 브랜치 push 시 **자동 배포**.

**5-4. 인증 도메인 등록** (필수)
- Supabase → **Authentication → URL Configuration**:
  - **Site URL** 에 Vercel 도메인 추가(또는 교체)
  - **Redirect URLs** 에 `https://<프로젝트>.vercel.app/**` 추가.

**확인**: 배포 URL 접속 → `/portal` 새로고침해도 404 안 나면(SPA rewrite) OK.

---

## 6. 인바디 결과지 OCR — Railway (M4)

OCR 엔진은 **Claude 비전(Sonnet 4.6) + Structured Outputs** 로 결정. 워커 스캐폴딩은 ✅ 완료(`worker/`).

- [x] 🤖 OCR 워커(`worker/`) — Claude 비전 추출(`src/ocr.ts`) + 잡 폴링(`src/index.ts`)
- [x] 🤖 `ocr_jobs` 마이그레이션(`supabase/migrations/20260626120000_ocr.sql`)
- [ ] 👤 `ocr_jobs` 마이그레이션 적용(SQL Editor 또는 `db push`)
- [ ] 👤 Railway 프로젝트 생성(Root = `worker`) + Variables 등록:
  `SUPABASE_URL`, **`SUPABASE_SERVICE_ROLE_KEY`**(Settings→API Keys, 비밀), `ANTHROPIC_API_KEY`
- [x] 🤖 앱 연동 — 대시보드 "측정 기록" 카드에 "+ 결과지로 추가" → Storage 업로드 +
  `ocr_jobs` insert → realtime 진행표시 → 추출값 검수 폼(날짜 포함) → measurement 커밋 + 차트 갱신
  (`src/components/OcrUpload.tsx`, `api.ts` 의 upload/subscribe/commit)

> ⚠️ `service_role` 키는 워커(Railway) 환경변수에만. 절대 프론트/깃 X. 자세한 절차는 `worker/README.md`.

---

## 우선순위 추천
1. **👤 1~3단계**(Supabase 셋업·시드) — 30~40분.
2. **🤖 4-1, 4-2**(로그인 + 대시보드 데이터) — 제품이 "진짜로 동작"하는 첫 지점.
3. **👤 5단계**(Vercel 배포) — 외부 공유 가능.
4. 이후 4-3~4-9 기능 연동 → 6단계 OCR.

## 막히면
- 마이그레이션/RLS/배포 절차 상세: [`docs/SUPABASE.md`](docs/SUPABASE.md)
- 설계·데이터 모델·API: [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md)
- 각 단계에서 오류가 나면 그 메시지를 알려주세요 — 함께 해결합니다.
