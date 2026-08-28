/**
 * 사람에게 나가는 링크의 **정본 주소**.
 *
 * [왜 이 파일이 있는가]
 *   학부모 문자·알림톡·레벨테스트 티켓·재등록 안내가 각자 주소를 손으로 적고 있었다.
 *   그 결과 도메인이 바뀔 때마다 20곳 넘게 찾아다녀야 했고, 실제로 한 번은 등록조차 안 된
 *   `mango-i.com` 이 학부모 문자에 들어갈 뻔했다(2026-08-09). 이제 여기 한 줄만 고치면 된다.
 *
 * [주의]
 *   · `mango-i.com` 은 **등록조차 안 된 도메인**이다(NXDOMAIN 실측). 절대 쓰지 말 것.
 *   · `mangoi.co.kr` / `www.mangoi.co.kr` 은 **구 서버**(옛 PHP LMS). Worker 경로가 없다.
 *   · `test.mangoi.co.kr` 은 **먼저 붙인 커스텀 도메인**이라 아직 살아 있다.
 *     앱 시작 URL·스모크 테스트·워치독이 그 주소를 붙박이로 쓰므로 **죽이면 안 된다**.
 *     ✅ (2026-08-27 이전 완료) 이제 세 도메인이 **같은 워커**(-prod)다. 아래 서술은 그 전 상태다 —
 *     그 주소는 `webrtc-unified-platform`(기본), `mangoi.ai` 는 `-prod` 에 붙어 있다.
 *     화면·API 는 같은 코드라 차이가 없지만 **화상수업 방(DO)만 갈린다**(CLAUDE.md 0장·2장).
 *     다만 «사람에게 보여 줄 주소» 는 아래 SITE_ORIGIN 하나로 통일한다.
 *   · `www.mangoi.ai` 는 2026-08-17 에 **추가로 붙인** 주소다(기존 `mangoi.ai` 도 그대로 산다).
 *     둘은 같은 Worker 이므로 «우리 사이트인가» 판정에는 포함하되,
 *     새로 만드는 링크는 SITE_ORIGIN(www 없는 쪽) 하나로 통일한다.
 */

/** 문자·알림톡·안내문에 넣는 주소. 도메인이 바뀌면 **여기만** 고친다. */
export const SITE_ORIGIN = 'https://mangoi.ai';

/**
 * 같은 Worker 를 가리키는 **별칭 주소**. 사람이 주소창에 직접 칠 수 있으므로 인정은 하되,
 * 새 링크를 만들 때는 쓰지 않는다 — 그건 SITE_ORIGIN 의 몫이다.
 */
export const ALIAS_ORIGINS = ['https://www.mangoi.ai'] as const;

/**
 * 우리 사이트의 예전 주소. 아직 살아 있으므로 «우리 사이트인가» 판정에는 포함한다.
 * 새 링크를 만들 때는 쓰지 않는다 — 그건 SITE_ORIGIN 의 몫이다.
 * ✅ (2026-08-27) 이 주소도 이제 `-prod` 가 응답한다 — 이전 완료. 위 [주의] 참고.
 *    여기는 «우리 사이트인가» 만 보므로 무관하지만, 방(DO)을 다루는 코드에서는 갈린다.
 */
export const LEGACY_ORIGINS = ['https://test.mangoi.co.kr'] as const;

/** 우리 사이트로 인정하는 호스트명 목록 (외부 URL 화이트리스트 검증용). */
export const SITE_HOSTS: string[] = [SITE_ORIGIN, ...ALIAS_ORIGINS, ...LEGACY_ORIGINS].map((o) => o.replace(/^https:\/\//, ''));

/**
 * 절대 URL 을 만든다. `siteUrl('/eval.html?id=' + id)` 처럼 쓴다.
 * 슬래시가 있든 없든 같은 결과가 나오게 한다 — 호출부마다 다르게 쓰다 `//` 가 생기던 사고 방지.
 */
export function siteUrl(path: string = '/'): string {
  const p = String(path || '/');
  return SITE_ORIGIN + (p.charAt(0) === '/' ? p : '/' + p);
}

/**
 * 환경변수로 덮어쓸 수 있는 기준 주소 (스테이징에서 링크를 다른 곳으로 보내야 할 때).
 * `PUBLIC_BASE_URL` 이 없으면 정본 주소를 쓴다. 끝의 슬래시는 항상 떼어 돌려준다.
 */
export function siteBase(env?: any): string {
  return String((env && env.PUBLIC_BASE_URL) || SITE_ORIGIN).replace(/\/+$/, '');
}
