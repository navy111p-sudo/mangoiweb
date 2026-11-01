# 검증 브랜치 게시 기록

- 날짜: 2026-11-01. 사용자 승인: 별도 검증 브랜치 게시만. main·PR·배포 제외.
- 기준 main: `f393fc90a62af0c4a428a79344673fa6c814445a`.
- 경로: `tools/ai-speaking-preview/`만 추가. 운영 public·API·보안 설정 변경 없음.
- 샘플은 실제 사용자 정보 없이 작성한 고정 문장입니다. 인증·실계정·수업·출석·결제·보상 쓰기 없음.
- Emma 기본, Lily 전체 crop, Jake 원본 흉상 프레임을 포함합니다.
- 기존 Library 확장 이미지의 다운로드 실패를 우회하지 않았습니다. 생성 확장본 통합은 미완료입니다.

## 실행한 검사

- `node --check tools/ai-speaking-preview/server.mjs` 통과.
- `node --check tools/ai-speaking-preview/browser-test.mjs` 통과.
- 세 HTML의 인라인 script 총 6개를 `vm.Script`로 구문 검사: 통과.
- `PW_DIR=/tmp/pw CHROMIUM=/usr/bin/chromium node tools/ai-speaking-preview/browser-test.mjs`: **98 PASS**.
- 모의 390×844, 768×1024, 1366×900 × Emma/Lily/Jake.
- API 거부, 외부 요청 없음, 아바타 렌더링, 가로 넘침 없음, 44px 터치 영역,
  질문·예시·Escape·포커스·번역·속도, 도움 후 입모양, idle 애니메이션, JS 오류 없음.
- Lily adapter가 source crop 한 곳만 바꾸며 나머지 엔진과 패치 좌표를 보존하는지 비교.
- Jake의 원본 흉상을 대사판이 가리지 않는지 확인.
- `git diff --check` 통과, 새 텍스트에 키·토큰·계정·개인 대화·실행 환경 절대경로를 포함하지 않는지 점검.

## 범위와 미실행

실제 휴대폰/태블릿·실제 소프트키보드/주소창·유료 TTS/STT/AI·음성/입 정밀 동기화·
실수업 WebRTC·로그인·보상·동시 저장은 검증하지 않았습니다.
브라우저에서 원본 입모양 렌더 API를 호출한 검증은 실제 TTS 재생 검증과 다릅니다.
이 검증 폴더만 추가하는 게시이므로 제품 전체 타입/빌드/캐시/전체 하니스는 실행하지 않았습니다.
이후 실제 기능 구현에서 해당 게이트와 baseline 비교를 다시 수행해야 합니다.

`lily-test-final.log`, `jake-test.log`와 캡처는 이전 샘플의 독립 검증 기록입니다.
`branch-browser-test.log`는 최신 main의 원본 아바타 엔진을 사용하는 게시 코드 기준 결과입니다.
어떤 기록도 전 기기 무결함이나 운영 연결 완료를 뜻하지 않습니다.
