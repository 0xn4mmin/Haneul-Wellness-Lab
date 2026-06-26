# 인바디 결과지 OCR 워커

업로드된 인바디 결과지 이미지를 **Claude 비전 + Structured Outputs** 로 읽어 측정값
JSON 으로 변환하는 백그라운드 워커입니다. Railway(또는 Render/Fly) 같은 곳에 배포합니다.

## 흐름

```
앱: 결과지 이미지 업로드 → Storage(inbody-results 버킷)
앱: ocr_jobs 행 insert (status 'pending', image_path)
워커: pending 잡 claim → 이미지 download → Claude 비전(구조화 추출) → ocr_jobs.result + status 'review'
앱: 추출값을 사용자에게 보여주고 확인 → measurement(source 'ocr') + metric_readings 커밋
```

워커는 **service_role 키**로 RLS 를 우회합니다(신뢰된 서버). 이 키는 절대 프론트/깃에 두지 마세요.

## 모델

- 기본 `claude-sonnet-4-6` (OCR-구조화 가성비). 최고 정확도는 `OCR_MODEL=claude-opus-4-8`.
- `output_config.format`(JSON 스키마, `src/ocr.ts` 의 `InBodySchema`)로 응답을 강제해 파싱이 안전합니다.

## 로컬 실행

```bash
cd worker
npm install
cp .env.example .env   # 값 채우기 (SUPABASE_URL / SERVICE_ROLE / ANTHROPIC_API_KEY)
npm run dev
```

## Railway 배포

1. Railway → New Project → Deploy from GitHub repo, **Root Directory = `worker`**.
2. Build `npm run build`, Start `npm start` (또는 `npm run dev` 로 tsx 실행).
3. **Variables** 에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY` 등록.
4. 배포 후 로그에 `[ocr] worker started` 가 보이면 정상.

## 선행 조건

- `supabase/migrations/20260626120000_ocr.sql` 적용(ocr_jobs 테이블 + RLS + realtime).
- `inbody-results` 스토리지 버킷(초기 마이그레이션에서 생성됨).

## 남은 연동 (앱 측)

- 프로필/측정 화면에서 결과지 업로드 → Storage 업로드 + `ocr_jobs` insert.
- `ocr_jobs` realtime 구독 → status 'review' 시 추출값 미리보기 + 확인 → measurement 커밋.
