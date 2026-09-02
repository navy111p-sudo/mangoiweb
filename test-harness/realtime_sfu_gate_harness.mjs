// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   📡 Realtime SFU 자격증명 경계 회귀 감시 (2026-09-02 신설 — C안 1단계)

   [무엇을 지키는가]
   SFU 는 «유료 서비스를 우리 시크릿으로 대신 불러 주는» 자리다. 여기가 새면
     · 앱 시크릿이 브라우저로 새고(누구나 우리 계정으로 방송)
     · 남의 수업 세션에 트랙을 붙일 수 있고
     · 임의 경로 전달(SSRF)이 열린다.
   그래서 네 가지를 못 박는다 — ① 시크릿 없으면 «완전히 꺼짐» ② 신원 필수
   ③ 아는 op 만 ④ 내가 만든 세션만.

   [왜 문자열이 아니라 실행인가]
   「그 조건이 있는가」로는 «시크릿이 응답에 섞이는가»·«fetch 를 정말 안 하는가» 를
   알 수 없다. CLAUDE.md 2장이 반복해서 적어 둔 그 함정이다.
   → 모듈을 컴파일해 **가짜 fetch·가짜 KV 로 실제로 돌리고**, 나간 요청을 들여다본다.

   실행: node test-harness/realtime_sfu_gate_harness.mjs
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

let PASS = 0, FAIL = 0;
const check = (n, ok, why) => {
  if (ok) { PASS++; console.log('  ✅ ' + n); }
  else { FAIL++; console.log('  ❌ ' + n + (why ? '  — ' + why : '')); }
};

console.log('\n📡 Realtime SFU 자격증명 경계 — 시크릿·신원·세션 소유권\n');

const modSrc = read('cloudflare-deploy/src/realtime-sfu.ts');
const apiMango = read('cloudflare-deploy/src/api-mango.ts');
const indexTs = read('cloudflare-deploy/src/index.ts');

/* ── ① 배선 — 새 API 가 «이미 열린» 접두사 밑에 있는가 ─────────────────────
   src/index.ts 는 공동 금지구역이다. /api/class/ 는 라우팅 허용목록에 이미 있으므로
   그 밑에 두면 금지구역을 한 줄도 안 고쳐도 된다(CLAUDE.md 「새 API 관문 셋」). */
console.log('① 배선 — 금지구역을 안 고치고도 라우팅이 되는가');
check('/api/class/ 접두사가 라우팅 허용목록에 이미 있다',
  /path\.startsWith\('\/api\/class\/'\)/.test(indexTs));
check('새 엔드포인트가 그 접두사 밑이다 (/api/class/sfu/)',
  /path\.startsWith\('\/api\/class\/sfu\/'\)/.test(apiMango));
check('index.ts 에 sfu 전용 라우팅을 새로 만들지 않았다 (금지구역 무수정)',
  !/api\/class\/sfu/.test(indexTs));

/* ── ② 모듈을 컴파일해 실제로 돌린다 ──────────────────────────────────── */
console.log('\n② 판정 모듈을 컴파일해 «진짜로» 돌려 본다');
let mod = null, why = '';
try {
  const ts = (await import(pathToFileURL(resolve(ROOT, 'cloudflare-deploy/node_modules/typescript/lib/typescript.js')).href)).default;
  const js = ts.transpileModule(modSrc, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  mod = await import('data:text/javascript;base64,' + Buffer.from(js, 'utf8').toString('base64'));
} catch (e) { why = e.message; }

if (!mod) {
  console.log('  ⏭ typescript 를 못 찾아 실행 검사를 건너뜁니다 (' + String(why).slice(0, 80) + ')');
  console.log('     ⚠️ 이건 «통과» 가 아닙니다 — npm ci 뒤 다시 돌리세요.');
} else {
  const SECRET = 'SUPER-SECRET-APP-TOKEN-do-not-leak';
  const APPID = 'app-1234';

  /* 가짜 SFU — 무엇을 어디로 보냈는지 기록한다 */
  const mkFetch = (resp) => {
    const calls = [];
    const f = async (url, init) => {
      calls.push({ url, init });
      return { status: resp.status ?? 200, text: async () => JSON.stringify(resp.body ?? {}) };
    };
    f.calls = calls;
    return f;
  };
  /* 가짜 KV */
  const mkKv = (seed = {}) => {
    const m = new Map(Object.entries(seed));
    return {
      _m: m,
      async get(k) { return m.has(k) ? m.get(k) : null; },
      async put(k, v) { m.set(k, v); },
    };
  };
  const ADMIN = { uid: 'hq_mgr', kind: 'admin' };

  /* ②-1 시크릿이 없으면 «완전히» 꺼진다 — fetch 를 한 번도 안 한다 */
  console.log('  · 시크릿이 없을 때');
  {
    const f = mkFetch({});
    const r = await mod.sfuProxy({ appId: '', appToken: '', kv: mkKv(), fetchImpl: f, identity: ADMIN },
      'session-new', 'class-1-20260902', null, {});
    check('꺼짐으로 응답한다 (enabled:false)', r.status === 200 && r.body.enabled === false, JSON.stringify(r.body));
    check('바깥으로 요청을 한 번도 보내지 않는다 (실측 ' + f.calls.length + '회)', f.calls.length === 0);
  }
  {
    const f = mkFetch({});
    const r = await mod.sfuProxy({ appId: APPID, appToken: '', kv: mkKv(), fetchImpl: f, identity: ADMIN },
      'session-new', 'class-1-20260902', null, {});
    check('한쪽만 있어도 꺼짐이다 (둘 다 있어야 켜진다)', r.body.enabled === false && f.calls.length === 0);
  }

  /* ②-2 신원 없으면 401, 그리고 fetch 안 함 */
  console.log('  · 신원·op·방 검사');
  {
    const f = mkFetch({});
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: mkKv(), fetchImpl: f, identity: null },
      'session-new', 'class-1-20260902', null, {});
    check('신원이 없으면 401 이고 요청을 안 보낸다', r.status === 401 && f.calls.length === 0);
  }
  {
    const f = mkFetch({});
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: mkKv(), fetchImpl: f, identity: ADMIN },
      'sessions/../../evil', 'class-1-20260902', null, {});
    check('모르는 op 은 400 이고 요청을 안 보낸다 (임의 경로 전달 차단)', r.status === 400 && f.calls.length === 0);
  }
  {
    const f = mkFetch({});
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: mkKv(), fetchImpl: f, identity: ADMIN },
      'session-new', '', null, {});
    check('방 번호가 없으면 400 이고 요청을 안 보낸다', r.status === 400 && f.calls.length === 0);
  }

  /* ②-3 세션 소유권 */
  console.log('  · 세션 소유권 (남의 수업 세션에 못 붙는다)');
  {
    const f = mkFetch({ body: { ok: true } });
    const kv = mkKv({ 'sfu:sess:sess-aaaaaaaa': JSON.stringify({ uid: 'someone_else', room: 'class-1-20260902' }) });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv, fetchImpl: f, identity: ADMIN },
      'tracks-new', 'class-1-20260902', 'sess-aaaaaaaa', {});
    check('남이 만든 세션이면 403 이고 요청을 안 보낸다', r.status === 403 && f.calls.length === 0, JSON.stringify(r.body));
  }
  {
    const f = mkFetch({ body: { ok: true } });
    const kv = mkKv({ 'sfu:sess:sess-aaaaaaaa': JSON.stringify({ uid: 'hq_mgr', room: 'class-OTHER-20260902' }) });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv, fetchImpl: f, identity: ADMIN },
      'tracks-new', 'class-1-20260902', 'sess-aaaaaaaa', {});
    check('내 세션이어도 «다른 방» 이면 403 이다', r.status === 403 && f.calls.length === 0);
  }
  {
    const f = mkFetch({ body: { ok: true } });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: mkKv(), fetchImpl: f, identity: ADMIN },
      'tracks-new', 'class-1-20260902', '../../apps/other', {});
    check('세션 id 에 경로 글자가 섞이면 400 이다 (URL 을 벗어날 수 없다)',
      r.status === 400 && f.calls.length === 0);
  }
  {
    const f = mkFetch({ body: { ok: true } });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: null, fetchImpl: f, identity: ADMIN },
      'tracks-new', 'class-1-20260902', 'sess-aaaaaaaa', {});
    check('소유권을 확인할 수 없으면 «막는 쪽» 으로 실패한다 (KV 없음 → 503)',
      r.status === 503 && f.calls.length === 0);
  }

  /* ②-4 정상 경로 — «제대로 된다» 검사가 있어야 위 검사들이 헛돌지 않는다 */
  console.log('  · 정상 경로 (이게 없으면 위 검사가 헛돌아도 초록불이다)');
  let kvShared = mkKv();
  {
    const f = mkFetch({ body: { sessionId: 'sess-newone123', sessionDescription: { type: 'answer', sdp: 'v=0' } } });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: kvShared, fetchImpl: f, identity: ADMIN },
      'session-new', 'class-1-20260902', null, { sessionDescription: { type: 'offer', sdp: 'v=0' } });
    check('세션 생성이 성공한다', r.status === 200 && r.body.ok === true && r.body.enabled === true, JSON.stringify(r.body));
    check('SFU 응답을 그대로 돌려준다 (본문 모양을 우리가 정하지 않는다)',
      r.body.sfu && r.body.sfu.sessionId === 'sess-newone123');
    check('요청이 정확히 한 번 나갔다', f.calls.length === 1);
    const c = f.calls[0] || {};
    check('URL 이 확인된 베이스·앱ID 로 만들어진다',
      c.url === 'https://rtc.live.cloudflare.com/v1/apps/app-1234/sessions/new', c.url);
    check('Authorization 헤더에 Bearer 로 시크릿을 싣는다',
      (c.init?.headers?.Authorization || '') === 'Bearer ' + SECRET);
    check('브라우저가 준 본문을 그대로 전달한다',
      JSON.parse(c.init.body).sessionDescription.type === 'offer');
    /* 🔴 여기가 이 하니스의 핵심 — 시크릿이 «응답» 에 섞이지 않는가 */
    check('응답 어디에도 앱 시크릿이 없다',
      !JSON.stringify(r.body).includes(SECRET) && !JSON.stringify(r.body).includes('Bearer'));
    check('세션 소유권을 KV 에 적어 둔다 (다음 요청이 이걸 본다)',
      !!kvShared._m.get('sfu:sess:sess-newone123'));
  }
  {
    const f = mkFetch({ body: { requiresImmediateRenegotiation: false } });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: kvShared, fetchImpl: f, identity: ADMIN },
      'tracks-new', 'class-1-20260902', 'sess-newone123', { tracks: [] });
    check('방금 만든 «내» 세션에는 트랙을 붙일 수 있다', r.status === 200 && r.body.ok === true, JSON.stringify(r.body));
    check('트랙 URL 에 세션 id 가 들어간다',
      (f.calls[0]?.url || '') === 'https://rtc.live.cloudflare.com/v1/apps/app-1234/sessions/sess-newone123/tracks/new');
  }

  /* ②-5 SFU 가 실패했을 때 — 계정 정보가 섞일 수 있는 본문을 그대로 흘리지 않는다 */
  console.log('  · SFU 가 실패했을 때');
  {
    const f = mkFetch({ status: 401, body: { errorDescription: 'bad token ' + SECRET } });
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: kvShared, fetchImpl: f, identity: ADMIN },
      'session-new', 'class-1-20260902', null, {});
    check('상태 코드까지만 알려 준다 (SFU 본문을 그대로 흘리지 않는다)',
      r.status === 502 && r.body.error === 'sfu_http_401');
    check('그 응답에도 시크릿이 없다', !JSON.stringify(r.body).includes(SECRET));
  }
  {
    const f = async () => { throw new Error('connect ECONNREFUSED token=' + SECRET); };
    f.calls = [];
    const r = await mod.sfuProxy({ appId: APPID, appToken: SECRET, kv: kvShared, fetchImpl: f, identity: ADMIN },
      'session-new', 'class-1-20260902', null, {});
    check('네트워크 예외 메시지를 그대로 내보내지 않는다',
      r.status === 502 && r.body.error === 'sfu_unreachable' && !JSON.stringify(r.body).includes(SECRET));
  }
}

/* ── ③ «켜져 있지 않다» 를 못 박는다 ────────────────────────────────────
   이 단계는 «자격증명 경계» 만이다. 브라우저 쪽 SFU 코드는 아직 없고, 있으면
   검증 못 한 WebRTC 가 수업 경로에 올라간 것이다(이 저장소 최악 사고 유형). */
console.log('\n③ 아직 «켜지» 않았다 — 브라우저 쪽 코드가 없는지 확인');
{
  const pub = read('cloudflare-deploy/public/index.html');
  check('index.html 이 SFU 를 부르지 않는다 (수업 경로 무변경)',
    !/api\/class\/sfu\//.test(pub));
  check('서버 모듈이 시크릿 «두 개» 를 모두 요구한다 (한쪽만으로 켜지지 않는다)',
    /appId && String\(d\.appId\)\.trim\(\) && d\.appToken/.test(modSrc));
  check('허용 op 이 넷뿐이다 (임의 경로 전달 없음)',
    Object.keys((modSrc.match(/SFU_OPS[\s\S]*?\n\};/) || [''])[0].match(/'[a-z-]+':\s*\{/g) || {}).length === 4 ||
    (modSrc.match(/'(session-new|tracks-new|tracks-close|renegotiate)':/g) || []).length === 4);
}

console.log(`\n${FAIL ? '💥' : '🎉'} PASS ${PASS} / FAIL ${FAIL}\n`);
process.exit(FAIL ? 1 : 0);
