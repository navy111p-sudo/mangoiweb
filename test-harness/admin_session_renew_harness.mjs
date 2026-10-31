/* ══════════════════════════════════════════════════════════════════════
   ⏰ 강사·관리자 로그인이 «수업 시각에» 풀리지 않게  (2026-10-28)

   [무슨 일이 있었나] 중국어 강선생님(`hq_t_kang`) 세션이 2026-10-22 19:22:07 에 만료 —
     그날 19:20 수업 2분 뒤였다. 만료가 «로그인한 시각 + 30일» 이라, 수업 직전에 로그인하는
     강사는 30일 뒤 정확히 그 수업 시각에 풀린다. 다음 날(10/23)에는 수업 직전 다시 로그인해야 했다.

   [이 하니스가 지키는 것] — 정본(src/auth-admin.ts)의 함수를 «오려 내 실제로 돌린다»(node 타입 제거)
     A. 만료 시각은 «그 다음 새벽 4시(KST)» (수업 0건 시간대)
     B. 쓰는 동안 늘린다 — 남은 기간이 절반 아래일 때만, 처음 기간(7일/30일) 그대로
        짝: 절반 이상이면 안 늘린다 · 이미 만료면 되살리지 않는다
     C. 늘릴 때 «쿠키도» 새 만료로 내려준다 · 실패해도 null(로그인 판정은 그대로)
     D. 배선 — /api/admin/me 가 그 쿠키를 싣고, 로그인 판정 SELECT 에는 새 칸을 안 넣는다
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '../cloudflare-deploy/src/auth-admin.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

/* 주석·문자열을 추적하며 중괄호 짝으로 블록을 자른다. */
function blockFrom(src, openIdx) {
  let depth = 0, inStr = null, inLine = false, inBlock = false;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (inLine) { if (c === '\n') inLine = false; continue; }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++; } continue; }
    if (inStr) { if (c === '\\') { i++; continue; } if (c === inStr) inStr = null; continue; }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}
/** `head` 로 시작하는 함수 선언을 본문 끝까지 오려 낸다(시그니처 안의 { } 타입은 건너뛴다). */
function fnText(head) {
  const i = SRC.indexOf(head);
  if (i < 0) return '';
  // 매개변수 목록의 짝 괄호 뒤 첫 «{» 가 본문이다(반환 타입 안의 { } 는 건너뛴다)
  let p = SRC.indexOf('(', i), depth = 0, j = p;
  for (; j < SRC.length; j++) { if (SRC[j] === '(') depth++; else if (SRC[j] === ')') { depth--; if (!depth) break; } }
  let k = j + 1, ang = 0;
  for (; k < SRC.length; k++) {
    const ch = SRC[k];
    if (ch === '<') ang++; else if (ch === '>') ang--;
    else if (ch === '{' && ang <= 0) {
      // 반환 타입 객체 리터럴인지(`: { … }`) — 콜론 뒤 첫 { 이면 타입이라 건너뛴다
      const before = SRC.slice(j + 1, k).trim();
      if (before.endsWith(':')) { k += blockFrom(SRC, k).length - 1; continue; }
      break;
    }
  }
  return SRC.slice(i, k) + blockFrom(SRC, k);
}
const constLine = (name) => (SRC.match(new RegExp(`^const ${name} = [^\\n]*$`, 'm')) || [''])[0];

console.log('\n⏰ 강사·관리자 로그인 연장\n');
const parts = [
  constLine('SESSION_COOKIE'), constLine('SESSION_DEFAULT_MS'), constLine('SESSION_REMEMBER_MS'), constLine('SESSION_NIGHT_HOUR_KST'),
  fnText('function setSessionCookieHeader('),
  fnText('export function nightAlignedExpiry('),
  fnText('export function sessionRenewalPlan('),
  fnText('export async function renewAdminSessionCookie('),
];
check('전제: 상수 4개·함수 4개를 소스에서 오려 냈다', parts.every(p => p && p.length > 20));

const tmp = mkdtempSync(join(tmpdir(), 'asr-'));
writeFileSync(join(tmp, 'mod.ts'), parts.join('\n\n') + '\n');
const runner = `
  import { nightAlignedExpiry, sessionRenewalPlan, renewAdminSessionCookie } from './mod.ts';
  console.warn = () => {};
  const H = 3600e3, D = 24 * H;
  const kst = (y, mo, d, h, mi = 0, s = 0) => Date.UTC(y, mo - 1, d, h - 9, mi, s);   // KST 벽시계 → epoch
  const fmt = (t) => new Date(t + 9 * H).toISOString().slice(0, 19).replace('T', ' ');
  const out = {};
  out.A = {
    a1: fmt(nightAlignedExpiry(kst(2026, 10, 22, 19, 22, 7))),    // 사고 시각 → 다음 날 04:00
    a2: fmt(nightAlignedExpiry(kst(2026, 10, 23, 4, 0, 0))),      // 정확히 04:00 → 그대로
    a3: fmt(nightAlignedExpiry(kst(2026, 10, 23, 3, 59, 59))),    // 03:59:59 → 같은 날 04:00
    a4: fmt(nightAlignedExpiry(kst(2026, 10, 23, 4, 0, 1))),      // 04:00:01 → 다음 날 04:00
    a5: fmt(nightAlignedExpiry(kst(2026, 12, 31, 23, 50))),       // 해 넘김
  };
  const NOW = kst(2026, 10, 28, 19, 20);
  const P = (c, e, t) => sessionRenewalPlan(NOW, c, e, t);
  out.B = {
    fresh30: P(NOW - 1 * D, NOW + 29 * D, 30 * D),                // 29일 남음 → 안 늘림
    half30: P(NOW - 16 * D, NOW + 14 * D, 30 * D),                // 14일 남음 → 늘림(30일)
    edge30: P(NOW - 15 * D, NOW + 15 * D, 30 * D),                // 정확히 절반 → 안 늘림
    left7: P(NOW - 5 * D, NOW + 2 * D, 7 * D),                    // 7일짜리 2일 남음 → 늘림(7일)
    expired: P(NOW - 31 * D, NOW - 1000, 30 * D),                 // 이미 만료 → 안 늘림(되살리지 않음)
    legacy30: P(NOW - 20 * D, NOW + 10 * D, null),                // 옛 세션(ttl_ms 없음) 30일 → 30일로
    legacy7: P(NOW - 6 * D, NOW + 1 * D + 20 * H, null),          // 옛 세션 7일(+정렬 20시간) → 7일로
  };
  for (const k of Object.keys(out.B)) out.B[k].exp = fmt(out.B[k].expiresAt);
  // C. 쿠키 — 가짜 D1
  const mkDb = (row, changes = 1, boom = false) => {
    const log = [];
    return { log, prepare(sql) { if (boom) throw new Error('boom'); return { bind: (...a) => ({
      first: async () => { log.push(['first', sql, a]); return row; },
      run: async () => { log.push(['run', sql, a]); return { meta: { changes } }; },
    }) }; } };
  };
  const SESS = { ok: true, username: 'hq_t_kang', token: 'tok123' };
  const near = mkDb({ created_at: NOW - 20 * D, expires_at: NOW + 3 * D, ttl_ms: 30 * D });
  out.C = {
    renew: await renewAdminSessionCookie({ DB: near }, SESS, NOW),
    renewLog: near.log.map(x => [x[0], x[1].replace(/\\s+/g, ' '), x[2]]),
    fresh: await renewAdminSessionCookie({ DB: mkDb({ created_at: NOW - D, expires_at: NOW + 29 * D, ttl_ms: 30 * D }) }, SESS, NOW),
    lost: await renewAdminSessionCookie({ DB: mkDb({ created_at: NOW - 20 * D, expires_at: NOW + 3 * D, ttl_ms: 30 * D }, 0) }, SESS, NOW),
    boom: await renewAdminSessionCookie({ DB: mkDb(null, 1, true) }, SESS, NOW),
    noSess: await renewAdminSessionCookie({ DB: near }, { ok: false }, NOW),
    noRow: await renewAdminSessionCookie({ DB: mkDb(null) }, SESS, NOW),
  };
  out.NOW = NOW;
  process.stdout.write(JSON.stringify(out));
`;
writeFileSync(join(tmp, 'run.mjs'), runner);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
rmSync(tmp, { recursive: true, force: true });
let O = null;
try { O = JSON.parse(r.stdout); } catch { console.log(r.stdout.slice(0, 600)); console.log(r.stderr.slice(0, 1500)); }
check('전제: 오려 낸 정본을 타입 제거로 실제로 돌렸다', !!O);

if (O) {
  console.log('\n[ A. 만료는 «그 다음 새벽 4시(KST)» ]');
  check('A1 10/22 19:22:07(사고 시각) → 10/23 04:00:00', O.A.a1 === '2026-10-23 04:00:00');
  check('A2 정확히 04:00 → 그대로', O.A.a2 === '2026-10-23 04:00:00');
  check('A3 03:59:59 → 같은 날 04:00', O.A.a3 === '2026-10-23 04:00:00');
  check('A4 04:00:01 → 다음 날 04:00', O.A.a4 === '2026-10-24 04:00:00');
  check('A5 12/31 23:50 → 다음 해 1/1 04:00', O.A.a5 === '2027-01-01 04:00:00');

  console.log('\n[ B. 쓰는 동안 늘린다 — 절반 아래일 때만 · 같은 단위로 ]');
  check('B1 30일짜리 29일 남음 → 안 늘린다(요청마다 쓰지 않는다)', O.B.fresh30.renew === false);
  check('B2 30일짜리 14일 남음 → 늘린다, 지금+30일 뒤 새벽 4시(11/28 04:00)', O.B.half30.renew === true && O.B.half30.exp === '2026-11-28 04:00:00');
  check('B3 정확히 절반 남음 → 안 늘린다(경계)', O.B.edge30.renew === false);
  check('B4 7일짜리 2일 남음 → 7일 단위로 늘린다(11/05 04:00)', O.B.left7.renew === true && O.B.left7.ttl === 7 * 86400e3 && O.B.left7.exp === '2026-11-05 04:00:00');
  check('B5 이미 만료 → 되살리지 않는다', O.B.expired.renew === false);
  check('B6 옛 세션(ttl_ms 없음) 30일 → 30일로 가린다', O.B.legacy30.renew === true && O.B.legacy30.ttl === 30 * 86400e3);
  check('B7 옛 세션 7일(+새벽 정렬 20시간) → 7일로 가린다(30일로 부풀지 않는다)', O.B.legacy7.ttl === 7 * 86400e3);

  console.log('\n[ C. 쿠키도 함께 · 실패하면 null ]');
  const ck = String(O.C.renew || '');
  const maxAge = Number((ck.match(/Max-Age=(\d+)/) || [])[1]);
  const expect = Math.ceil((Date.UTC(2026, 10, 27, 19, 0, 0) - O.NOW) / 1000);   // 11/28 04:00 KST
  check('C1 늘렸으면 같은 토큰의 Set-Cookie 를 돌려준다', /^mango_admin_session=tok123;/.test(ck) && /HttpOnly/.test(ck) && /Secure/.test(ck));
  check('C2 쿠키 Max-Age 가 새 만료(11/28 04:00)까지다', maxAge === expect);
  const upd = (O.C.renewLog || []).find(x => x[0] === 'run');
  check('C3 DB 는 «더 늘어나는 경우에만» 고친다(expires_at < 새 만료) · ttl_ms 도 적는다',
    !!upd && /UPDATE admin_sessions SET expires_at = \?, ttl_ms = \? WHERE token = \? AND expires_at < \?/.test(upd[1])
    && upd[2][2] === 'tok123' && upd[2][0] === upd[2][3] && upd[2][1] === 30 * 86400e3);
  check('C4 아직 넉넉하면 null (쿠키를 매번 다시 안 쓴다)', O.C.fresh === null);
  check('C5 DB 가 안 바꿨으면(0행) null', O.C.lost === null);
  check('C6 DB 가 던져도 null — 던지지 않는다', O.C.boom === null);
  check('C7 세션이 없으면 null', O.C.noSess === null);
  check('C8 행이 없으면 null', O.C.noRow === null);
}

console.log('\n[ D. 배선 ]');
{
  const meIdx = SRC.indexOf("if (path === '/api/admin/me' && method === 'GET') {");
  const me = meIdx >= 0 ? blockFrom(SRC, SRC.indexOf('{', meIdx)) : '';
  check('전제: /api/admin/me 블록을 잘라 냈다', me.length > 200);
  check('/api/admin/me 가 renewAdminSessionCookie(env, sess) 를 부른다', /renewAdminSessionCookie\(env, sess\)/.test(me));
  check('그 결과를 Set-Cookie 로 싣는다(없으면 빈 헤더)', /renewCookie \? \{ 'Set-Cookie': renewCookie \} : \{\}/.test(me));
  const chk = fnText('export async function checkAdminSession(');
  check('⛔ 로그인 판정 SELECT 에는 새 칸(ttl_ms)을 넣지 않는다 — ALTER 가 안 돼도 로그인은 그대로', !!chk && !/ttl_ms/.test(chk));
  const issue = fnText('export async function issueAdminSession(');
  check('로그인 때 만료를 새벽 4시로 정렬한다', /const expiresAt = nightAlignedExpiry\(now \+ ttl\)/.test(issue));
  check('⛔ 세션 INSERT 문에는 ttl_ms 가 없다(그 칸이 없어도 로그인은 돼야 한다)',
    /INSERT INTO admin_sessions \(token, username, ip, user_agent, created_at, expires_at, last_seen_at\)/.test(issue));
  check('로그인 쿠키 Max-Age 도 정렬된 만료까지', /setSessionCookieHeader\(token, Math\.ceil\(\(expiresAt - now\) \/ 1000\)\)/.test(issue));
  check('ttl_ms 칸을 만드는 ALTER 가 스키마 보장 목록에 있다', /`ALTER TABLE admin_sessions ADD COLUMN ttl_ms INTEGER`/.test(SRC));
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:', FAILS.join(' | ')); process.exit(1); }
