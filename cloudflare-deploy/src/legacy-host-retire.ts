/* 🚪 옛 주소 test.mangoi.co.kr 비활성화 (2026-10-16 사장님 지시 — «안내 페이지로 막기» 선택)
 *
 * [무엇을 하나]
 *   이 주소로 들어온 요청은 화면·API·화상수업(WebSocket) 전부 «주소가 바뀌었습니다» 안내로 막는다.
 *   자동 이동(리다이렉트)은 하지 않는다 — 사람이 직접 mangoi.ai 버튼을 눌러 옮겨 간다.
 *
 * [일부러 열어 둔 것]
 *   /app-version.json · /downloads/* — 옛 앱(APK)은 시작 주소가 이 도메인이라
 *   업데이트 확인도 이 도메인으로 한다(CLAUDE.md 0장). 이것까지 막으면 옛 앱이
 *   스스로 새 버전(mangoi.ai)으로 넘어갈 길이 사라진다.
 *
 * [되돌리기]
 *   RETIRED_HOSTS 를 빈 배열로 두면 예전과 똑같이 동작한다.
 *
 * [대가 — 알고 고른 것]
 *   이 도메인에 등록한 패스키·localStorage 로그인은 mangoi.ai 에서 다시 해야 한다.
 */

export const RETIRED_HOSTS: readonly string[] = ['test.mangoi.co.kr'];
export const NEW_ORIGIN = 'https://mangoi.ai';

/** 막지 않고 그대로 통과시킬 경로(옛 앱 자가 업데이트용). */
export function retiredHostPassThrough(path: string): boolean {
  return path === '/app-version.json' || path.startsWith('/downloads/');
}

const PAGE = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>주소가 바뀌었습니다 · Mangoi moved</title>
<style>
:root{color-scheme:light}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#f8fafc;color:#101828;font-family:system-ui,-apple-system,'Malgun Gothic',sans-serif;padding:16px;box-sizing:border-box}
.box{max-width:440px;width:100%;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px 24px;text-align:center}
h1{font-size:22px;margin:0 0 12px}
p{font-size:16px;line-height:1.6;margin:0 0 8px;color:#344054}
.en{color:#667085;font-size:14px}
a.btn{display:inline-block;margin-top:18px;background:#b45309;color:#fff;text-decoration:none;
font-weight:700;font-size:18px;padding:14px 26px;border-radius:12px}
</style></head><body><div class="box">
<h1>🥭 망고아이 주소가 바뀌었습니다</h1>
<p>이 주소(test.mangoi.co.kr)는 더 이상 쓰지 않습니다.<br>아래 새 주소로 들어와 다시 로그인해 주세요.</p>
<p class="en">This address is no longer in use. Please use the new address below and log in again.</p>
<a class="btn" href="https://mangoi.ai/">mangoi.ai 로 가기 · Go to mangoi.ai</a>
</div></body></html>`;

/** 막아야 할 요청이면 안내 응답을, 아니면 null 을 돌려준다. */
export function retiredHostResponse(url: URL, request: Request): Response | null {
  if (!RETIRED_HOSTS.includes(url.hostname)) return null;
  if (retiredHostPassThrough(url.pathname)) return null;
  const headers = { 'Cache-Control': 'no-store', 'X-Mangoi-Retired-Host': '1' };
  if (url.pathname.startsWith('/api/') || (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket') {
    return new Response(JSON.stringify({
      ok: false, error: 'host_retired', new_origin: NEW_ORIGIN,
      message: '주소가 mangoi.ai 로 바뀌었습니다. / Please use https://mangoi.ai',
    }), { status: 410, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
  }
  return new Response(request.method === 'HEAD' ? null : PAGE,
    { status: 410, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
