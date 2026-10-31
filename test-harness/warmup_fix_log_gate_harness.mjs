/**
 * 📝 웜업 «고쳐 준 표현» 기록 — 본인 확인 게이트 (2026-10-02, 파일럿 후속 P4)
 *
 * src/index.ts handleWarmupChat 의 `if (showFix && ctxUserId) { … }` 블록과
 * public/warmup.html 의 warmupFetch 토큰 첨부를 **소스에서 오려 내 실제로 돌린다.**
 *   ① 토큰 uid == user_id 면 기록 / 다르면 안 함 / 토큰 없으면 안 함 (짝)
 *   ② 관리자 세션은 «같은 이름» 일 때만 (jeong 처럼 관리자 폴백으로 들어온 본인)
 *   ③ 확인 중 예외가 나도 던지지 않는다
 *   ④ 화면: 같은 오리진 + 웜업 대화 주소일 때만 Authorization 을 싣는다 (짝: API_BASE 가 있으면 안 실음)
 *
 * 변이 (전부 실제 FAIL 확인 — 2026-10-02):
 *   Ⓐ tokUid === ctxUserId → !==                        → ①-1·①-2
 *   Ⓑ ses.username === ctxUserId 조건 삭제(관리자면 누구든) → ②-2
 *   Ⓒ if (mine) 제거(늘 기록)                             → ①-2·①-3
 *   Ⓓ 화면 `!API_BASE &&` 제거                            → ④-2
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDX = readFileSync(process.env.WFL_IDX || join(ROOT, 'cloudflare-deploy/src/index.ts'), 'utf8');
const HTML = readFileSync(process.env.WFL_HTML || join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n); } };
function blockAt(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const b = src.indexOf('{', i); let d = 0;
  for (let k = b; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const blk = blockAt(IDX, 'if (showFix && ctxUserId)');
ok('전제: 서버 블록을 오려 냈다', blk.length > 50);
const js = blk.replace(/\s+as\s+any\b/g, '').replace(/:\s*any\b/g, '').replace(/\(e\s*\)/g, '(e)');
async function run({ tok, ses, throwAuth = false }) {
  const logged = [];
  let fn;
  try { fn = new Function('showFix', 'ctxUserId', 'authUidFromRequest', 'checkAdminSession', 'logWarmupFix', 'request', 'env', 'body', 'sessionId', 'ctxLang', 'URL', 'console',
    `return (async () => { ${js} })();`); } catch (e) { return { threw: true, logged, compile: e.message }; }
  try {
    await fn({ was: 'I go yesterday', now: 'I went yesterday' }, 'kim01',
      async () => { if (throwAuth) throw new Error('boom'); return tok; },
      async () => ses || { ok: false },
      async (_e, o) => { logged.push(o.userId); return true; },
      { url: 'https://mangoi.ai/api/warmup/chat' }, {}, {}, 's1', 'en', URL, { warn() {} });
  } catch (e) { return { threw: true, logged }; }
  return { threw: false, logged };
}
console.log('\n── ①② 서버 본인 확인 ──');
ok('①-1 토큰 uid 가 같으면 기록', (await run({ tok: 'kim01' })).logged.length === 1);
ok('①-2 짝: 토큰 uid 가 다르면 기록 안 함', (await run({ tok: 'lee02' })).logged.length === 0);
ok('①-3 짝: 토큰이 없으면 기록 안 함', (await run({ tok: null })).logged.length === 0);
ok('②-1 관리자 세션이 같은 이름이면 기록', (await run({ tok: null, ses: { ok: true, username: 'kim01' } })).logged.length === 1);
ok('②-2 짝: 다른 이름의 관리자 세션은 기록 안 함', (await run({ tok: null, ses: { ok: true, username: 'admin' } })).logged.length === 0);
const t = await run({ throwAuth: true });
ok('③ 확인 중 예외가 나도 던지지 않는다', !t.threw && t.logged.length === 0);

console.log('\n── ④ 화면 토큰 첨부 ──');
const f = blockAt(HTML, 'function warmupFetch(url, options)');
ok('전제: warmupFetch 를 오려 냈다', f.length > 50);
function hdrs(apiBase, url) {
  let seen = null;
  const g = new Function('API_BASE', '_warmPaused', '_warmControllers', 'AbortController', 'setTimeout', 'clearTimeout', 'fetch', 'localStorage',
    f + '\nreturn warmupFetch;')(apiBase, false, [], class { constructor() { this.signal = {}; } abort() {} }, () => 0, () => {},
    (u, o) => { seen = o.headers || {}; return Promise.resolve({}); }, { getItem: k => k === 'mango_token' ? 'TOK' : null });
  g(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  return seen;
}
const h1 = hdrs('', '/api/warmup/chat');
ok('④-1 같은 오리진 웜업 대화에는 Authorization 을 싣는다', h1 && h1.Authorization === 'Bearer TOK' && h1['Content-Type'] === 'application/json');
ok('④-2 짝: 다른 서버(API_BASE)로는 안 싣는다', !hdrs('https://other.example', 'https://other.example/api/warmup/chat').Authorization);
ok('④-3 짝: 웜업 대화가 아닌 주소에는 안 싣는다', !hdrs('', '/api/warmup/context').Authorization);

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
