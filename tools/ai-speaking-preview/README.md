# AI 말하기 화면 검증 샘플

운영과 분리한 화면 샘플입니다. 기존 자산과 눈·입 애니메이션을 유지합니다.
AI 응답·녹음·평가·계정 저장·보상·실수업 연결은 구현하지 않았습니다.
질문 답변은 미리 작성한 예시이며 음성 버튼은 기기 SpeechSynthesis입니다.

```sh
node tools/ai-speaking-preview/server.mjs
# http://127.0.0.1:8769/          Emma 기존 원본
# http://127.0.0.1:8769/lily.html Lily 전체 원본 표시
# http://127.0.0.1:8769/jake.html Jake 흉상 프레임
```

포트 충돌 시 `PREVIEW_PORT=8770` 등으로 지정합니다. 서버는 localhost에만 바인딩하며
API 경로를 거부합니다. 기존 이미지·아바타 코드는 `cloudflare-deploy/public`에서 읽어
중복 저장하지 않습니다. Lily의 원본 crop만 검증용 응답에서 제거하며 제품 파일은 수정하지 않습니다.
Jake는 기존 512×496 흉상을 명시적인 프레임 안에 표시합니다. 새 팔을 생성하지 않았습니다.
Emma·Noah 확장 PNG는 별도 자산 전달 작업이 `assets/`에 추가할 예정이며 아직 통합하지 않았습니다.
생성 이미지 얼굴을 원본과 동일한 픽셀로 가정해서는 안 됩니다.

## 검사

```sh
# Playwright는 저장소 밖에 설치합니다. Chromium 경로는 환경에 맞게 지정합니다.
npm install --prefix /tmp/pw --cache /tmp/npm-cache playwright-core
PW_DIR=/tmp/pw CHROMIUM=/usr/bin/chromium node tools/ai-speaking-preview/browser-test.mjs
```

네트워크는 로컬 fixture 자산만 허용합니다. 모의 모바일·태블릿·PC에서 기능·가독성과
프레임·도움 개폐·애니메이션을 검사하며 실제 기기 및 실제 TTS/STT 품질 검증과 구분합니다.
`evidence/`에는 샘플 데이터만 담긴 캡처와 이전 독립 검증 기록이 있습니다.
원본 샘플 제작 기준은 `9e8d7d67a4918050b54018e9022e3a8d8264a6ed`,
게시 기준은 최신 main `f393fc90a62af0c4a428a79344673fa6c814445a`입니다.
게시 버전은 최신 main의 아바타 callback race 수정도 그대로 읽어 사용합니다.

## 이후 구현 범위 — 아직 구현하지 않음

- 상황이 바뀔 때 배경 자동 변경, 같은 대화 중 무작위 변경 금지.
- 배경 직접 선택·현재 배경 고정·단색 모드. 변경 시 대화·아바타 눈입·설정 유지.
- 영어/중국어, 자유/균형/집중교정, 수동/자동 베타, 연령·수준·수준찾기,
  교재/자유 및 안내 등 AI 말하기 기존 설정을 모두 보존하며 연결.
- 문맥·취소·늦은 응답·중복 저장/보상 방지 및 모의/전체 회귀 검증.

이 폴더를 `cloudflare-deploy/public`으로 옮기거나 운영에 배포하지 않습니다.
main 병합·PR·운영 배포는 이번 검증 브랜치 게시 승인에 포함되지 않았습니다.
