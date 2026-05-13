# mangoiweb 배포 가이드

이 폴더는 `webrtc-client-app-main` 프로젝트를 기반으로 GitHub 저장 + Cloudflare Workers 배포를 자동화한 패키지입니다.

## 한 번에 실행 (자동)

PowerShell을 **이 폴더(`mangoiweb(last)`)에서** 열고 아래 명령을 실행하세요:

```powershell
# 옵션 A) 환경변수로 토큰 미리 설정
$env:CLOUDFLARE_API_TOKEN = "여기에_Cloudflare_API_Token_붙여넣기"
.\setup-and-deploy.ps1 -GitHubRepo "https://github.com/navy111p-sudo/mangoiweb.git"

# 옵션 B) 토큰을 실행 중 안전 입력 (화면에 안 보임)
.\setup-and-deploy.ps1 -GitHubRepo "https://github.com/navy111p-sudo/mangoiweb.git"
```

> 실행이 막힌다면 PowerShell에서 한 번만:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

## 사전 준비

1. **GitHub**
   - 깃허브에서 빈 저장소 미리 만들기: <https://github.com/new>
   - 이름: 예) `mangoiweb` (private/public 자유)
   - **README, .gitignore, license는 추가하지 마세요** (충돌 방지)
   - 저장소 URL을 `-GitHubRepo` 인자로 넘기면 됩니다.
   - PC에 git이 설치돼 있어야 합니다: <https://git-scm.com/download/win>
   - 최초 실행 시 GitHub 인증 창이 뜨면 본인 계정으로 로그인하세요.

2. **Cloudflare API Token**
   - <https://dash.cloudflare.com/profile/api-tokens>
   - **Create Token → Edit Cloudflare Workers** 템플릿 사용 권장
   - 필수 권한: Workers Scripts (Edit), Workers KV Storage, D1, R2, Workers AI 등
   - 토큰은 한 번만 표시되니 안전한 곳에 보관

3. **Node.js**
   - LTS 버전 설치: <https://nodejs.org/>
   - `node -v` 으로 18 이상이면 OK

## 스크립트가 수행하는 단계

1. `git init -b main`
2. `.gitignore` 자동 생성 (없을 때만)
3. `git add . && git commit -m "Initial commit: mangoiweb 프로젝트"`
4. `git remote add origin <GitHubRepo>` 후 `git push -u origin main`
5. `cd cloudflare-deploy && npm install`
6. `npx wrangler@4 deploy` (base)
7. `npx wrangler@4 deploy --env production` (production)
8. 두 URL에 HEAD 요청을 보내 200 OK 확인

## 옵션

| 옵션 | 설명 |
|---|---|
| `-GitHubRepo` | 원격 저장소 URL (없으면 실행 중 물어봄) |
| `-CommitMessage` | 커밋 메시지 변경 |
| `-ApiToken` | Cloudflare 토큰을 인자로 전달 (env 미설정 시) |
| `-SkipGit` | Git 단계 건너뜀 |
| `-SkipDeploy` | Cloudflare 배포 건너뜀 |

## 폴더 구성

- `cloudflare-deploy/` — Cloudflare Workers 코드 (TypeScript), `wrangler.toml`, `public/`
- `modules/turn-relay/` — TURN 중계 모듈
- `focus-integrator/` — 학습 집중도 통합 모듈
- `public/` — 정적 자원
- `server.js` — Express 시그널링 서버 (로컬 개발용)
- `setup-and-deploy.ps1` — **자동화 스크립트 (실행 진입점)**
- `DEPLOY_README.md` — 이 문서

## 배포 후 확인 URL

- 베이스: <https://webrtc-unified-platform.navy111p.workers.dev/>
- 프로덕션: <https://webrtc-unified-platform-prod.navy111p.workers.dev/>

## 문제 해결

| 증상 | 해결 |
|---|---|
| `git: command not found` | Git for Windows 설치 |
| `node: command not found` | Node.js LTS 설치 |
| 토큰 검증 실패 | API Token 권한 재확인 (Workers/KV/D1/R2 모두 필요) |
| push가 reject 됨 | GitHub 저장소가 비어있는지 확인 (README도 만들지 말 것) |
| Durable Object migration 오류 | `wrangler.toml`의 `[[migrations]]` 섹션 확인 |
