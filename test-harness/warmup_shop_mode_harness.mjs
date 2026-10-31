// 🎚️ 학원별 A.i 말하기 교정 방식(2026-10-31) — 정본을 «실제로» 돌린다.
//   ① src/warmup-shop-mode.ts  : 진짜 SQLite 로 저장·읽기·지우기·표 없음
//   ② src/warmup-honest.ts      : 판정 순서 — 학생 선택 → 원장님 설정 → 시범 표 → 없음 (+ KV 캐시)
//   ③ src/warmup-shop-mode-api.ts : esbuild 로 묶어 범위(scope)만 가짜로 — 대리점은 자기 학원만, 지사는 보기만
//   ④ public/manager.html       : 카드 그리기 함수를 오려 내 실제로 돌림 + 배선
//   (③은 esbuild 가 없으면 건너뛰고 그 사실을 찍는다 — 나머지는 그대로 돈다)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CD = path.join(ROOT, 'cloudflare-deploy');
const SRC = path.join(CD, 'src');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
};

/* ── 가짜 D1 (진짜 SQLite) — prepare/bind/first/all/run ── */
function mkD1(db) {
  const st = (sql, args) => ({
    bind: (...a) => st(sql, a),
    first: async () => db.prepare(sql).get(...(args || [])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
    run: async () => { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => st(sql, []) };
}
function mkKV() { const m = new Map(); return { m, get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }
function mkDb() {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE students_erp (user_id TEXT PRIMARY KEY, shop_name TEXT, franchise TEXT)');
  const ins = db.prepare('INSERT INTO students_erp VALUES (?,?,?)');
  ins.run('kid_a', '해피학원', '서울지사');
  ins.run('kid_b', '강남캐피타운학원', '서울지사');
  ins.run('kid_c', '부산학원', '부산지사');
  ins.run('Kim', '해피학원', '서울지사');
  return db;
}

/* ── 정본 불러오기 (타입만 벗긴다) ── */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wushopmode-'));
const SHOP_SRC = process.env.SHOP_SRC || path.join(SRC, 'warmup-shop-mode.ts');
const HONEST_SRC = process.env.HONEST_SRC || path.join(SRC, 'warmup-honest.ts');
for (const [from, to] of [[path.join(SRC, 'warmup-empathy.ts'), 'warmup-empathy.mjs'], [SHOP_SRC, 'warmup-shop-mode.mjs'], [HONEST_SRC, 'warmup-honest.mjs']]) {
  let js = stripTypeScriptTypes(fs.readFileSync(from, 'utf8'));
  js = js.replace(/from '\.\/warmup-empathy'/g, "from './warmup-empathy.mjs'").replace(/from '\.\/warmup-shop-mode'/g, "from './warmup-shop-mode.mjs'");
  fs.writeFileSync(path.join(tmp, to), js);
}
const S = await import(pathToFileURL(path.join(tmp, 'warmup-shop-mode.mjs')).href);
const H = await import(pathToFileURL(path.join(tmp, 'warmup-honest.mjs')).href);

console.log('① 저장 정본(warmup-shop-mode.ts) — 진짜 SQLite');
ok('모드 목록이 warmup-honest 의 WARMUP_MODES 와 같다', JSON.stringify([...S.SHOP_MODES]) === JSON.stringify([...H.WARMUP_MODES]));
ok('표 만드는 SQL 은 한 줄(D1 exec 함정)', !/\n/.test(S.SHOP_MODE_TABLE_SQL));
{
  const db = mkDb(); const env = { DB: mkD1(db) };
  ok('표가 없을 때 읽기는 null(던지지 않음)', (await S.getShopMode(env, '해피학원')) === null);
  ok('정하기 성공', (await S.setShopMode(env, '해피학원', 'focused', 'happy_owner')) === true);
  ok('읽으면 focused', (await S.getShopMode(env, '해피학원')) === 'focused');
  ok('다른 학원은 null(짝)', (await S.getShopMode(env, '부산학원')) === null);
  ok('바꾸기 — free_talk', (await S.setShopMode(env, '해피학원', 'free_talk', 'x')) === true && (await S.getShopMode(env, '해피학원')) === 'free_talk');
  ok('모르는 모드는 저장 거절', (await S.setShopMode(env, '해피학원', 'strict', 'x')) === false && (await S.getShopMode(env, '해피학원')) === 'free_talk');
  const list = await S.listShopModes(env);
  ok('목록에 한 줄 + 누가 바꿨나', Array.isArray(list) && list.length === 1 && list[0].updated_by === 'x', list);
  ok('지우기(null) → 다시 null', (await S.setShopMode(env, '해피학원', null, 'x')) === true && (await S.getShopMode(env, '해피학원')) === null);
  ok('이름 앞뒤 공백은 같은 학원', (await S.setShopMode(env, ' 부산학원 ', 'balanced', 'x')) && (await S.getShopMode(env, '부산학원')) === 'balanced');
  ok('DB 가 없으면 null', (await S.getShopMode({}, '해피학원')) === null);
  ok('DB 가 던지면 null(던지지 않음)', (await S.getShopMode({ DB: { prepare() { throw new Error('boom'); } } }, '해피학원')) === null);
}

console.log('② 판정 순서(resolveWarmupHonest) — 학생 선택 → 원장님 설정 → 시범 표 → 없음');
{
  const db = mkDb(); const kv = mkKV();
  const env = { DB: mkD1(db), SESSION_STATE: kv };
  await S.setShopMode(env, '해피학원', 'focused', 'owner');
  const r = (sid, uid, o) => H.resolveWarmupHonest(env, sid, uid, o || {});
  ok('원장님이 정한 학원 학생 → focused', JSON.stringify(await r('s1', 'kid_a')) === '{"mode":"focused"}');
  ok('학생이 직접 고르면 그것이 이긴다', JSON.stringify(await r('s2', 'kid_a', { chosen: 'free_talk' })) === '{"mode":"free_talk"}');
  ok('정하지 않은 학원 → null(예전 동작)', (await r('s3', 'kid_c')) === null);
  ok('시범 학원(설정 없음) → 시범 표 focused', JSON.stringify(await r('s4', 'kid_b')) === '{"mode":"focused"}');
  await S.setShopMode(env, '강남캐피타운학원', 'balanced', 'owner');
  ok('시범 학원도 원장님 설정이 이긴다 → balanced', JSON.stringify(await r('s5', 'kid_b')) === '{"mode":"balanced"}');
  ok('대소문자만 다른 아이디(KIM)도 학원을 찾는다', JSON.stringify(await r('s6', 'KIM')) === '{"mode":"focused"}');
  ok('중국어 대화에는 안 쓴다', (await r('s7', 'kid_a', { lang: 'zh' })) === null);
  ok('엘리더잼에는 안 쓴다', (await r('s8', 'kid_a', { eleader: true })) === null);
  ok('아이디 없으면 null', (await r('s9', '')) === null);
  // 캐시 — 같은 세션은 5분 동안 같은 답, 다른 세션은 새로 읽는다
  await S.setShopMode(env, '해피학원', 'free_talk', 'owner');
  ok('같은 세션은 캐시(아직 focused)', JSON.stringify(await r('s1', 'kid_a')) === '{"mode":"focused"}');
  ok('새 세션은 바뀐 값(free_talk)', JSON.stringify(await r('s10', 'kid_a')) === '{"mode":"free_talk"}');
  const cached = kv.m.get('warmuphonest2:s3:kid_c');
  ok('«설정 없음» 도 캐시한다(매 턴 D1 안 읽음)', cached && JSON.parse(cached).m === '', cached);
  ok('캐시 TTL 은 이 파일 안에서 300초', /expirationTtl: 300/.test(fs.readFileSync(HONEST_SRC, 'utf8')));
  // 설정 표를 못 읽으면 → 시범 표로 (fail-open)
  const broken = { DB: { prepare(sql) { if (/warmup_shop_mode/.test(sql)) throw new Error('no such table'); return mkD1(db).prepare(sql); } }, SESSION_STATE: mkKV() };
  ok('설정 표가 고장나도 시범 학원은 시범 표대로', JSON.stringify(await H.resolveWarmupHonest(broken, 'b1', 'kid_b', {})) === '{"mode":"focused"}');
  ok('설정 표가 고장나면 일반 학원은 null', (await H.resolveWarmupHonest(broken, 'b2', 'kid_a', {})) === null);
}

console.log('③ API(warmup-shop-mode-api.ts) — 대리점은 자기 학원만, 지사는 보기만, 본사는 전부');
let esbuild = null;
try { esbuild = createRequire(path.join(CD, 'package.json'))('esbuild'); } catch {}
if (!esbuild) {
  console.log('  ⏭ esbuild 가 없어 ③을 건너뜁니다(이 컨테이너 사정 — CI 에서는 돕니다)');
} else {
  const out = await esbuild.build({
    entryPoints: [path.join(SRC, 'warmup-shop-mode-api.ts')], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    plugins: [{ name: 'scope-fixture', setup(b) {
      b.onResolve({ filter: /^\.\/(scope|auth-admin)$/ }, (a) => ({ path: a.path, namespace: 'fx' }));
      b.onLoad({ filter: /.*/, namespace: 'fx' }, (a) => ({ loader: 'js', contents: a.path === './scope'
        ? `export async function getScope(env, req, o){ const s = globalThis.__SC; if (s === 'throw') throw new Error('x'); return (o && o.noDrillDown) ? (s.raw || s.view) : s.view; }
           export function scopeStudentCond(sc, a){ return sc.type === 'branch' ? { cond: 'franchise LIKE ?', binds: [sc.value + '%'] } : { cond: '', binds: [] }; }`
        : `export async function checkAdminSession(){ return { ok: true, username: globalThis.__WHO || '' }; }` }));
    } }],
  });
  const apiFile = path.join(tmp, 'api.mjs');
  fs.writeFileSync(apiFile, out.outputFiles[0].text);
  const A = await import(pathToFileURL(apiFile).href);
  const db = mkDb(); const env = { DB: mkD1(db) };
  const call = async (sc, method, body, qs) => {
    globalThis.__SC = sc;
    const req = new Request('https://x/api/admin/ai-billing/correction-mode' + (qs || ''), method === 'POST'
      ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method });
    const res = await A.correctionModeRouter(req, env);
    return { st: res.status, j: await res.json() };
  };
  const AG = { view: { type: 'agency', value: '해피학원', label: '' } };
  const HQ = { view: { type: 'hq', value: null, label: '' } };
  const BR = { view: { type: 'branch', value: '서울지사', label: '' } };
  const BR_DRILL = { view: { type: 'agency', value: '해피학원', label: '' }, raw: { type: 'branch', value: '서울지사', label: '' } };

  let x = await call(AG, 'GET');
  ok('대리점 GET → 자기 학원 한 줄 · 바꿀 수 있음', x.st === 200 && x.j.rows.length === 1 && x.j.rows[0].shop_name === '해피학원' && x.j.rows[0].editable === true, x);
  x = await call(AG, 'POST', { mode: 'focused' });
  ok('대리점 POST(학원 이름 생략) → 자기 학원에 저장', x.st === 200 && x.j.mode === 'focused' && x.j.shop_name === '해피학원', x);
  x = await call(AG, 'POST', { shop_name: '부산학원', mode: 'free_talk' });
  ok('대리점이 «남의 학원» 은 못 바꾼다(403)', x.st === 403, x);
  ok('…그리고 실제로 안 바뀌었다(짝)', (await S.getShopMode(env, '부산학원')) === null);
  x = await call(AG, 'POST', { mode: 'strict' });
  ok('모르는 모드 → 400', x.st === 400, x);
  x = await call(BR, 'GET');
  ok('지사 GET → 산하 학원만 · 보기만', x.st === 200 && x.j.rows.every((r) => r.editable === false) && x.j.rows.some((r) => r.shop_name === '해피학원') && !x.j.rows.some((r) => r.shop_name === '부산학원'), x);
  x = await call(BR, 'POST', { shop_name: '해피학원', mode: 'free_talk' });
  ok('지사 POST → 403', x.st === 403, x);
  x = await call(BR_DRILL, 'POST', { shop_name: '해피학원', mode: 'free_talk' });
  ok('지사가 ?as=agency 로 승격해도 못 바꾼다(403)', x.st === 403 && (await S.getShopMode(env, '해피학원')) === 'focused', x);
  x = await call(BR_DRILL, 'GET');
  ok('승격한 지사의 GET 은 보이지만 editable=false', x.st === 200 && x.j.rows[0].editable === false, x);
  x = await call(HQ, 'POST', { shop_name: '부산학원', mode: 'balanced' });
  ok('본사는 아무 학원이나 바꾼다', x.st === 200 && x.j.mode === 'balanced', x);
  x = await call(HQ, 'POST', { shop_name: '없는학원', mode: 'balanced' });
  ok('본사라도 없는 학원은 404(오타 방지)', x.st === 404, x);
  x = await call(HQ, 'GET', null, '?q=' + encodeURIComponent('캐피'));
  ok('본사 GET — 정해 둔 학원 + 시범 학원 + 찾기 결과', x.st === 200 && x.j.rows.some((r) => r.shop_name === '강남캐피타운학원' && r.pilot_mode === 'focused') && x.j.rows.some((r) => r.shop_name === '부산학원') && x.j.found.length === 1, x);
  x = await call(HQ, 'POST', { shop_name: '부산학원', mode: '' });
  ok('빈 모드 → 지우기(기본으로)', x.st === 200 && x.j.mode === null && (await S.getShopMode(env, '부산학원')) === null, x);
  x = await call({ view: { type: 'none', value: null, label: '' } }, 'GET');
  ok('범위 없음 GET → 403', x.st === 403, x);
  x = await call('throw', 'POST', { shop_name: '해피학원', mode: 'free_talk' });
  ok('범위를 못 읽으면 쓰기 막힘', x.st === 403 && (await S.getShopMode(env, '해피학원')) === 'focused', x);
  // 순수 판정
  ok('canWriteShopMode — 본사 true', A.canWriteShopMode({ type: 'hq', value: null }, 'a') === true);
  ok('canWriteShopMode — 자기 대리점 true / 남의 대리점 false (짝)', A.canWriteShopMode({ type: 'agency', value: 'a' }, 'a') === true && A.canWriteShopMode({ type: 'agency', value: 'a' }, 'b') === false);
  ok('canWriteShopMode — 지사·지사본사·none·null false', ['branch', 'franchise', 'none'].every((t) => A.canWriteShopMode({ type: t, value: 'a' }, 'a') === false) && A.canWriteShopMode(null, 'a') === false);
}

console.log('④ 화면(manager.html) — 카드·배선·그리기');
const html = fs.readFileSync(path.join(CD, 'public', 'manager.html'), 'utf8');
const bill = fs.readFileSync(path.join(SRC, 'ai-billing.ts'), 'utf8');
ok('ai-billing 라우터가 correction-mode 를 위임', /p === 'correction-mode'\) return correctionModeRouter\(request, env\)/.test(bill));
ok('위임이 ensureSchema 보다 앞(청구 표 만들기와 무관)', bill.indexOf("p === 'correction-mode'") > 0 && bill.indexOf("p === 'correction-mode'") < bill.indexOf('await ensureSchema(env);\n  const scope'));
ok('카드 c-cmode 가 있고 펼치면 loadCmode', /id="c-cmode" ontoggle="if\(this\.open\)loadCmode\(\)"/.test(html));
ok('사이드바 버튼', /sideGo\('c-cmode'\)/.test(html));
ok('그릇(#cmodeBody)에 data-en/data-ko 를 달지 않았다', /<div id="cmodeBody"[^>]*>/.test(html) && !/<div id="cmodeBody"[^>]*data-(en|ko)/.test(html));
ok('🌐 뒤 다시 그린다(repaintAll)', /function repaintAll\(\)\{[\s\S]*?if \(D\.cmode\) paintCmode\(\);[\s\S]*?\n  \}/.test(html));
{
  const a = html.indexOf('  var CMODES = ['), b = html.indexOf("  document.addEventListener('click', function(e){", a);
  ok('그리기 블록을 오려 냈다(전제)', a > 0 && b > a);
  const box = { className: '', innerHTML: '', textContent: '' };
  const ctx = { D: {}, T: (en, ko) => ko, esc: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
    failBox: () => {}, fetch: () => Promise.reject(new Error('no')), encodeURIComponent, window: {}, document: { getElementById: (id) => (id === 'cmodeBody' ? box : null) } };
  try {
    vm.createContext(ctx);
    vm.runInContext(html.slice(a, b) + '\n;this.__paint = paintCmode;', ctx, { timeout: 2000 });
    ctx.D.cmode = { ok: true, scope: 'agency', rows: [{ shop_name: '해피<학원>', mode: 'focused', pilot_mode: null, editable: true }] };
    ctx.__paint();
    const h1 = box.innerHTML;
    ok('바꿀 수 있으면 버튼 3개 + 기본으로', (h1.match(/data-cm-mode="(free_talk|balanced|focused)"/g) || []).length === 3 && /data-cm-mode=""/.test(h1), h1.slice(0, 300));
    ok('지금 방식(집중교정 · 학원 설정)을 글자로', /지금: <b>집중교정<\/b> · 학원 설정/.test(h1));
    ok('학원 이름을 이스케이프', /해피&lt;학원&gt;/.test(h1) && !/해피<학원>/.test(h1));
    ok('고른 버튼은 aria-pressed=true', /data-cm-mode="focused" aria-pressed="true"/.test(h1));
    ctx.D.cmode = { ok: true, scope: 'branch', rows: [{ shop_name: '해피학원', mode: null, pilot_mode: null, editable: false }] };
    ctx.__paint();
    const h2 = box.innerHTML;
    ok('보기만이면 버튼 없음 + 「보기만」 안내(짝)', !/data-cm-mode/.test(h2) && /보기만/.test(h2));
    ok('설정 없으면 «정하지 않음 — 평소대로(균형)»', /정하지 않음 — 평소대로\(균형\)/.test(h2));
    ctx.D.cmode = { ok: true, scope: 'hq', rows: [], found: [] };
    ctx.__paint();
    ok('본사에는 학원 찾기 칸', /id="cmodeQ"/.test(box.innerHTML) && /id="cmodeQBtn"/.test(box.innerHTML));
  } catch (e) { ok('그리기 블록 실행', false, String(e && e.message)); }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
