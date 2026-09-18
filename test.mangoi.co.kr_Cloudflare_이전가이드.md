# test.mangoi.co.kr → Cloudflare Worker 연결 가이드

목표: `test.mangoi.co.kr` 을 새 망고아이 웹앱(Cloudflare Worker `webrtc-unified-platform`)에 연결.
방식: `mangoi.co.kr` 도메인을 cafe24 → **Cloudflare로 이전(네임서버 변경)** 후, 워커에 **Custom Domain** 추가.

> ⚠️ 네임서버를 바꾸면 `mangoi.co.kr`의 **모든 DNS가 Cloudflare로 넘어갑니다.**
> 아래 레코드를 Cloudflare에 **빠짐없이 먼저 만들어 둔 뒤** 네임서버를 바꿔야 기존 홈페이지·이메일이 안 끊깁니다.

---

## 0. 운영 중인 유료 cafe24 사이트는 그대로 유지됩니다 (먼저 읽어주세요)

현재 `mangoi.co.kr` 메인 사이트가 **cafe24 유료 호스팅**으로 운영 중인데, 이 이전 작업은 **사이트를 끄거나 옮기는 게 아닙니다.**

- **호스팅(사이트 운영) ≠ DNS(주소 안내).** 이번에 바꾸는 건 "주소를 안내하는 역할(DNS)"만 cafe24 → Cloudflare로 옮기는 것입니다.
- cafe24 **유료 호스팅 자체는 그대로 유지**되고, 사이트도 계속 cafe24 서버(`118.219.234.180`)에서 서비스됩니다. (cafe24 요금/계정 해지 아님.)
- 핵심 조건: 아래 `A`(루트)·`www`·`MX`(이메일) 레코드를 **Cloudflare에 동일하게 옮기고 회색 구름(DNS only)** 으로 두면, 방문자·이메일 입장에서는 **달라지는 게 없습니다.**
- 즉 Cloudflare는 "이 도메인은 cafe24 서버(118.219.234.180)로 가세요"라고 안내만 하고, 실제 사이트는 계속 cafe24가 보여줍니다. 추가로 `test` 서브도메인만 Cloudflare 워커로 안내합니다.

> 만약 전체 도메인 이전이 부담되면, 메인 도메인은 cafe24에 그대로 두고 **유료 옵션(Cloudflare for SaaS 커스텀 호스트네임)** 으로 `test` 만 워커에 붙이는 방법도 있습니다. 다만 설정이 더 복잡하고 Workers 유료 플랜이 필요해, 단일 테스트 서브도메인에는 권장하지 않습니다.

---

## 1. 현재 cafe24에 등록된 DNS 레코드 (이전 시 반드시 보존)

조회일: 2026-06-22 / 출처: 공개 DNS 조회

| 종류 | 이름(Name) | 값(Content) | 우선순위/비고 | 프록시 |
|------|-----------|------------|--------------|--------|
| A | `@` (mangoi.co.kr) | `118.219.234.180` | cafe24 호스팅 서버 | **DNS only(회색)** |
| CNAME | `www` | `mangoi.co.kr` | 메인 사이트 www | **DNS only(회색)** |
| MX | `@` | `smtp.google.com` | 우선순위 **1** · Google 이메일(필수) | — |
| TXT | `@` | `v=spf1 ip4:118.219.234.180 ~all` | SPF | — |
| TXT | `@` | `google-site-verification=-A1dkLuJjAVChpdXTzxBpyJa9UhEULN-quJZXzq5c_Y` | Google 도메인 인증 | — |
| TXT | `google._domainkey` | `v=DKIM1;k=rsa;p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDY22wx7r+IB8hXOdDx7SWQfiVgiq4VD+m0bn7lcm7rO3kkfnp1Clk9aVOOyxKDkd4W2VVGzd9Y5dB/Osvl72GyO20Ajk7+zbhLxKqCCrQR4IVKPiKVMEcOzQ9fQBeda6ZmOw7M4J5Y7d6Q0ErQEdD+9sbR5Yejyy35k8fvoLwBwIDAQAB` | DKIM(이메일 서명, 필수) | — |
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:root@mangoi.co.kr` | DMARC | — |
| ~~CNAME~~ | ~~`test`~~ | ~~`mangoi.co.kr`~~ | **삭제** → 4단계에서 워커 Custom Domain으로 대체 | — |

> 📌 **A/CNAME 레코드는 "DNS only(회색 구름)"** 로 두세요. cafe24 호스팅 앞에 Cloudflare CDN을 끼우면 SSL·동작이 달라질 수 있으니, 일단 지금과 동일하게 유지하는 게 안전합니다. (워커용 `test` 만 자동으로 프록시됩니다.)
> 📌 위 목록은 공개 조회분입니다. **cafe24 DNS 관리 화면을 직접 열어 다른 서브도메인/레코드가 더 있는지 한 번 더 대조**하세요. Cloudflare 자동 스캔이 대부분 가져오지만, 최종 책임 확인은 cafe24 원본 기준입니다.
> 📌 SPF가 Google이 아닌 cafe24 IP만 허용하도록 되어 있는데, 이는 기존 설정이므로 **그대로 복사**만 하세요(이전 작업 중 메일 정책을 바꾸지 않기 위함).

---

## 2. Cloudflare에 도메인 추가 + 레코드 확인

1. Cloudflare 대시보드 → **Add a site** → `mangoi.co.kr` 입력 → **Free 플랜** 선택.
2. Cloudflare가 기존 DNS를 자동 스캔합니다 → **1번 표의 모든 레코드가 들어왔는지 대조**.
   - 빠진 게 있으면 **DNS → Records → Add record** 로 직접 추가.
   - 특히 **MX / DKIM(google._domainkey) / SPF / DMARC** 4개가 있는지 꼭 확인(이메일 직결).
3. A·CNAME은 **회색 구름(DNS only)** 인지 확인.

## 3. cafe24에서 네임서버 변경

1. Cloudflare가 배정한 **네임서버 2개** 확인 (예: `xxx.ns.cloudflare.com`, `yyy.ns.cloudflare.com`).
2. cafe24 → 도메인 관리 → `mangoi.co.kr` → **네임서버 설정** → 기존
   `cns1.simplexi.com` / `cns2.simplexi.com` 을 **Cloudflare 네임서버로 교체**.
3. 적용까지 보통 수십 분~수 시간(최대 24~48h). Cloudflare에서 "Active" 상태가 되면 완료.

## 4. 워커에 Custom Domain 추가

1. Cloudflare → **Workers & Pages** → `webrtc-unified-platform` 선택.
2. **Settings → Domains & Routes → Add → Custom Domain**.
3. `test.mangoi.co.kr` 입력 → 추가. DNS 레코드·SSL 인증서는 Cloudflare가 자동 생성.
4. 1~2분 후 `https://test.mangoi.co.kr` 접속 → 새 망고아이 웹앱이 뜨면 성공.

---

## 5. 마무리 점검

- [ ] `https://test.mangoi.co.kr` 새 버전 정상 표시 (시크릿창으로 확인 권장)
- [ ] `https://mangoi.co.kr` / `https://www.mangoi.co.kr` 기존 홈페이지 정상
- [ ] 이메일 송수신 정상 (테스트 메일 1통)
- [ ] cafe24의 기존 `test` CNAME 레코드는 더 이상 필요 없음(워커 도메인이 대체)

---

### 참고: 왜 cafe24 CNAME만으로는 안 되나
Cloudflare Worker의 `*.workers.dev` 주소는 그 호스트네임에만 응답합니다. 외부 DNS(cafe24)에서 workers.dev로 CNAME을 걸면 Cloudflare가 오류(1014/530)를 반환하므로, 도메인을 Cloudflare 계정 안으로 가져와 **Custom Domain** 으로 붙이는 위 방식이 정석입니다.
