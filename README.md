# 하늘 웰니스 랩 · Haneul Wellness Lab

> 퍼스널 트레이닝 회원 전용 **웰니스 포털** — 인바디(InBody) 체성분 데이터를 차트로
> 추적하고, 코치 코멘트·커뮤니티·그룹 챌린지·실시간 채팅을 제공하는 다크 시네마틱
> 웹앱입니다. 모든 UI 카피는 한국어입니다.

디자인 핸드오프(`design_handoff_haneul_wellness`)를 **React + TypeScript + Vite +
three.js** 로 픽셀에 가깝게 구현했습니다. 현재는 **프론트엔드 단독(목업 데이터)** 단계이며,
백엔드 연동 계획은 [`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md) 를 참고하세요.

---

## 목차

1. [빠른 시작](#빠른-시작)
2. [기술 스택](#기술-스택)
3. [프로젝트 구조](#프로젝트-구조)
4. [라우팅 & 화면](#라우팅--화면)
5. [기능 명세](#기능-명세)
6. [상태 모델](#상태-모델)
7. [데이터 모델(도메인)](#데이터-모델도메인)
8. [디자인 시스템](#디자인-시스템)
9. [3D 씬](#3d-씬)
10. [데모 영상 녹화](#데모-영상-녹화)
11. [알려진 제약 & 로드맵](#알려진-제약--로드맵)

---

## 빠른 시작

```bash
npm install
npm run dev      # 개발 서버 → http://localhost:5173
npm run build    # 타입체크(tsc) + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

요구 사항: Node 18+ (개발은 Node 22 기준). 외부 폰트(Pretendard·Gowun Batang·Outfit·
IBM Plex Mono)는 CDN 으로 로드합니다.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 프레임워크 | React 18 + TypeScript | |
| 번들러 | Vite 5 | `@vitejs/plugin-react` |
| 라우팅 | react-router-dom 6 | `/`, `/portal` |
| 3D | three.js r160 | 인트로 배경 + 부위별 근육 모델 |
| 스타일 | **인라인 스타일 객체** + `index.css` 유틸 | 맞춤 그라데이션·글래스의 픽셀 충실도 우선 |
| 차트 | 직접 작성한 SVG | 추이 라인·레이더·게이지·스파크라인 (라이브러리 미사용) |

> **스타일링 선택 이유**: 원본 디자인이 전부 인라인 스타일(맞춤 radial/linear
> 그라데이션, 글래스 블러)이라 Tailwind 보다 인라인 객체가 충실도·이식 정확도에서
> 유리했습니다. 호버 효과만 `index.css` 의 유틸 클래스(`.hwl-*-hover`)로 처리합니다.

---

## 프로젝트 구조

```
Haneul-Wellness-Lab/
├─ index.html                 # 폰트 CDN, 루트
├─ src/
│  ├─ main.tsx                # 라우터 부트스트랩 (/ , /portal)
│  ├─ index.css               # 전역 스타일·키프레임·호버 유틸
│  ├─ pages/
│  │  ├─ Intro.tsx            # 랜딩: 3D 히어로 + 커서 스포트라이트 리빌
│  │  └─ Portal.tsx           # 앱 본체: 로그인 게이트 + 6개 뷰
│  ├─ lib/
│  │  ├─ threeField.ts        # 인트로 배경 3D (크리스털·스타필드·패럴럭스)
│  │  └─ threeFigure.ts       # 부위별 근육 3D 모델 (드래그·픽킹)
│  └─ data/
│     ├─ portalData.ts        # 지표 시계열 + 차트 산출 로직(순수 함수)
│     └─ portalState.ts       # 포털 상태 타입 & 초기값(목업 데이터)
├─ public/assets/             # logo-mark.png, logo-web.png, inbody-result.jpg
├─ scripts/record-demo.mjs    # 헤드리스 데모 영상 녹화 (puppeteer-core + CDP)
└─ docs/BACKEND_PLAN.md       # 백엔드 연동 계획·API·데이터 모델
```

`portalData.ts`(순수 산출 로직)와 `portalState.ts`(상태/목업)을 분리한 것은, 백엔드
연동 시 **`portalState` 의 초기 목업만 API 응답으로 대체**하면 되도록 하기 위함입니다.

---

## 라우팅 & 화면

| 경로 | 화면 | 진입/이탈 |
|---|---|---|
| `/` | **인트로** — 풀스크린 3D 히어로 | CTA(시작하기/포털 입장하기) → `/portal` |
| `/portal` | **포털** — 로그인 게이트 + 셸 | 사이드바 로고 → `/` |

포털 셸: 좌측 **사이드바**(248px, sticky) + 상단 **헤더**(sticky, 글래스) + 본문.
포털 내부 뷰는 SPA 식 조건부 렌더(`state.view`)로 전환됩니다.

뷰 키: `health | community | chat | members | trainer | profile`

---

## 기능 명세

### 진입 — 로그인 게이트
- `authed=false` 이면 전체화면 오버레이. 이메일/비밀번호 입력 후 로그인 → `authed=true`
  (데모는 검증 없이 통과). "회원가입"도 동일하게 게이트 해제.

### 뷰 1 — 나의 건강 (대시보드)
1. **히어로 밴드** — 아바타·이름·`171cm · 26세 · 남성 · 측정일`·빠른 스탯(체지방률·골격근량) +
   원형 **인바디 점수 링**(dasharray 호).
2. **AI 코치 브리핑** — 목표/추이/평균 수면으로 **동적 생성**되는 요약 1문단 + 2주 액션 3개.
   "다시 생성"으로 관점(종합/취약/생활) 순환.
3. **목표 달성률 링** — 애플워치식 4링(인바디·골격근·체지방률·내장지방), 목표 대비 % 호.
4. **부위별 근육 3D 모델** — 드래그 회전, 부위 탭/호버 → 우측 리드아웃(부위명·kg·균형%).
5. **최근 측정 게이지** — 골격근/체지방률/체중/BMI, 표준이하·표준·표준이상 3구간 + 마커,
   **항목별 공개/비공개 토글**.
6. **추이 그래프** — 인터랙티브 SVG. 지표 칩 9개 전환, 포인트 호버 → 날짜+수치 툴팁·가이드라인.
7. **종합 밸런스 레이더** — 6축(근육·체지방·수분·점수·BMI·내장) 현재 vs 1월, 꼭짓점 호버 툴팁,
   "밸런스 계산법" 설명 토글.
8. **측정 상세값** — 기초대사량·내장지방레벨·위상각·SMI·적정체중·권장조절.
9. **측정 기록** — 날짜 목록, "결과지 보기" → 원본 인바디 결과지 라이트박스.
10. **변화 비교(Before/After)** — 기준/비교 측정일 선택 → 지표별 before→after+델타.
11. **컨디션 로그** — 주간 수면 바 + 상관 인사이트.
12. **차트 코멘트** — 선택 지표별 코치/회원 코멘트 + 공개여부 표시 + 입력.

### 뷰 2 — 커뮤니티
- 그룹 챌린지 카드 + 익명 리더보드 + **챌린지 만들기 모달**(제목·지표·목표·기간·공개범위).
- 게시글 작성 + 피드(좋아요·댓글 토글·공유 차트 칩).

### 뷰 3 — 그룹 채팅
- 메시지 버블(본인/코치/회원 스타일 구분, 자동 하단 스크롤) + 입력 + 우측 "접속 중" 목록.

### 뷰 4 — 멤버
- 회원 카드 그리드(점수·공개/비공개 수) → 상세(공개 차트만 스파크라인, 비공개는 잠금) + 응원 코멘트.

### 뷰 5 — 트레이너 스튜디오 (보기 모드 "트레이너")
- 회원 로스터 테이블(인바디·체지방률·골격근·상태) + 코칭 노트 브로드캐스트(대상 선택 → 전송).

### 프로필 설정
- 프로필 사진 업로드(FileReader 미리보기) · 이름 · 생년월일 · 성별 · 핸드폰 번호 · 저장.

---

## 상태 모델

포털 전체 상태는 `PortalState`(`src/data/portalState.ts`) 하나로 관리하며,
`Portal.tsx` 에서 `useState` + 부분 업데이트 헬퍼(`set`/`setFn`)로 다룹니다.

주요 키: `authed`, `view`, `role`(client/trainer), `selectedMetric`, `selectedSegment`,
`hoverIdx`(추이), `radarHover`, `showBalInfo`, `privacy`(지표별 public/private),
`commentsByMetric`, `posts`, `messages`, `members`, `memberComments`, `activeMember`,
`coachTargetId`/`coachNote`, `cmpFrom`/`cmpTo`, `briefIdx`, `profile`,
`showChallengeForm`/`ch*`(챌린지 폼), `scanOpen`, `loginEmail`/`loginPw`.

차트 기하 산출은 `portalData.ts` 의 순수 함수로 분리: `buildTrend`, `buildGauges`,
`buildRadar`, `buildSpark`, `segColor`, `norm`.

---

## 데이터 모델(도메인)

목업 기준 도메인 엔티티(백엔드 설계의 출발점). 상세 스키마/관계는
[`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md) 참고.

| 엔티티 | 핵심 필드 |
|---|---|
| **User** | id, name, initials, avatarColor, role(client/trainer), height, birth, gender, phone, photo, joinedAt |
| **Measurement**(인바디 측정) | id, userId, date, `score/weight/smm/pbf/bodyFatMass/bmi/bmr/visceral/tbw`, 부위별(rightArm·leftArm·trunk·rightLeg·leftLeg: kg·pct), 상세(phaseAngle·SMI·protein·mineral·idealWeight·visceralLevel), resultSheetUrl |
| **MetricPrivacy** | userId, metricKey, visibility(public/private) |
| **Goal** | userId, {score, smm, pbf, visceral} |
| **ChartComment** | id, userId(차트 주인), metricKey, authorId, role, text, createdAt |
| **Post** | id, authorId, text, likes, sharedMetric?, createdAt |
| **PostComment** | id, postId, authorId, text |
| **Message** | id, roomId, authorId, text, createdAt |
| **Challenge** | id, title, metric, goal, period, scope(public/private), createdBy, leaderboard |
| **ConditionLog** | userId, week, sleep, water, mood, workouts |
| **MemberCheer** | targetUserId, authorId, text |
| **CoachNote** | trainerId, memberId, metricKey, text, createdAt |

샘플 데이터(실제 인바디770 결과지 기반): 회원 박지우 171cm·26세, 6개월 시계열
(체중 75.8→70.6 / 골격근 29.4→31.9 / 체지방률 26.5→20.0 / 인바디 70→78 등).

---

## 디자인 시스템

### 색상 — 미드나잇 잉크 네이비 + 에메랄드
| 토큰 | 값 | 용도 |
|---|---|---|
| 배경 베이스 | `#060B17` / `#0A1326` / `#0D1A33` | 페이지 하단→상단 그라데이션 |
| 사이드바 | `#112146 → #0C1733 → #080F22` | 좌측 1px 골드 보더 |
| 히어로 밴드 | `#1B2A52 → #122046 → #1D2E58` | 대시보드 상단 |
| 카드(글래스) | bg `rgba(255,255,255,.045)` · border `rgba(255,255,255,.1)` · blur 7px · radius 24px | 모든 카드 |
| **에메랄드(하이라이트)** | `#2E9BA6` / 밝은 `#67D7DF` / 옅은 `#9FE2E8` | 강조·CTA·차트·3D |
| CTA 그라데이션 | `linear-gradient(110deg,#67D7DF,#2E9BA6)` (텍스트 `#060B17`) | 주요 버튼 |
| 골드(포인트) | `#C9A24B` / `#B89455` | 섹션 eyebrow·라벨·럭셔리 보더 |
| 클레이/앰버(경고) | `#E0A06A` / `#D9B45A` / `#E0B86A` | 표준이하/이상·비교 감소 |
| 본문 텍스트 | `#E7EFEA`(기본) · `#F2F7F3`(제목) · 쿨 슬레이트 `#9DAFCB`/`#8A9BC0`(보조) | |

> 색 히스토리: 초기 다크 포레스트 그린 → (warm 시안 폐기) → **미드나잇 잉크 네이비**.
> 에메랄드 하이라이트는 전 과정에서 유지.

### 타이포그래피
- 본문/UI: **Pretendard** (400–800)
- 디스플레이/카드 제목(한글): **Gowun Batang** (명조)
- 영문 워드마크/아이브로우(인트로): **Outfit**
- 숫자/데이터/라벨: **IBM Plex Mono**

### 형태·간격
- 카드 radius 24px(대)/20–22px(소), 칩/버튼 pill 18–30px
- 콘텐츠 폭 `max-width:1180px`, 패딩 `26px 34px 60px`
- 반응형: `clamp()` 유동 타이포 + `auto-fit minmax` 그리드 + flex-wrap

---

## 3D 씬

| 모듈 | 내용 |
|---|---|
| `threeField.ts` | 인트로 배경 — 떠다니는 면처리 크리스털 9개 + 스타필드 260p + 커서 패럴럭스 |
| `threeFigure.ts` | 부위별 근육 모델 — 캡슐 림프 마네킹, 드래그 회전, 레이캐스트 부위 픽킹, 균형%→색상 |

두 모듈 모두 **WebGL 컨텍스트 생성 실패 시 no-op 으로 graceful degrade** — 3D 없이도
정적 배경/패널로 앱이 정상 동작합니다(원본의 try/catch 방어를 이식).

---

## 데모 영상 녹화

`scripts/record-demo.mjs` — 헤드리스 Chrome(소프트웨어 WebGL)에서 모든 기능을 순서대로
구동하며 CDP 스크린캐스트로 프레임을 수집하고 ffmpeg 로 MP4 를 만듭니다.

```bash
npm run dev &                  # 5173 에 서버 필요
node scripts/record-demo.mjs   # → /tmp/hwl-frames 에 프레임, list.txt 생성
ffmpeg -f concat -safe 0 -i /tmp/hwl-frames/list.txt -r 30 -pix_fmt yuv420p demo.mp4
```

> 생성된 `*.mp4` 는 `.gitignore` 처리(아티팩트). 시스템 Chrome 경로는 스크립트 상단 상수.

---

## 알려진 제약 & 로드맵

현재는 프론트엔드 + 목업 데이터입니다. 다음은 미구현/예정:

- **백엔드 연동** — 인증·데이터·실시간 채팅·파일 업로드 ([`docs/BACKEND_PLAN.md`](docs/BACKEND_PLAN.md))
- **인바디 결과지 자동 파싱** — 결과지 이미지 OCR → 측정값 차트 변환
- **그룹 채팅** — 채팅방 생성 + 공개/비공개 입장코드
- **Compare** — 월 선택 후 같은 월 내 여러 측정일 선택(현재는 월 단위)
- **3D 근육 모델** — 사용자 제공 에셋으로 교체 예정

데이터 영속성이 없으므로 새로고침 시 입력(코멘트·게시글·메시지·프로필 등)은 초기화됩니다.
