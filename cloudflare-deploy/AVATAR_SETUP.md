# 🥭 말하는 AI 아바타 (D-ID) 설정 가이드

홈 화면 **왼쪽 위**에 아바타가 추가됐습니다.
- **지금(키 없음):** 망고 캐릭터 + AI 답변 말풍선이 보입니다.
- **D-ID 키 입력 후:** 실사 아바타가 망고 AI 답변을 **음성으로** 말합니다.

---

## 1단계 — D-ID 가입 & Agent 만들기

1. https://studio.d-id.com 접속 → 가입(무료 체험 20크레딧 제공).
   - 실시간 스트리밍 아바타를 계속 쓰려면 유료 플랜이 필요합니다(월 $5.90~, API/Agents 포함 플랜 권장).
2. **Agents → Create Agent** 클릭.
3. 아바타 **이미지(실사 얼굴)** 와 **음성** 선택.
   - 음성은 한국어(예: `ko-KR-SunHi`)로 두면 한국어 답변이 자연스럽습니다.
4. 저장.

## 2단계 — Embed 키 2개 복사

1. **Agents 갤러리**에서 만든 Agent 위에 마우스를 올리고 **`[...]` → `</> Embed`** 클릭.
2. **Allowed domains(허용 도메인)** 에 아래를 모두 추가:
   - `https://webrtc-unified-platform.navy111p.workers.dev`
   - `https://www.mangoi.co.kr`  (사용 중인 도메인이 있으면 함께)
   - `http://localhost` (로컬 테스트용, 선택)
3. 코드 스니펫에서 두 값을 복사:
   - `data-agent-id`  → **agentId**
   - `data-client-key` → **clientKey**

> clientKey는 도메인 제한이 걸린 공개 키라 프론트에 넣어도 안전합니다.

## 3단계 — 키 붙여넣기

`cloudflare-deploy/public/index.html` 파일에서 아래 부분을 찾아 두 값을 넣으세요
(검색: `MANGO_AVATAR_CONFIG`).

```js
window.MANGO_AVATAR_CONFIG = {
  agentId:   'agt_여기에붙여넣기',
  clientKey: '여기에붙여넣기',
  voiceKo:   'ko-KR-SunHiNeural',
  voiceEn:   'en-US-JennyNeural'
};
```

저에게 두 값을 채팅으로 주시면 제가 대신 넣어드립니다(공개·도메인 제한 키라 안전).

## 4단계 — 배포

`mangoiweb(last)` 폴더에서 **`deploy.bat`** 더블클릭 → git commit·push·Cloudflare 배포가 자동으로 됩니다.

---

## 동작 방식
- 사용자가 홈 검색창에 질문 → 망고 AI(`/api/student/ai-command`)가 답변 생성
- 그 답변을 아바타가 말풍선으로 표시 + (키 설정 시) 음성으로 말함
- 한글 답변이면 한국어 음성, 영어면 영어 음성 자동 선택
- 아바타는 홈 화면에서만 표시, 연결은 첫 답변 때 자동(분 절약)

## 비용 메모
- D-ID는 말한 영상 길이만큼 크레딧 차감(요금제별 분 제공).
- 분 절약을 위해 **첫 질문 때 연결**하도록 설계했습니다. 페이지 열자마자 연결하려면 config에 `autoConnect: true` 추가.
