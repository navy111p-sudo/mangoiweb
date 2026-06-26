# 망고아이 테스트 APK (WebView 래퍼)

`https://test.mangoi.co.kr/` 를 로드하는 안드로이드 WebView 앱입니다.
화상통화(WebRTC)를 위해 카메라·마이크 권한 자동 처리, 파일 업로드, 자동재생을 지원합니다.

## APK 받는 방법 (권장: GitHub Actions)

1. 이 변경사항을 GitHub(`navy111p-sudo/mangoiweb`)에 push 합니다.
   ```
   git add mobile-app .github/workflows/android.yml
   git commit -m "Add Mangoi test WebView APK build"
   git push
   ```
2. GitHub 저장소 → **Actions** 탭 → **Build Mangoi Test APK** 워크플로 실행이 끝나면
3. 실행 결과 화면 하단 **Artifacts**에서 `mangoi-test-signed-apk` 다운로드 → 압축 해제 →
   `mangoi-test-signed.apk` 를 휴대폰에 설치합니다.
   (수동 실행: Actions 탭에서 **Run workflow** 버튼)

## 로컬에서 직접 빌드 (Android Studio / Gradle)

Android SDK가 설치된 PC에서:
```
cd mobile-app
gradle assembleRelease     # 또는 Android Studio에서 mobile-app 폴더 열기
```
결과물: `app/build/outputs/apk/release/app-release.apk`

## 서명 정보

테스트용 키스토어 `keystore/mango.jks` 로 release 서명됩니다.

| 항목 | 값 |
|---|---|
| storePassword | `mango1234` |
| keyAlias | `mango` |
| keyPassword | `mango1234` |

> ⚠️ 이 키스토어는 테스트 전용입니다. Google Play 등 실제 배포에는 별도의 안전한 키스토어를 새로 만들어 사용하세요.

## 휴대폰 설치 시

설정에서 "알 수 없는 출처(이 출처 허용)" 설치를 허용해야 합니다.
앱 첫 실행 시 카메라·마이크 권한을 허용해 주세요.
