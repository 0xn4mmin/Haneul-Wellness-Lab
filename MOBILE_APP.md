# 모바일 앱 빌드 (iOS · Android)

이 앱은 [Capacitor](https://capacitorjs.com)로 감싸 **하나의 웹 코드**를 iOS/Android 네이티브 패키지로 만듭니다. 빌드한 `dist/`를 앱 안에 **번들 내장**하므로 오프라인 셸로 동작하고, 코드를 바꾸면 다시 빌드해야 반영됩니다.

```
웹 코드 변경 → npm run app:sync → Xcode/Android Studio에서 빌드
```

## 사전 준비
- **공통**: Node 18+, `npm install` 완료
- **Android**: [Android Studio](https://developer.android.com/studio) (JDK 17 포함) — 무료
- **iOS**: macOS + [Xcode](https://developer.apple.com/xcode/) — 설치 무료. **배포(다른 사람 설치)는 Apple Developer Program($99/년) 필요**

## 한 번에 동기화
```bash
npm run app:sync       # 웹 빌드 + 네이티브로 복사
npm run app:android    # 빌드 + Android Studio 열기
npm run app:ios        # 빌드 + Xcode 열기
```

---

## Android — .apk 만들어 배포 (계정 불필요)
사이드로드용 APK는 누구나 받아서 설치할 수 있습니다(설정에서 "출처를 알 수 없는 앱" 허용).

**A. 명령줄로 릴리스 APK (서명 필요)**
```bash
npm run app:apk
# 결과: android/app/build/outputs/apk/release/app-release-unsigned.apk
```
릴리스 APK는 서명해야 설치돼요. 한 번만 키스토어를 만들고 서명합니다:
```bash
keytool -genkey -v -keystore haneul.keystore -alias haneul -keyalg RSA -keysize 2048 -validity 10000
# Android Studio에서 Build > Generate Signed Bundle/APK > APK 로 하는 게 가장 쉬움
```

**B. Android Studio (권장, 가장 쉬움)**
```bash
npm run app:android
```
→ Android Studio에서 **Build ▸ Generate Signed Bundle / APK ▸ APK** ▸ 키스토어 생성/선택 ▸ release ▸ Finish.
나온 `app-release.apk`를 카톡/드라이브/웹에 올리면 사람들이 받아서 설치할 수 있어요.

> 빠르게 테스트만: **Build ▸ Build APK(s)** 의 debug APK도 설치는 됩니다(서명은 디버그 키).

---

## iOS — 솔직한 현실
애플은 앱스토어 밖 자유 배포를 막아둬서, "아무나 다운로드 설치"는 **불가**합니다. 방법은:

| 방법 | 누가 설치 가능 | 필요 조건 |
|---|---|---|
| **무료 서명** | 본인 기기 1대, 7일 | Apple ID만 (재서명 반복) |
| **Ad-hoc** | 등록한 기기 최대 100대 | Apple Developer($99/년), 기기 UDID 등록 |
| **TestFlight** | 외부 테스터 최대 10,000명 | Apple Developer($99/년), 간단 심사 |
| **App Store** | 누구나 | Apple Developer + 정식 심사 |

대부분은 **TestFlight**가 현실적입니다(링크로 초대 → 테스터가 TestFlight 앱으로 설치).

**프로젝트 열기 / 빌드**
```bash
npm run app:ios
```
→ Xcode에서 **Signing & Capabilities** 탭에서 팀(Apple ID/Developer) 선택 → 기기 연결 후 **Run(▶)** 으로 본인 기기 설치, 또는 **Product ▸ Archive ▸ Distribute** 로 TestFlight 업로드.

---

## 참고 / 주의
- `appId`: `com.haneulwellness.lab`, 표시 이름: **하늘 웰니스 랩** (`capacitor.config.ts`).
- 네이티브 셸에서는 서비스워커를 끕니다(`src/main.tsx`) — 번들 자산이 이미 로컬이라 불필요하고 라우터와 충돌 방지.
- Supabase **anon 키**는 클라이언트용이라 번들에 포함돼도 안전(웹 빌드와 동일). service_role 키는 절대 포함 금지.
- 아이콘/스플래시는 `assets/logo.png`에서 생성. 바꾸려면 그 파일 교체 후 `npx @capacitor/assets generate --assetPath assets --iconBackgroundColor '#060B17' --splashBackgroundColor '#060B17'`.
- 코드 수정 후에는 항상 `npm run app:sync` 를 먼저 돌려야 네이티브에 반영됩니다.
