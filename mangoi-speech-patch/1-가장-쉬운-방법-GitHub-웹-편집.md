# 🌐 가장 쉬운 방법 — GitHub 웹에서 30초 commit

Git 설치 / 명령어 / 인증 토큰 전혀 필요 없습니다.
브라우저에서 클릭 몇 번이면 끝납니다.

## 단계 (5 클릭)

### 1️⃣ GitHub 편집 화면 바로 열기
아래 링크 클릭 (로그인 안 되어 있으면 자동으로 GitHub 로그인 화면이 뜹니다):

👉 **https://github.com/navy111p-sudo/mangoi_Speech/edit/main/js/category-ui.js**

### 2️⃣ 기존 내용 전체 선택해서 삭제
- 편집기 안 아무 곳이나 클릭 후 **`Ctrl + A`** (전체 선택)
- **`Delete`** 키로 모두 삭제

### 3️⃣ 새 코드 붙여넣기
같은 폴더에 있는 **`category-ui.js`** 파일을 메모장으로 열어서
**`Ctrl + A`** → **`Ctrl + C`** 로 전체 복사 → GitHub 편집기에 **`Ctrl + V`**

(또는 `outputs` 폴더의 **`category-ui-v3-with-chinese.js`** 파일도 동일한 내용)

### 4️⃣ Commit changes
- 페이지 우측 상단 초록색 **`Commit changes...`** 버튼 클릭
- 팝업이 뜨면 그대로 또 **`Commit changes`** 버튼 클릭 (메시지 자동 생성 OK)

### 5️⃣ 끝! — Cloudflare Pages 자동 배포 대기
- Commit 후 1~2분이면 자동 빌드가 끝납니다
- 확인: https://mangoi-speech.pages.dev/practice
- "🇨🇳 中文 (Lv 1~20)" 카드가 Phonics / BTS / SIU 옆에 나타납니다
- 클릭하면 우리 mangoiweb 의 `/speech-coach-cn.html` (다락원 + Lv 1~20) 로 자동 이동

## 만약 GitHub 로그인이 다른 계정이면?

- 우측 상단 프로필 → **Sign out** 후
- `navy111p-sudo` 계정으로 다시 로그인

## 캐시 때문에 안 보이면?

브라우저에서 `Ctrl + Shift + R` (강력 새로고침) — 서비스 워커가 옛 JS 를 캐싱했을 수 있음
