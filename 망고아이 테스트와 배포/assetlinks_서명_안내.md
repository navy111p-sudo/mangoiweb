# 망고아이 TWA 서명 & assetlinks.json 안내 (2026-06-22)

## 1. 확정된 값 (코드/서버에 이미 반영됨)
| 항목 | 값 |
|---|---|
| 패키지명(applicationId) | `dev.workers.navy111p.webrtc_unified_platform.twa` |
| TWA 대상 사이트 | `https://webrtc-unified-platform.navy111p.workers.dev` |
| 서명 SHA-256 지문 | `D3:8E:1B:5A:C3:CE:F1:8C:F3:FE:C0:49:F1:AB:D0:14:47:2A:89:AA:91:78:6D:00:C6:74:57:96:0A:9C:77:11` |
| 키스토어 파일 | `mangoi-release.keystore` (이 폴더에 저장됨) |
| 키스토어 비밀번호 / alias | `Mangoi2026!key` / `mangoi` |

> assetlinks.json 은 위 지문으로 **이미 작성·서버 배포**되었습니다.
> 따라서 APK/AAB 는 **반드시 이 `mangoi-release.keystore` 로 서명**해야 전체화면(주소창 제거) 검증이 통과합니다.

## 2. ⚠️ 키스토어 보관 (매우 중요)
- `mangoi-release.keystore` 와 비밀번호를 **잃어버리면 앱 업데이트가 영구 불가**합니다.
- 안전한 곳(비밀번호 관리자/외장 저장소)에 **반드시 백업**하세요.

## 3. 내 폰에 설치해 테스트하기 (브로셔 STAGE 2) — APK 서명
업로드해주신 `Mangoi-unsigned.apk` 를 이 키스토어로 서명하면 폰에 설치됩니다.
Android SDK build-tools 의 `apksigner` 사용 (PC에서 실행):

```bash
# 1) 정렬(zipalign) 후 서명
zipalign -v 4 Mangoi-unsigned.apk Mangoi-aligned.apk
apksigner sign --ks mangoi-release.keystore --ks-key-alias mangoi \
  --ks-pass pass:Mangoi2026!key --key-pass pass:Mangoi2026!key \
  --out Mangoi-signed.apk Mangoi-aligned.apk

# 2) 서명 확인 (지문이 위 표와 일치해야 함)
apksigner verify --print-certs Mangoi-signed.apk
```
- `Mangoi-signed.apk` 를 USB로 폰에 옮겨 설치 → 카메라/마이크/전체화면 확인.
- 설치가 안 되면 폰 설정 → "출처를 알 수 없는 앱 설치" 허용.

## 4. 구글 플레이 정식 출시 (브로셔 STAGE 3) — AAB 업로드
- `Mangoi-unsigned.aab` 를 위 키스토어로 서명 후 Play Console 에 업로드하거나,
  Play Console 의 **Play 앱 서명(Play App Signing)** 을 사용합니다.
- **Play 앱 서명을 쓰면** 구글이 최종 배포 서명키를 따로 관리하므로,
  Play Console → 앱 → **설정 → 앱 무결성 → 앱 서명** 에 표시되는 **앱 서명 키 SHA-256** 을
  `assetlinks.json` 의 `sha256_cert_fingerprints` 배열에 **한 줄 더 추가**해야 합니다.
  (업로드 키 지문과 배포 키 지문이 다르기 때문 — 둘 다 넣으면 테스트/정식 모두 전체화면 유지)

## 5. assetlinks 검증 방법
배포 후 아래로 확인:
- 브라우저: `https://webrtc-unified-platform.navy111p.workers.dev/.well-known/assetlinks.json` 접속 → JSON 표시
- 구글 검증기: https://developers.google.com/digital-asset-links/tools/generator
- 폰에서 앱 실행 시 상단 주소창이 사라지면 검증 성공.
