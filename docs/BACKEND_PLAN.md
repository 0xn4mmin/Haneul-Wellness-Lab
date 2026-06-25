# 백엔드 연동 계획 · Backend Plan

하늘 웰니스 랩 프론트엔드(목업 단계)를 실제 서비스로 만들기 위한 백엔드 설계·구현 계획입니다.
프론트엔드의 도메인 모델(`src/data/portalState.ts`, `portalData.ts`)을 출발점으로 합니다.

---

## 1. 목표 & 범위

**핵심 가치**: 회원이 인바디 측정 데이터를 안전하게 보관·추적하고, 지표별 공개 범위를 본인이
통제하며, 코치/회원과 코멘트·챌린지·실시간 채팅으로 상호작용한다.

**1차 범위 (MVP)**
- 회원/코치 인증 및 역할 기반 권한
- 인바디 측정 데이터 CRUD + 시계열 조회
- **지표별 공개/비공개(privacy)** 통제 — 타인 조회 시 비공개 지표 잠금
- 차트 코멘트 / 커뮤니티 피드 / 응원 코멘트
- 프로필 + 사진 업로드

**2차 범위**
- 실시간 그룹 채팅(WebSocket) + 채팅방(공개/입장코드)
- 그룹 챌린지 + 리더보드(공개 지표만 익명 집계)
- 인바디 결과지 이미지 업로드 → OCR 파싱 → 측정값 자동 등록
- AI 코치 브리핑(서버측 생성 또는 LLM 연동)

**비범위(초기)**: 결제, 다지점/프랜차이즈, 모바일 네이티브 앱.

---

## 1.5 호스팅 & 구현 결정 (확정)

- **프론트엔드 → Vercel** (Vite SPA, GitHub 자동 배포, `vercel.json` SPA rewrite).
- **백엔드 → Supabase** (Postgres + Auth + Storage + Realtime + **RLS**). 별도 서버 호스팅 불필요.
- **OCR 워커 → Railway**(또는 Render/Fly), M4에서 필요해질 때 추가하는 하이브리드.

> **스키마 결정**: 아래 3절의 와이드 컬럼형 Prisma 스케치 대신, 실제 스캐폴딩은
> **`metric_readings`(user_id·metric_key·date·value) 롱 테이블**로 구현했습니다.
> 이유 — 지표별 공개/비공개를 **RLS(행 단위)** 로 강제하려면 메트릭이 행이어야 하고,
> 이는 프론트의 "지표별 시계열" 모델과도 일치합니다. 부위별/상세값은 `measurements`
> 스캔 이벤트의 JSONB로 둡니다. 실제 SQL·정책은 `supabase/migrations/*.sql` 참고.
> (Supabase 채택으로 NestJS 자체 API 레이어는 OCR/커스텀 로직 단계까지 보류.)

## 2. 권장 스택

| 영역 | 권장 | 대안 |
|---|---|---|
| 런타임/프레임워크 | **Node.js + NestJS** (TypeScript, 프론트와 타입 공유 용이) | Fastify, Express |
| DB | **PostgreSQL** (관계형 + JSONB로 측정 상세 보관) | |
| ORM | **Prisma** | Drizzle, TypeORM |
| 인증 | **JWT(access) + refresh 토큰**, httpOnly 쿠키 | 세션+Redis |
| 실시간 | **WebSocket (Socket.IO)** | SSE(읽기 전용), Ably/Pusher |
| 파일 저장 | **S3 호환 오브젝트 스토리지** + presigned URL | Cloudflare R2, Supabase Storage |
| OCR | 외부 OCR(예: Google Vision / Naver CLOVA OCR) + 인바디 양식 후처리 | 자체 모델 |
| 캐시/큐 | Redis (세션·레이트리밋·OCR 잡 큐) | |
| 배포 | Docker + (Fly.io/Render/AWS) | |

> **단일 언어 이점**: 프론트가 TS 이므로 `packages/shared` 에 도메인 타입·zod 스키마를 두고
> FE/BE 가 공유하면 계약 드리프트를 줄일 수 있음(모노레포 권장).

---

## 3. 아키텍처 개요

```
[React SPA] ──HTTPS/REST──> [API (NestJS)] ──> [PostgreSQL]
     │                          │   │
     └──WebSocket(Socket.IO)────┘   ├──> [Redis] (세션·레이트리밋·큐)
                                    ├──> [Object Storage] (사진·결과지)  presigned URL
                                    └──> [OCR Worker] (결과지 → 측정값)  비동기 잡
```

- **API 서버**: REST(자원 CRUD) + WebSocket 게이트웨이(채팅).
- **OCR 워커**: 업로드된 결과지를 큐로 받아 파싱 → 측정 레코드 초안 생성(검수 후 확정).
- **Storage**: 클라이언트가 presigned URL 로 직접 업로드, 서버는 키만 보관.

---

## 4. 데이터 모델 (PostgreSQL / Prisma 초안)

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  passwordHash String
  name        String
  role        Role     @default(CLIENT)      // CLIENT | TRAINER
  initials    String
  avatarColor String
  photoKey    String?                         // object storage key
  heightCm    Float?
  birth       DateTime?
  gender      String?
  phone       String?
  joinedAt    DateTime @default(now())

  measurements   Measurement[]
  goals          Goal?
  privacies      MetricPrivacy[]
  conditionLogs  ConditionLog[]
  coachOf        CoachNote[]    @relation("trainerNotes")
}

enum Role { CLIENT TRAINER }

model Measurement {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  date      DateTime
  // 핵심 지표
  score     Int
  weight    Float
  smm       Float    // 골격근량
  pbf       Float    // 체지방률
  bodyFatMass Float
  bmi       Float
  bmr       Int
  visceral  Int
  tbw       Float
  // 부위별 & 상세(가변 → JSONB)
  segmental Json     // { rightArm:{kg,pct}, leftArm, trunk, rightLeg, leftLeg }
  detail    Json     // { phaseAngle, smi, protein, mineral, idealWeight, ecwTbw, ... }
  resultSheetKey String?           // 원본 결과지 이미지
  source    MeasurementSource @default(MANUAL)  // MANUAL | OCR
  createdAt DateTime @default(now())

  comments  ChartComment[]
  @@index([userId, date])
}

enum MeasurementSource { MANUAL OCR }

model MetricPrivacy {
  userId     String
  metricKey  String     // score|weight|smm|pbf|bodyFatMass|bmi|bmr|visceral|tbw
  visibility Visibility @default(PRIVATE)
  user       User       @relation(fields: [userId], references: [id])
  @@id([userId, metricKey])
}

enum Visibility { PUBLIC PRIVATE }

model Goal {
  userId   String @id
  user     User   @relation(fields: [userId], references: [id])
  score    Int
  smm      Float
  pbf      Float
  visceral Int
}

model ChartComment {
  id         String   @id @default(cuid())
  measurementOwnerId String           // 차트 주인(=userId)
  metricKey  String
  authorId   String
  text       String
  createdAt  DateTime @default(now())
  @@index([measurementOwnerId, metricKey])
}

model Post {
  id        String   @id @default(cuid())
  authorId  String
  text      String
  sharedMetric Json?                  // { val, label, sub } 공유 차트 칩
  createdAt DateTime @default(now())
  likes     PostLike[]
  comments  PostComment[]
}
model PostLike    { postId String; userId String; @@id([postId, userId]) }
model PostComment { id String @id @default(cuid()); postId String; authorId String; text String; createdAt DateTime @default(now()) }

model ChatRoom  { id String @id @default(cuid()); name String; isPrivate Boolean @default(false); joinCode String?; createdAt DateTime @default(now()) }
model Message   { id String @id @default(cuid()); roomId String; authorId String; text String; createdAt DateTime @default(now()); @@index([roomId, createdAt]) }
model RoomMember{ roomId String; userId String; @@id([roomId, userId]) }

model Challenge {
  id        String   @id @default(cuid())
  title     String
  metricKey String
  goal      String
  startsAt  DateTime
  endsAt    DateTime
  scope     Visibility @default(PUBLIC)
  createdBy String
}

model ConditionLog { id String @id @default(cuid()); userId String; week String; sleep Float; water Float; mood Int; workouts Int }
model MemberCheer  { id String @id @default(cuid()); targetUserId String; authorId String; text String; createdAt DateTime @default(now()) }
model CoachNote    { id String @id @default(cuid()); trainerId String; memberId String; metricKey String; text String; createdAt DateTime @default(now()); trainer User @relation("trainerNotes", fields:[trainerId], references:[id]) }
```

---

## 5. API 설계 (REST)

기본 prefix `/api/v1`. 응답은 JSON, 인증은 access 토큰(쿠키 또는 `Authorization: Bearer`).

### 인증
| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 → access/refresh |
| POST | `/auth/refresh` | 토큰 재발급 |
| POST | `/auth/logout` | 로그아웃 |
| GET | `/auth/me` | 현재 사용자 |

### 측정/지표
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/measurements?userId=&metric=&from=&to=` | 시계열 조회(권한 필터링) |
| GET | `/measurements/:id` | 단건(부위별·상세 포함) |
| POST | `/measurements` | 수기 등록(코치/본인) |
| POST | `/measurements/ocr` | 결과지 업로드 → OCR 잡 생성 |
| PATCH | `/measurements/:id` | 수정 |
| GET | `/users/:id/goals` · PUT | 목표 조회/수정 |
| GET | `/users/:id/privacy` · PUT `/privacy/:metric` | 공개 설정 조회/토글 |
| GET | `/users/:id/condition` | 컨디션 로그 |

### 소셜/커뮤니티
| 메서드 | 경로 | 설명 |
|---|---|---|
| GET/POST | `/measurements/:ownerId/:metric/comments` | 차트 코멘트 |
| GET/POST | `/posts`, `/posts/:id/comments`, `/posts/:id/like` | 피드 |
| GET | `/members` · `/members/:id` | 회원 탐색(공개 차트만) |
| POST | `/members/:id/cheer` | 응원 코멘트 |
| GET/POST | `/challenges`, `/challenges/:id/leaderboard` | 챌린지(익명 집계) |
| POST | `/coach/notes` | 코칭 노트(트레이너 전용) |

### 실시간(WebSocket, `/ws`)
- 이벤트: `room:join`, `message:new`, `message:list`, `presence:update`.
- 채팅방 생성 `POST /chat/rooms`(공개/비공개+입장코드), 입장 `POST /chat/rooms/:id/join`.

---

## 6. 인증 & 권한 (핵심)

- **역할(Role)**: `CLIENT` / `TRAINER`. 프론트의 "보기 모드" 토글은 트레이너 권한일 때만 실제 의미.
- **지표별 공개 범위(privacy)**: 모든 조회 API 는 요청자 컨텍스트로 필터링.
  - 본인 → 전체 접근.
  - 다른 회원 → 해당 회원의 `MetricPrivacy.visibility = PUBLIC` 지표만. 비공개는 응답에서 제외(잠금).
  - 트레이너 → 담당 회원 전체 접근(정책에 따라).
- **챌린지 리더보드**: 공개 설정한 지표만, **닉네임 익명화**하여 집계.
- 권한은 라우트 가드(Role) + 리소스 단위 정책(Policy)으로 이중 적용. 응답 직렬화 단계에서
  비공개 필드를 제거(프론트로 새어나가지 않도록).

---

## 7. 파일 업로드 & 인바디 OCR

1. **프로필 사진**: 클라이언트가 `POST /uploads/presign` → presigned PUT URL 로 직접 업로드 →
   `photoKey` 저장. 이미지 리사이즈/검증(타입·용량) 서버 또는 람다.
2. **인바디 결과지**: 동일 방식 업로드 → `POST /measurements/ocr` 로 OCR 잡 enqueue.
   - 워커가 OCR(외부) → 인바디770 양식 후처리(라벨 매칭: 골격근량/체지방률/위상각/SMI 등)
     → `Measurement` **초안(draft)** 생성 → 코치/회원 검수 후 확정.
   - 신뢰도 낮은 값은 플래그하여 수기 보정 유도.

---

## 8. 비기능 요구사항

- **검증**: zod/class-validator 로 입력 검증, FE/BE 공유 스키마.
- **보안**: 비밀번호 Argon2/bcrypt, 레이트리밋(Redis), CORS 화이트리스트, httpOnly+SameSite 쿠키,
  업로드 MIME/용량 제한, 결과지 등 개인 건강정보 접근 로깅.
- **개인정보**: 건강 데이터는 민감정보 → 저장 암호화(at-rest), 접근 최소권한, 탈퇴 시 파기 정책.
- **테스트**: 도메인 유닛 + API e2e(공개/비공개 필터링은 반드시 케이스화).
- **관측성**: 구조적 로깅, 에러 트래킹(Sentry), 헬스체크.
- **마이그레이션**: Prisma migrate, 시드(현재 목업 = 박지우 6개월 시계열).

---

## 9. 프론트엔드 연동 전략

현재 구조가 연동을 쉽게 하도록 설계됨:

1. `portalState.ts` 의 초기 목업을 **API 응답으로 대체**(React Query/SWR 도입 권장).
2. `portalData.ts` 의 순수 산출 함수(`buildTrend/buildGauges/buildRadar`)는 **그대로 재사용** —
   입력 시계열만 서버 데이터로 교체.
3. 상태 업데이트 핸들러(`submitComment`, `submitPost`, `sendMsg`, `togglePrivacy`, `onPhoto` …)를
   낙관적 업데이트 + API 호출로 치환.
4. 채팅은 로컬 push → WebSocket 구독으로 전환(자동 하단 스크롤 로직 유지).
5. 로그인 게이트를 실제 `/auth/login` + 토큰 보관(httpOnly 쿠키)으로 연결.

---

## 10. 단계별 마일스톤

| 단계 | 산출물 | 기간(예상) |
|---|---|---|
| **M0 — 기반** | 모노레포, 공유 타입 패키지, DB 스키마, 인증(register/login/me), CI | ~1주 |
| **M1 — 측정 코어** | 측정 CRUD + 시계열 API, 목표/컨디션, **privacy 필터링**, FE 연동(대시보드) | ~2주 |
| **M2 — 소셜** | 차트 코멘트, 커뮤니티 피드, 멤버 탐색(공개 차트), 응원, 코칭 노트 | ~1.5주 |
| **M3 — 실시간/챌린지** | WebSocket 채팅 + 채팅방, 챌린지 + 익명 리더보드 | ~2주 |
| **M4 — 업로드/OCR** | 사진·결과지 업로드, OCR 워커, 측정 초안 검수 플로우 | ~2주 |
| **M5 — 하드닝** | 보안·개인정보·관측성·테스트·배포 | ~1주 |

> 우선순위: **M1(privacy 포함)** 이 제품의 신뢰 핵심. 채팅/OCR 은 그 이후.
