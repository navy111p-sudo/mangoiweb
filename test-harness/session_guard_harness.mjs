// ═══════════════════════════════════════════════════════════════════════
// 🔒 session-guard.js 회귀 하니스 — 「다른 기기에서 로그인되었습니다」 안내
//   브라우저 없이 window/localStorage/fetch/document 를 흉내 내서 **실제 파일을 실행**한다.
//   확인하려는 것은 두 가지뿐:
//     ① 원래 fetch 응답을 절대 가로채지 않는다(가로채면 서비스가 죽는다)
//     ② 'kicked' 일 때만 안내창이 뜨고 토큰이 지워진다
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'cloudflare-deploy', 'public', 'js', 'session-guard.js');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }

console.log('═'.repeat(66));
console.log('  🔒 session-guard.js — 밀려난 기기 안내');
console.log('═'.repeat(66));

/** 최소한의 브라우저 흉내. 실제 파일을 그대로 실행한다. */
function makeEnv({ token = 'TOK', statusState = 'kicked', statusFails = false } = {}) {
  const store = new Map();
  if (token) store.set('mango_token', token);
  store.set('mangoi_logged_user', JSON.stringify({ uid: 'stu1' }));

  const ls = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const calls = [];           // 감싼 fetch 가 실제로 통과시킨 요청
  const statusCalls = [];     // /api/student/session-status 조회 횟수
  const appended = [];        // body 에 붙은 엘리먼트

  function el(tag) {
    const e = {
      tagName: tag, children: [], style: { cssText: '' }, textContent: '', type: '', id: '',
      setAttribute() {}, appendChild(c) { e.children.push(c); }, onclick: null,
    };
    return e;
  }

  const body = el('body');
  body.appendChild = c => { body.children.push(c); appended.push(c); };

  const win = {
    location: { origin: 'https://test.mangoi.co.kr', href: '/', reload() {} },
    localStorage: ls,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      body,
      documentElement: el('html'),
      createElement: el,
      addEventListener() {},
    },
    async fetch(input) {
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      if (u.indexOf('/api/student/session-status') >= 0) {
        statusCalls.push(u);
        if (statusFails) throw new Error('network');
        return { ok: true, status: 200, async json() { return { ok: true, state: statusState, uid: 'stu1' }; } };
      }
      calls.push(u);
      return { ok: false, status: 401, __marker: 'ORIGINAL' };
    },
  };
  win.window = win;
  return { win, ls, store, calls, statusCalls, appended };
}

const SOURCE = fs.readFileSync(SRC, 'utf8');
function run(env) {
  // 파일은 window/document/localStorage/location 을 전역처럼 쓴다 → 인자로 주입
  new Function('window', 'document', 'localStorage', 'sessionStorage', 'location', SOURCE)(
    env.win, env.win.document, env.win.localStorage, env.win.sessionStorage, env.win.location
  );
}
const settle = () => new Promise(r => setTimeout(r, 10));

// ── 1) 응답을 가로채지 않는다 ──
{
  const env = makeEnv({ statusState: 'kicked' });
  run(env);
  const res = await env.win.fetch('/api/student/full?uid=stu1');
  ok(res.__marker === 'ORIGINAL' && res.status === 401,
     '① 401 응답을 **원본 그대로** 돌려준다 (가로채면 기존 화면이 전부 깨진다)');
  ok(env.calls.length === 1, '① 원래 요청은 한 번만 나간다 (중복 호출 없음)');
  await settle();
}

// ── 2) kicked 일 때만 안내 ──
{
  const env = makeEnv({ statusState: 'kicked' });
  run(env);
  await env.win.fetch('/api/student/full');
  await settle();
  ok(env.statusCalls.length === 1, '② 401 이면 사유를 한 번 조회한다');
  ok(env.appended.length === 1, '② kicked → 안내창이 뜬다');
  ok(env.store.get('mango_token') === undefined, '② kicked → 토큰을 지운다 (새로고침해도 다시 안 튕기게)');
  ok(env.store.get('mangoi_logged_user') === undefined, '② 로그인 흔적도 함께 지운다');
}

for (const st of ['expired', 'invalid', 'legacy', 'off', 'active']) {
  const env = makeEnv({ statusState: st });
  run(env);
  await env.win.fetch('/api/student/full');
  await settle();
  ok(env.appended.length === 0 && env.store.get('mango_token') === 'TOK',
     `② '${st}' 에서는 안내창을 띄우지 않고 토큰도 건드리지 않는다`);
}

// ── 3) 불필요한 조회를 하지 않는다 ──
{
  const env = makeEnv({ token: '' });   // 로그인 안 한 사람
  run(env);
  await env.win.fetch('/api/student/full');
  await settle();
  ok(env.statusCalls.length === 0, '③ 토큰이 없으면(비로그인) 조회 자체를 안 한다');
}
{
  const env = makeEnv();
  run(env);
  const r = await env.win.fetch('https://other.example.com/api/x');
  await settle();
  ok(env.statusCalls.length === 0 && r.status === 401, '③ 남의 도메인 401 은 무시한다');
}
{
  const env = makeEnv();
  run(env);
  env.win.fetch = env.win.fetch;   // 감싼 것 그대로
  await Promise.all([env.win.fetch('/api/a'), env.win.fetch('/api/b'), env.win.fetch('/api/c')]);
  await settle();
  ok(env.statusCalls.length === 1, '③ 401 이 우르르 와도 조회는 한 번 (중복 안내창 방지)');
  ok(env.appended.length === 1, '③ 안내창도 한 개만');
}

// ── 4) 실패해도 페이지를 막지 않는다 ──
{
  const env = makeEnv({ statusFails: true });
  run(env);
  const r = await env.win.fetch('/api/student/full');
  await settle();
  ok(r.status === 401 && env.appended.length === 0,
     '④ 사유 조회가 실패해도 조용히 넘어간다 (기존 401 처리 그대로)');
}
{
  const env = makeEnv();
  run(env);
  const before = env.win.fetch;
  run(env);                                    // 두 번 로드
  ok(env.win.fetch === before, '④ 두 번 로드해도 fetch 를 겹쳐 감싸지 않는다');
}

// ── 5) 배선 — 「등록했는데 404」를 막는다 ──
//    실제로 당했다. index.ts 라우팅에는 넣었는데 **api-mango.ts 에 두 번째 관문이 또 있어서**
//    /api/session/status 가 handleStudentsApi 까지 닿지 못하고 404 가 났다.
//    CLAUDE.md 는 «라우팅 + 인증 게이트» 두 곳만 말하는데, 실제로는 **접두사 관문이 하나 더** 있다.
{
  const SRCD = path.join(HERE, '..', 'cloudflare-deploy', 'src');
  const rd = f => { try { return fs.readFileSync(path.join(SRCD, f), 'utf8'); } catch { return ''; } };
  const guard = fs.readFileSync(SRC, 'utf8');

  const m = guard.match(/rawFetch\('([^']+)'/);
  const API = m ? m[1] : '';
  ok(!!API, '⑤ session-guard.js 가 부르는 경로를 읽었다: ' + API);

  const idx = rd('index.ts'), mango = rd('api-mango.ts'), stu = rd('api-students.ts');
  ok(idx.includes(`path === '${API}'`), '⑤ index.ts 라우팅에 등록돼 있다');
  ok(stu.includes(`path === '${API}'`), '⑤ api-students.ts 에 핸들러가 있다');

  // api-mango.ts 가 handleStudentsApi 를 부르는 접두사 목록을 소스에서 뽑아 실제로 대조한다
  const blk = mango.slice(0, mango.indexOf('handleStudentsApi(request'));
  const cond = blk.slice(blk.lastIndexOf('if (path.startsWith('));
  const prefixes = [...cond.matchAll(/path\.startsWith\('([^']+)'\)/g)].map(x => x[1]);
  ok(prefixes.length >= 3, '⑤ api-mango.ts 의 접두사 관문을 읽었다: ' + prefixes.join(' '));
  ok(prefixes.some(p => API.startsWith(p)),
     '⑤ 🚧 그 접두사 중 하나로 시작한다 — 아니면 라우팅에 넣어도 404 다');

  // 클라이언트가 자기 자신을 재귀 호출하지 않도록 예외 처리한 경로도 같이 따라와야 한다
  ok(guard.includes(`u.indexOf('${API}') >= 0`), '⑤ 재귀 방지 예외 경로도 같은 주소다 (이름만 바꾸면 무한루프)');
}

console.log('─'.repeat(66));
console.log(`  PASS ${pass}    ⚠ FAIL ${fail}`);
console.log('═'.repeat(66));
process.exit(fail ? 1 : 0);
