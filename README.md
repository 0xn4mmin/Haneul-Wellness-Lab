# 하늘 웰니스 랩 · Haneul Wellness Lab

퍼스널 트레이닝 회원 전용 웰니스 포털 — 인바디(InBody) 체성분 데이터를 차트로 추적하고, 코치 코멘트·커뮤니티·그룹 챌린지를 제공하는 다크 시네마틱 웰니스 웹앱.

디자인 핸드오프(`design_handoff_haneul_wellness`)를 **React + TypeScript + Vite + three.js** 로 구현했습니다. 모든 UI 카피는 한국어입니다.

## 실행

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 타입체크 + 프로덕션 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 구조

| 경로 | 역할 |
|---|---|
| `src/pages/Intro.tsx` | 랜딩(`/`) — 풀스크린 3D 히어로 + 커서 스포트라이트 리빌 |
| `src/pages/Portal.tsx` | 포털(`/portal`) — 로그인 게이트 + 5개 뷰(나의 건강·커뮤니티·그룹 채팅·멤버·트레이너) + 프로필 |
| `src/lib/threeField.ts` | 인트로 배경 3D (떠다니는 크리스털 + 스타필드 + 패럴럭스) |
| `src/lib/threeFigure.ts` | 부위별 근육 3D 모델 (드래그 회전 · 부위 탭/호버 선택) |
| `src/data/portalData.ts` | 인바디 지표 시계열·게이지·추이/레이더/스파크라인 산출 로직 |
| `src/data/portalState.ts` | 포털 상태 타입 및 초기값(샘플 데이터) |
| `public/assets/` | 로고·인바디 결과지 이미지 |

## 라우팅

- `/` 인트로 → CTA 클릭 시 `/portal`
- `/portal` 사이드바 로고 → `/` 인트로
- 포털 진입 시 로그인 게이트(데모: 검증 없이 통과)

## 구현 메모

- **스타일링**: 디자인이 전부 인라인 스타일(맞춤 그라데이션·글래스)이라 픽셀 충실도를 위해 React 인라인 스타일 객체로 이식했습니다. 호버 효과만 `index.css` 유틸 클래스로 처리.
- **3D 폴백**: WebGL 컨텍스트 생성 실패 시 `threeField`/`threeFigure` 가 no-op 으로 graceful degrade — 3D 없이 정적 배경/패널로 표시되며 앱은 정상 동작합니다.
- **인트로 리빌**: 디자인 레퍼런스(`Intro.dc.html`)에 살아있는 "커서로 비추면 데이터가 드러나는" 스포트라이트 기믹을 그대로 구현했습니다(헤드라인 카피가 이 동작을 전제로 함).
- **인터랙션**: 지표별 공개/비공개 토글, 추이/레이더 포인트 호버 툴팁, 3D 부위 선택, 비교 측정일 선택, 챌린지 생성 모달, 결과지 라이트박스, 프로필 사진 업로드(FileReader), 보기 모드(회원/트레이너) 전환 모두 동작합니다.
