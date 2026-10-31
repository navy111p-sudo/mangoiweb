/**
 * 🚫 폐지된 옛 주소 — test.mangoi.co.kr (2026-10-16 사장님 지시: 「아예 안 나오게」)
 *
 * [무엇을 하는가]
 *   이 호스트로 들어온 요청에는 홈페이지·API·화상수업 무엇도 주지 않고,
 *   「이 주소는 더 이상 쓰지 않습니다 — mangoi.ai 로 접속하세요」 안내문 한 장만 410 으로 돌려준다.
 *   ⛔ 리다이렉트·클릭 링크는 일부러 두지 않는다(2026-08-28 결정 유지 — 주소는 «글자» 로만 알린다).
 *
 * [예외 — 옛 앱이 스스로 살아나는 길]
 *   예전 APK 는 업데이트 확인 주소(app-version.json)도 이 도메인을 볼 수 있다.
 *   그것까지 막으면 옛 앱은 새 버전을 영영 못 받는다 → app-version.json 과 .apk 다운로드만 통과시킨다.
 *
 * [되돌리기]
 *   RETIRED_HOSTS 에서 호스트를 빼고 배포하면 즉시 원래대로 돌아온다.
 */

export const RETIRED_HOSTS = ['test.mangoi.co.kr'] as const;

/** 막지 않고 통과시킬 경로 — 옛 앱의 자가 업데이트용 */
function isPassThroughPath(path: string): boolean {
  return path === '/app-version.json' || /^\/downloads\/[^/]+\.apk$/i.test(path);
}

export function isRetiredHost(hostname: string): boolean {
  const h = String(hostname || '').toLowerCase();
  return (RETIRED_HOSTS as readonly string[]).includes(h);
}

const NOTICE_HTML = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>주소 변경 안내 · Address changed</title>
<style>
  html,body{margin:0;height:100%;background:#0f172a;color:#fff;
    font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
    padding:24px 16px;box-sizing:border-box;text-align:center}
  h1{font-size:clamp(20px,5vw,30px);margin:0 0 12px}
  p{font-size:clamp(15px,3.6vw,19px);line-height:1.6;margin:0 0 6px;color:#cbd5e1}
  .addr{display:inline-block;margin:18px 0;padding:12px 22px;border:2px solid #fbbf24;border-radius:14px;
    font-size:clamp(22px,6vw,34px);font-weight:700;color:#fbbf24;letter-spacing:.5px;user-select:all}
  .en{margin-top:26px;font-size:14px;color:#94a3b8}
</style>
</head>
<body>
<main>
  <h1>이 주소는 더 이상 사용하지 않습니다</h1>
  <p>망고아이는 이제 아래 주소에서만 이용하실 수 있습니다.</p>
  <div class="addr">mangoi.ai</div>
  <p>주소창에 <b>mangoi.ai</b> 를 직접 입력해 접속해 주세요.</p>
  <p class="en">This address is no longer in use. Please type <b>mangoi.ai</b> in the address bar.</p>
</main>
</body>
</html>`;

/**
 * 폐지된 호스트면 안내 응답을, 아니면 null 을 돌려준다.
 * index.ts handle() 맨 앞에서 부른다(OPTIONS·WebSocket 포함 모든 요청보다 먼저).
 */
export function retiredDomainResponse(url: URL): Response | null {
  if (!isRetiredHost(url.hostname)) return null;
  if (isPassThroughPath(url.pathname)) return null;
  return new Response(NOTICE_HTML, {
    status: 410,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Robots-Tag': 'noindex',
    },
  });
}
