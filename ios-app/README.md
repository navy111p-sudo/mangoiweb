# 망고아이 iOS 앱 (WKWebView 래퍼)

`mangoi.ai` 를 감싸는 아이폰/아이패드 앱 (2026-08-17 `test.mangoi.co.kr` 에서 옮김).
안드로이드 `mobile-app/` 과 **같은 번들 식별자
`kr.co.mangoi.app`**, 같은 역할이다.

> ⚠️ **이 코드는 아직 한 번도 빌드·실행된 적이 없다.** 작성 환경이 윈도우라 컴파일 검증이
> 불가능했다. 맥에서 첫 빌드 시 사소한 컴파일 오류가 날 수 있고, 아래 「실기기 검증」 항목은
> 반드시 실제 아이폰에서 확인해야 한다. 확인 전까지 "된다"고 보지 말 것.

---

## 1. 맥에서 여는 법

```bash
brew install xcodegen          # 최초 1회
cd ios-app
xcodegen generate              # project.yml → MangoiApp.xcodeproj 생성
open MangoiApp.xcodeproj
```

Xcode 가 열리면 **딱 두 가지**를 채운다.

1. `project.yml` 의 `DEVELOPMENT_TEAM` 에 법인 개발자 계정의 **Team ID**(예: `ABCDE12345`)를
   넣고 `xcodegen generate` 를 다시 실행. (또는 Xcode > Signing & Capabilities 에서 팀 선택)
2. 아이폰을 USB 로 연결 → 상단 기기 목록에서 선택 → ▶ 실행.

`.xcodeproj` 는 **깃에 넣지 않는다**(`project.yml` 이 원본, 생성물은 `.gitignore` 처리).

---

## 2. 안드로이드에서 뭘 가져왔고, 뭘 못 가져왔나

`mobile-app/app/src/main/java/kr/co/mangoi/app/MainActivity.java` 와 1:1 대응이다.

| 안드로이드에서 하던 것 | iOS | 어디에 |
|---|---|---|
| 자동재생 허용 `setMediaPlaybackRequiresUserGesture(false)` | ✅ `mediaTypesRequiringUserActionForPlayback = []` | WebViewController |
| 카메라·마이크 권한 자동 승인 `onPermissionRequest` | ✅ `requestMediaCapturePermissionFor` (iOS 15+) | WebViewController |
| 새 창(`target="_blank"`)을 앱 안에서 열기 `onCreateWindow` | ✅ `createWebViewWith` → 메인 웹뷰에 로드 | WebViewController |
| 카카오톡 채널 상담 바로 열기 | ✅ `kakaoplus://` 스킴 | KakaoRouter |
| 네이티브 음성 `window.AndroidTTS` | ✅ **같은 이름 그대로** (AVSpeechSynthesizer) | TtsBridge |
| 옛 캐시 탈출 `?_app=시각` + 버전업 시 캐시 청소 | ✅ 동일 | WebViewController |
| 뒤로가기 버튼 | ✅ 화면 왼쪽 **가장자리 스와이프** (아이폰엔 버튼이 없음) | WebViewController |
| 파일 업로드 `onShowFileChooser` | ✅ WKWebView 기본 지원 (Info.plist 권한만 필요) | Info.plist |
| — | ➕ **JS 확인창**(alert/confirm/prompt) | WebViewController |
| — | ➕ **화상수업 오디오 라우팅**(스피커 고정) | AppDelegate |
| 시스템 글꼴 배율 무시 `setTextZoom(100)` | 불필요 — iOS 는 시스템 글꼴 크기가 웹뷰에 상속되지 않는다 | — |
| 🔴 패스키(WebAuthn) 얼굴/지문 로그인 | ❌ **못 함.** WKWebView 는 패스키 미지원(사파리 전용). 사이트가 미지원 시 버튼을 자동으로 숨기므로 동작에는 문제 없음. Face ID 로그인이 필요하면 네이티브 `ASAuthorization` 별도 개발 | — |
| 🔴 APK 자동 업데이트(app-version.json 폴링 → 설치) | ❌ **불가·불필요.** iOS 는 사이드로드가 금지라 업데이트는 App Store 가 담당. **고칠 때마다 심사를 다시 받아야 한다** | — |

### 🔴 운영 방식이 근본적으로 달라지는 지점

안드로이드는 "고치면 그날 폰에 반영"이었다. **iOS는 그게 안 된다.**
웹(HTML/JS) 수정은 그대로 즉시 반영되지만, **이 래퍼 앱 자체를 고치면 매번 App Store 심사**
(보통 24~48시간)를 거쳐야 한다. 다행히 우리 기능의 대부분은 웹 쪽에 있어서
앱 심사를 다시 받을 일은 드물다.

---

## 3. 🔴 App Store 심사 — 가장 큰 위험

**Guideline 4.2 (Minimum Functionality).** 애플은 "웹사이트를 그대로 감싸기만 한 앱"을
거절한다. 안드로이드는 심사가 없어서 겪지 않았던 관문이다.

이 프로젝트가 준비해 둔 반박 근거:

- 네이티브 음성 합성(AVSpeechSynthesizer) — 게임 5종의 발음이 시스템 음성으로 나감
- 카메라·마이크를 쓰는 실시간 화상수업(WebRTC)
- 화상수업용 오디오 세션·백그라운드 오디오
- 카카오톡 상담 앱 연동
- 화면 꺼짐 방지(`MangoiApp.keepAwake`)

**가장 확실한 추가 카드는 푸시알림(APNs)이다.** 수업 10분 전 알림·숙제 알림은 웹으로는
아이폰에서 제약이 크고, 네이티브 근거로도 강력하다. 다만 서버(`src/api-notify.ts`)에
APNs 연동을 새로 붙여야 하는 **숨은 공수**가 있다. 첫 제출에서 4.2로 반려되면 이걸 추가한다.

그 밖에 심사에서 반드시 요구되는 것:

- **개인정보 처리방침 URL** — 앱스토어 등록 필수 항목
- **App Privacy(수집 항목 신고)** — 학생 이름·학습기록·음성을 수집하므로 정확히 신고할 것
- **아동 대상 여부** — 학원 앱이라 애플이 Kids Category / 아동 개인정보 보호를 더 깐깐히 본다
- **심사용 테스트 계정** — 로그인 없이는 아무것도 못 보므로 심사팀에 계정을 반드시 제공
  (`demo-accounts` 참고). 이거 빠뜨리면 100% 반려된다.

---

## 4. 실기기 검증 (맥·아이폰에서 반드시 확인)

작성자가 확인하지 못한 항목들이다. 순서대로 확인할 것.

1. **화상수업 소리가 큰 스피커로 나오는가** — 귀에 대는 수화기로 나오면 `AppDelegate`
   의 오디오 세션 설정이 WebKit 과 충돌한 것. 에어팟 연결/해제도 같이 확인.
2. **카메라·마이크 최초 권한 팝업**이 뜨고, 허용하면 얼굴이 보이는가.
3. **게임 발음 속도** — 안드로이드와 iOS 는 속도 기준값이 달라 `TtsBridge` 에서 환산했다.
   말이 너무 빠르거나 느리면 그 환산식을 조정.
4. **카카오톡 상담 버튼** — 카카오톡이 깔린 폰에서 채팅방으로 바로 들어가는가.
5. **확인창**(수업 예약 등 confirm)이 실제로 뜨는가.
6. **가장자리 스와이프**로 뒤로 가는가.
7. **노치/홈 인디케이터**에 화면이 가리지 않는가 (사이트가 `viewport-fit=cover` 라 정상일 것).
8. **파일 첨부**(숙제 제출)에서 사진 선택이 되는가.

---

## 5. 버전 올리기

`project.yml` 의 `CURRENT_PROJECT_VERSION`(빌드 번호)을 **제출할 때마다 반드시 +1**.
같은 번호로는 App Store Connect 가 업로드를 거부한다.
사용자에게 보이는 버전은 `MARKETING_VERSION`.

---

## 6. 관련 문서

- 안드로이드 앱: `mobile-app/README.md`
- 설치 안내 페이지: `cloudflare-deploy/public/app.html`
- 프로젝트 규칙: 리포 루트 `CLAUDE.md`
