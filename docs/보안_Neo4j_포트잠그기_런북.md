# 🔒 Neo4j 포트 잠그기 — 같이 하는 순서표 (런북)

작성: 2026-07-10 (새벽). **실행은 내일 낮, 정신 맑을 때 Claude와 함께.**
대상 서버: `mangoi.co.kr` / `118.219.234.180` (CentOS 7.6, root 접속 확인됨)

> 이 문서는 "그냥 읽는 설명서"가 아니라, **낮에 Claude와 한 줄씩 같이 실행하는 대본**입니다.
> 혼자 몰아서 실행하지 마세요. 각 단계마다 결과를 Claude에게 보여주고 "다음" 확인을 받으세요.

---

## 0. 지금까지 확인된 사실 (진단 완료)

- 방화벽(firewalld) **꺼져 있음** → 그래서 포트가 다 열림
- Neo4j가 **7687(bolt)**, **8880(http)** 두 포트를 인터넷에 노출 중
- 우리 시스템(Worker)은 **8880(http)만** 사용. **7687은 아무도 안 씀**
- Neo4j 인증(비밀번호)은 켜져 있음 → "문은 열렸지만 금고는 잠김" = **급하지 않음**

## 목표

1. **7687(안 쓰는 문) 완전히 닫기** ← 쉽고 안전한 1차 (위험 거의 0)
2. **8880(쓰는 문)을 인터넷에서 숨기고 암호화** ← 큰 작업(Cloudflare 터널). 이건 같이 신중히, 부담되면 개발자에게.

---

## 🛡️ 절대 규칙 (매번 지킴)

1. **22번 포트(SSH 접속용)는 어떤 명령에서도 건드리지 않는다.** → 튕겨나갈 일 없음.
2. **창을 2개 열어둔다.** 하나는 작업용, 하나는 "만약을 위한 예비 접속"(끊기면 예비 창으로 되돌림).
3. 한 단계 하면 **반드시 확인 → Claude OK → 다음.** 몰아서 X.
4. 뭐든 바꾸기 전에 **원래 상태를 백업**(복사)해 둔다.
5. 이상하면 **멈추고 스크린샷.** 되돌리는 법이 각 단계에 있음.

---

## Phase 0 — 준비 (바꾸는 것 없음, 안전)

**0-1. 창 2개로 접속** (PowerShell 두 개 다 `ssh root@118.219.234.180`)
- 1번 창 = 작업용, 2번 창 = 예비용(그냥 열어두기)

**0-2. Neo4j 설정 파일 위치 찾기 (읽기만)**
```
find / -name neo4j.conf 2>/dev/null
```
→ 나온 경로를 Claude에게 알려주기 (보통 `/etc/neo4j/neo4j.conf` 또는 `.../conf/neo4j.conf`)

**0-3. 설정 파일 백업** (원본을 안전하게 복사 — 되돌릴 때 씀)
```
cp <위에서_찾은_경로> <같은_경로>.bak-20260710
ls -l <같은_경로>*
```
→ `.bak-20260710` 파일이 생기면 OK

**0-4. 현재 노출 상태 기록 (읽기만)**
```
ss -tlnp | grep -E '7687|8880'
```
→ 지금은 `:::7687`, `:::8880` (전체 개방)로 보일 것. 나중에 비교용.

---

## Phase 1 — 안 쓰는 7687 포트 닫기 (쉬움·안전, 오늘의 핵심)

> 7687은 우리 시스템이 안 쓰므로, 닫아도 **아무 기능도 안 깨집니다.** 위험 거의 없음.

**1-1. 설정 파일에서 bolt 주소를 "내부 전용"으로 바꾸기**
- Claude가 정확한 줄을 알려주고, `vi` 또는 안전한 `sed` 명령으로 수정:
  - `dbms.connector.bolt.listen_address` 를 `127.0.0.1:7687` 로 (또는 bolt를 `false`로 비활성)
- (정확한 수정 명령은 0-2에서 찾은 파일 내용을 보고 Claude가 그 자리에서 만들어 줌)

**1-2. Neo4j 재시작** (그래프 기능이 20~30초 잠깐 멈췄다 돌아옴 — 정상)
```
systemctl restart neo4j
sleep 20
systemctl status neo4j --no-pager | head -5
```
→ `active (running)` 확인

**1-3. 확인: 7687이 이제 내부에서만 열림**
```
ss -tlnp | grep -E '7687|8880'
```
→ 이제 `127.0.0.1:7687` (내부 전용), `8880`은 아직 그대로

**1-4. 확인: 우리 시스템 정상** — Claude가 admin 학생목록/강사매칭이 잘 되는지 라이브로 점검
→ 정상이면 Phase 1 완료! (여기까지만 해도 공격면 절반 감소)

**🔙 되돌리기(문제 시):** `cp <경로>.bak-20260710 <경로>` 후 `systemctl restart neo4j`

---

## Phase 2 — 8880을 인터넷에서 숨기기 (Cloudflare 터널) · 신중히

> 이건 우리가 실제로 쓰는 문이라, "숨기면서도 우리 시스템은 계속 되게" 해야 함.
> 부담되면 **여기서 멈추고 개발자에게** 이 Phase만 맡겨도 됩니다.

**2-1. cloudflared 설치** (Cloudflare 공식 연결 프로그램)
```
curl -L -o /usr/local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x /usr/local/bin/cloudflared
cloudflared --version
```

**2-2. Cloudflare 계정에 연결** (브라우저 인증 — 시크릿 넣을 때 쓰는 그 계정)
```
cloudflared tunnel login
```
→ 화면에 뜬 링크를 브라우저에서 열어 도메인 선택·승인

**2-3. 터널 만들기 + Neo4j에 연결**
- `cloudflared tunnel create mangoi-neo4j`
- 설정 파일 작성: `neo4j.mango-i.com` → `http://localhost:8880` 로 연결
- `cloudflared tunnel route dns mangoi-neo4j neo4j.mango-i.com`
- (정확한 설정 파일 내용은 Claude가 2-2 결과 보고 만들어 줌)

**2-4. 터널을 서비스로 등록** (서버 재부팅돼도 자동 실행)
```
cloudflared service install
systemctl status cloudflared --no-pager | head -5
```

**2-5. 확인: 터널로 Neo4j에 닿는지** — Claude가 `https://neo4j.mango-i.com` 경로로 점검

---

## Phase 3 — 우리 시스템을 터널 주소로 전환

**3-1. Worker 시크릿 교체** (Claude가 실행 — 기본+prod 두 워커)
- `NEO4J_QUERY_URL` 을 `https://neo4j.mango-i.com/db/neo4j/tx/commit` 로
**3-2. 배포 + 확인** — admin 학생목록·강사매칭·웜업 개인화가 **여전히 정상**인지 라이브 점검
→ 정상 확인되면 다음. **안 되면 시크릿을 원래대로 되돌리고 멈춤.**

---

## Phase 4 — 이제 8880 문을 인터넷에서 닫기 (마무리)

> 3단계에서 "터널로도 잘 된다"가 확인된 뒤에만 진행.

**4-1. 설정에서 http도 내부 전용으로**
- `dbms.connector.http.listen_address` → `127.0.0.1:8880`
**4-2. 재시작 + 확인**
```
systemctl restart neo4j; sleep 20
ss -tlnp | grep -E '7687|8880'
```
→ 이제 둘 다 `127.0.0.1` (내부 전용) = **인터넷에서 안 보임** 🎉
**4-3. 외부에서 진짜 막혔는지 확인** — Claude가 바깥에서 8880 두드려서 "차단됨" 확인
**4-4. 우리 시스템 최종 정상 확인** (터널 경유로 모든 그래프 기능 OK)

**🔙 되돌리기:** 설정을 `.bak`으로 복구 후 재시작하면 원래대로.

---

## Phase 5 — 뒷정리 (나중에, 급하지 않음)

- 채팅에 노출된 **root·MySQL 비밀번호 교체** (Claude와 함께, `passwd` 등)
- (선택) Cloudflare Access로 "우리 Worker만" 터널에 접근하게 잠그기 — 최고 수준 보안

---

## 오늘/내일 진행 요약

| 시점 | 할 일 |
|---|---|
| 오늘 밤 | 서버 접속 종료(`exit`), 이 런북만 읽어보기. 서버 변경 X |
| 내일 낮 | Phase 0~1 (안전한 부분) 같이 → 잘 되면 Phase 2~4 (터널) 같이 or 개발자 |

**핵심:** 급하지 않다. 천천히, 확인하며, 되돌릴 수 있게. 22번 포트는 절대 안 건드린다.
