# 🔐 GitHub Personal Access Token (PAT) 발급 + 사용법

## ⚠️ 보안 주의
- 토큰은 비밀번호와 같습니다 — 채팅창, 메모장, 카톡 등에 절대 보내지 마세요
- 한 번만 봤다가 잊어버리면 다시 발급받아야 합니다
- 본인 컴퓨터에서만 입력하세요

---

## 1️⃣ 토큰 발급 (5분)

### 단계 A — 토큰 페이지 열기
브라우저로 접속 (이미 GitHub 로그인된 상태여야 함):

👉 **https://github.com/settings/tokens?type=beta**

### 단계 B — 새 토큰 생성
1. 우상단 **"Generate new token"** 클릭
2. **Token name**: `mangoi_Speech-push` (아무 이름이나)
3. **Expiration**: `90 days` 또는 `Custom` 으로 설정 (짧을수록 안전)
4. **Repository access**: **`Only select repositories`** 선택
   - 드롭다운에서 `navy111p-sudo/mangoi_Speech` 만 선택
5. **Permissions** → **Repository permissions** 펼치기
   - **Contents**: **`Read and write`** ← 가장 중요
   - **Metadata**: `Read-only` (자동 선택됨)
   - 나머지는 그대로 두기
6. 페이지 맨 아래 **"Generate token"** 클릭

### 단계 C — 토큰 복사
- 화면에 `github_pat_xxxxxxxxxxxxxxxxx...` 같은 긴 문자열이 한 번만 표시됨
- **`Ctrl + C`** 로 복사 (이 페이지를 닫으면 다시 볼 수 없음)
- 임시로 메모장에 붙여넣어도 되지만 push 후 바로 삭제

---

## 2️⃣ 토큰 입력 — 어디에?

**`apply-and-push.bat` 더블클릭** → 자동으로 진행되다가 마지막 push 단계에서
검은 화면에 이런 프롬프트가 뜹니다:

```
Username for 'https://github.com': _
```

여기에 입력:
```
Username for 'https://github.com': navy111p-sudo  ← 본인 GitHub ID
Password for 'https://navy111p-sudo@github.com': github_pat_xxxxx...  ← 위에서 복사한 토큰 붙여넣기
```

> 💡 **참고:** Password 입력 시 화면에는 아무것도 안 보입니다 (보안). 그냥 붙여넣고 Enter

---

## 3️⃣ 한 번 입력하면 다음부터는 자동

Git for Windows 의 **Credential Manager** 가 토큰을 Windows 자격 증명에 안전하게 저장합니다.
다음에 `apply-and-push.bat` 다시 실행할 때는 토큰 입력 없이 자동 push 됩니다.

---

## ❓ 토큰 입력 프롬프트가 안 뜨고 그냥 실패한다면?

Windows 가 옛날에 저장된 잘못된 자격 증명을 쓰고 있을 수 있습니다.
**Windows 자격 증명 관리자** 에서 GitHub 관련 항목을 지우세요:

1. `Win + R` → `control` → Enter
2. **사용자 계정** → **자격 증명 관리자**
3. **Windows 자격 증명** 탭
4. `git:https://github.com` 으로 시작하는 항목을 찾아 **제거**
5. `apply-and-push.bat` 다시 실행 → 토큰 프롬프트가 다시 뜸

---

## 🔄 가장 쉬운 우회 — 토큰 없이도 가능

토큰 발급이 번거로우면 그냥 **GitHub 웹에서 직접 편집**하세요 — 30초로 끝납니다:

같은 폴더의 **`1-가장-쉬운-방법-GitHub-웹-편집.md`** 참고 (토큰 불필요, 로그인만 하면 됨)

---

## 토큰을 쓴 다음 안전한 정리

- push 가 성공했고 다시 쓸 일 없으면:
  - https://github.com/settings/tokens?type=beta 에서 해당 토큰 **Revoke** 클릭
- 90일 후 자동 만료되므로 잊고 있어도 안전
