#!/usr/bin/env node
/**
 * 💱 결재 자동화 16단계 (2026-09-25) — 회계장부 원·페소 바꿔 보기 + 오늘 환율 표시
 *
 * 사장님 「페소와 원화가 서로 환전되게 보이게 · 당일 환전 환율도 명시(1,000원이 몇 페소인지) · 원과 페소 누르면 바뀌게」
 *
 * 무엇을 지키나
 *   ① 정본(approval-policy) — fxSane(10~60원 밖 버림) · parseFxResponse(모양이 다르면 null) · fxConvert(환율 없으면 null)
 *   ② getTodayFx(fx-rate.ts) — 오늘 캐시 → 공개 API → 지난 값 → 급여 화면 저장값 → null.
 *      ⛔ 기본값(24원)을 지어내지 않는다 · ⛔ 던지지 않는다 · 어디서 왔는지(source)와 날짜를 준다.
 *   ③ 서버 배선 — 장부 JSON 에만 fx(엑셀은 원래 통화) · 실패해도 장부는 뜬다.
 *   ④ 화면 — 환산은 물결 없이(굵게) · 같은 통화는 그대로 · 환율이 없으면 바꿔 보기를 끄고 말한다 ·
 *      ₩1,000 = ₱… 을 적는다 · 합계 «모두 합쳐» 는 통화가 둘 이상이고 전부 바꿀 수 있을 때만 · 화면 계산 == 정본 계산.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const POLICY = process.env.POLICY_SRC || join(SRC, 'approval-policy.ts');
const P = await import(pathToFileURL(POLICY).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');
const FXSRC = readFileSync(process.env.FX_SRC || join(SRC, 'fx-rate.ts'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {
  const s = src.indexOf('{', i); if (s < 0 || i < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
// JS 함수는 반환 타입이 없으니 «선언 뒤 첫 {» 부터 짝을 센다.
const fnSrc = (src, name) => { const i = src.indexOf('function ' + name + '('); return i < 0 ? '' : src.slice(i, src.indexOf('{', i)) + bodyAt(src, i); };
const winFn = (src, name) => { const i = src.indexOf('window.' + name + ' = function'); return i < 0 ? '' : 'var __w_' + name + ' = ' + src.slice(src.indexOf('function', i), src.indexOf('{', i)) + bodyAt(src, i) + ';'; };

console.log('\n① 정본 — fxSane · parseFxResponse · fxConvert');
try {
  ok('범위 안(24.35)은 그대로', P.fxSane(24.35) === 24.35 && P.fxSane('24.3512345') === 24.3512);
  ok('범위 밖·빈 값·숫자 아님은 null(경계 10·60 포함)', P.fxSane(9.99) === null && P.fxSane(60.01) === null && P.fxSane(10) === 10 && P.fxSane(60) === 60 &&
     P.fxSane(null) === null && P.fxSane('') === null && P.fxSane('x') === null && P.fxSane(0) === null);
  const good = { result: 'success', base_code: 'PHP', time_last_update_unix: Date.parse('2026-09-24T15:30:00Z') / 1000, rates: { KRW: 24.35, USD: 0.017 } };
  const p = P.parseFxResponse(good);
  ok('정상 응답 → 환율 + KST 날짜', p && p.krw_per_php === 24.35 && p.date === '2026-09-25', JSON.stringify(p));
  ok('실패·기준통화 다름·KRW 없음·이상한 값·시각 없음은 null',
     P.parseFxResponse({ ...good, result: 'error' }) === null && P.parseFxResponse({ ...good, base_code: 'USD' }) === null &&
     P.parseFxResponse({ ...good, rates: { USD: 1 } }) === null && P.parseFxResponse({ ...good, rates: { KRW: 1400 } }) === null &&
     P.parseFxResponse({ ...good, time_last_update_unix: 0 }) === null && P.parseFxResponse(null) === null);
  ok('페소 → 원(정수 원)', P.fxConvert(1000, 'PHP', 'KRW', 24.35) === 24350);
  ok('원 → 페소(센타보 2자리)', P.fxConvert(1000, 'KRW', 'PHP', 24.35) === 41.07);
  ok('같은 통화는 환율 없이도 그대로', P.fxConvert(500, 'PHP', 'PHP', null) === 500 && P.fxConvert(500, 'krw', 'KRW', null) === 500);
  ok('환율이 없거나 이상하면 null(지어내지 않는다)', P.fxConvert(1000, 'PHP', 'KRW', null) === null && P.fxConvert(1000, 'PHP', 'KRW', 1400) === null && P.fxConvert(1000, 'KRW', 'PHP', 0) === null);
  ok('금액이 없으면 null', P.fxConvert(null, 'PHP', 'KRW', 24) === null && P.fxConvert('x', 'PHP', 'KRW', 24) === null);
} catch (e) { ok('정본 실행', false, e.stack); }

console.log('\n② getTodayFx — 캐시 → API → 지난 값 → 급여 저장값 → null');
let getTodayFx = null;
try {
  const js = stripTypeScriptTypes(FXSRC).replace(/from '\.\/approval-policy'/, "from '" + pathToFileURL(POLICY).href + "'");
  const dir = mkdtempSync(join(tmpdir(), 'fx16-'));
  writeFileSync(join(dir, 'fx.mjs'), js);
  ({ getTodayFx } = await import(pathToFileURL(join(dir, 'fx.mjs')).href));
} catch (e) { ok('fx-rate.ts 불러오기', false, e.stack); }
ok('전제: getTodayFx 를 불러왔다', typeof getTodayFx === 'function');
const NOW = Date.parse('2026-09-25T02:00:00Z');   // KST 11:00
const API_OK = { result: 'success', base_code: 'PHP', time_last_update_unix: Date.parse('2026-09-24T15:30:00Z') / 1000, rates: { KRW: 24.35 } };
function mkEnv({ kv = {}, kvThrow = false, row = null, dbThrow = false } = {}) {
  const store = new Map(Object.entries(kv));
  const puts = [];
  return {
    store, puts,
    SESSION_STATE: {
      async get(k, t) { if (kvThrow) throw new Error('kv down'); const v = store.get(k); return v == null ? null : (t === 'json' ? JSON.parse(v) : v); },
      async put(k, v, o) { if (kvThrow) throw new Error('kv down'); puts.push([k, o]); store.set(k, v); },
    },
    DB: { prepare(sql) { return { async first() { if (dbThrow) throw new Error('no table'); return /payroll_settings/.test(sql) ? row : null; } }; } },
  };
}
let calls = 0;
function setFetch(mode) {
  calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (mode === 'throw') throw new Error('network');
    if (mode === 'http500') return { ok: false, status: 500, json: async () => ({}) };
    if (mode === 'weird') return { ok: true, status: 200, json: async () => ({ ...API_OK, rates: { KRW: 1400 } }) };
    return { ok: true, status: 200, json: async () => API_OK };
  };
}
const quiet = console.warn; console.warn = () => {};
try {
  if (getTodayFx) {
    setFetch('ok'); let e = mkEnv(); let r = await getTodayFx(e, NOW);
    ok('API 성공 → live · 그 값의 날짜', r && r.source === 'live' && r.krw_per_php === 24.35 && r.date === '2026-09-25', JSON.stringify(r));
    ok('오늘 키와 «지난 값» 키에 저장(오늘 키는 만료 있음)', e.store.has('fx:php-krw:2026-09-25') && e.store.has('fx:php-krw:last') &&
       e.puts.find(p => p[0] === 'fx:php-krw:2026-09-25')[1]?.expirationTtl > 0);
    setFetch('ok'); r = await getTodayFx(e, NOW);
    ok('오늘 캐시가 있으면 API 를 안 부른다', calls === 0 && r.source === 'live' && r.krw_per_php === 24.35);
    setFetch('throw'); e = mkEnv({ kv: { 'fx:php-krw:last': JSON.stringify({ krw_per_php: 23.9, date: '2026-09-20' }) } }); r = await getTodayFx(e, NOW);
    ok('API 가 죽으면 지난 값(last) — 그 날짜 그대로', r && r.source === 'last' && r.krw_per_php === 23.9 && r.date === '2026-09-20', JSON.stringify(r));
    setFetch('http500'); e = mkEnv({ row: { php_krw: 24.1, updated_at: Date.parse('2026-09-01T01:00:00Z') } }); r = await getTodayFx(e, NOW);
    ok('지난 값도 없으면 급여 화면 저장값(payroll)', r && r.source === 'payroll' && r.krw_per_php === 24.1 && r.date === '2026-09-01', JSON.stringify(r));
    setFetch('weird'); e = mkEnv(); r = await getTodayFx(e, NOW);
    ok('API 가 이상한 값(1400)을 주면 쓰지 않고 저장도 안 한다', r === null && !e.store.has('fx:php-krw:last'), JSON.stringify(r));
    setFetch('throw'); r = await getTodayFx(mkEnv({ row: null }), NOW);
    ok('⛔ 아무것도 없으면 null — 기본값(24원)을 지어내지 않는다', r === null, JSON.stringify(r));
    setFetch('throw'); r = await getTodayFx(mkEnv({ row: { php_krw: 1400, updated_at: 1 } }), NOW);
    ok('급여 저장값이 이상해도 쓰지 않는다', r === null);
    setFetch('ok'); r = await getTodayFx(mkEnv({ kvThrow: true, dbThrow: true }), NOW);
    ok('KV 가 죽어도 던지지 않고 API 값', r && r.source === 'live');
    setFetch('throw'); let threw = false;
    try { r = await getTodayFx(mkEnv({ kvThrow: true, dbThrow: true }), NOW); } catch { threw = true; }
    ok('⛔ 전부 죽어도 던지지 않는다(null)', !threw && r === null);
    setFetch('throw'); r = await getTodayFx(mkEnv({ kv: { 'fx:php-krw:2026-09-25': JSON.stringify({ krw_per_php: 1400, date: '2026-09-25' }) } }), NOW);
    ok('캐시에 이상한 값이 들어 있어도 쓰지 않는다', r === null);
  }
} catch (e) { ok('getTodayFx 실행', false, e.stack); }
console.warn = quiet;
ok('기본값 상수를 쓰지 않는다(getPhpKrwRate 안 부름)', !/getPhpKrwRate|DEFAULT_PHP_KRW/.test(strip(FXSRC)));
ok('API 호출에 시간 제한', /AbortController/.test(FXSRC) && /setTimeout\(\(\) => ac\.abort\(\), \d+\)/.test(FXSRC));

console.log('\n③ 서버 배선');
try {
  const code = strip(API);
  const li = code.indexOf('const L = ledgerFrom(items);');
  const blk = bodyAt(code, code.lastIndexOf('if (ledger) {', li));
  ok('전제: 장부 갈래를 찾았다', li > 0 && blk.length > 500);
  const fi = blk.indexOf('fx: await getTodayFx(env)');
  ok('장부 JSON 에 fx', fi > 0);
  ok('엑셀은 fx 조회 «전» 에 돌아간다(엑셀은 원래 통화)', blk.indexOf('if (csv) return ledgerCsvResponse(') > 0 && blk.indexOf('if (csv) return ledgerCsvResponse(') < fi);
  ok('fx 가 실패해도 장부는 뜬다(catch → null)', /fx: await getTodayFx\(env\)\.catch\(\(\) => null\)/.test(blk));
  ok('import', /import \{ getTodayFx \} from '\.\/fx-rate';/.test(API));
} catch (e) { ok('서버 배선', false, e.stack); }

console.log('\n④ 화면');
try {
  const names = ['ledConv', 'ledRate', 'lm', 'ledFxHtml', 'ledAllIn'];
  const srcs = names.map(n => fnSrc(WORK, n));
  const showSrc = winFn(WORK, 'ledShow');
  ok('전제: 그리는 함수 5개 + ledShow 를 찾았다', srcs.every(x => x.length > 20) && showSrc.length > 20);
  const S = {
    LED: { per: 'month', show: '', data: { month: null } }, EN: false, painted: 0, LS: {},
    T: (en, ko) => S.EN ? en : ko,
    esc: s => String(s == null ? '' : s),
    money: (v, cur) => (v == null || v === '') ? '' : ((String(cur).toUpperCase() === 'KRW' ? '₩' : '₱') + Math.round(Number(v) || 0).toLocaleString('en-US')),
    paintLed: () => { S.painted++; },
    fxRepaintAll: () => { S.fxRepainted = (S.fxRepainted || 0) + 1; },   // 💱 목록·맨 위 금액·지출 정리를 다시 그리는 정본(2026-09-25) — 여기선 불렸는지만 센다
    localStorage: { setItem: (k, v) => { S.LS[k] = v; } },
    window: {},
  };
  const run = new Function('S', 'with (S) { ' + srcs.join('\n') + '\n' + showSrc + '\n return { ledConv, lm, ledFxHtml, ledAllIn, ledShow: __w_ledShow }; }');
  const F = run(S);
  // 화면 계산 == 정본 계산
  let same = true;
  for (const r of [10, 23.9, 24.35, 25.123, 60, null, 0, 9.9, 61, 'x']) for (const a of [0, 1, 999, 1000, 12345.67, -50]) for (const [f, t] of [['PHP', 'KRW'], ['KRW', 'PHP'], ['PHP', 'PHP'], ['KRW', 'KRW']]) {
    if (F.ledConv(a, f, t, r) !== P.fxConvert(a, f, t, r)) { same = false; }
  }
  ok('화면 환산(ledConv) == 정본 fxConvert (환율·금액·방향 전수)', same);
  const FX = { krw_per_php: 24.35, date: '2026-09-25', source: 'live' };
  const D = { fx: FX, totals: [{ cur: 'KRW', sum: 30000, n: 1 }, { cur: 'PHP', sum: 3500, n: 4 }] };
  S.LED.data.month = D;
  S.LED.show = '';
  ok('원래 통화 보기: 그대로(≈ 없음)', F.lm(3500, 'PHP') === '₱3,500' && F.lm(30000, 'KRW') === '₩30,000');
  S.LED.show = 'KRW';
  ok('₩ 로 보기: 페소는 ₩ 환산(물결 없음)', F.lm(3500, 'PHP') === '₩85,225', F.lm(3500, 'PHP'));
  ok('₩ 로 보기: 원은 그대로(≈ 없음)', F.lm(30000, 'KRW') === '₩30,000');
  S.LED.show = 'PHP';
  ok('₱ 로 보기: 원은 ₱ 환산(물결 없음)', F.lm(30000, 'KRW') === '₱1,232', F.lm(30000, 'KRW'));
  ok('모두 합쳐(₱) = 3,500 + 1,232.03', Math.abs(F.ledAllIn(D.totals) - (3500 + 1232.03)) < 0.001, String(F.ledAllIn(D.totals)));
  S.LED.show = '';
  ok('원래 통화 보기에서는 «모두 합쳐» 없음', F.ledAllIn(D.totals) === null);
  S.LED.show = 'KRW';
  ok('통화가 하나뿐이면 «모두 합쳐» 없음', F.ledAllIn([{ cur: 'PHP', sum: 100, n: 1 }]) === null);
  S.LED.data.month = { totals: D.totals, fx: null };
  ok('환율이 없으면 환산하지 않는다(원래 금액)', F.lm(3500, 'PHP') === '₱3,500');
  ok('환율이 없으면 «모두 합쳐» 도 없음(지어내지 않는다)', F.ledAllIn(D.totals) === null);
  const noFx = F.ledFxHtml({ fx: null });
  ok('환율이 없으면 바꿔 보기를 끄고 그 사실을 말한다', /환율을 불러오지 못해/.test(noFx) && !/ledShow/.test(noFx));
  ok('이상한 환율(1400)도 «못 불러옴» 으로', /환율을 불러오지 못해/.test(F.ledFxHtml({ fx: { krw_per_php: 1400, date: 'x', source: 'live' } })));
  S.LED.data.month = D; S.LED.show = '';
  let h = F.ledFxHtml(D);
  ok('₩1,000 = ₱41.07 를 적는다', h.includes('₩1,000 = ₱41.07'), h);
  ok('₱1 = ₩24.35 도 적는다', h.includes('₱1 = ₩24.35'));
  ok('환율 날짜를 적는다', h.includes('2026-09-25'));
  ok('버튼 셋: 원래 통화 · ₩ 원으로 · ₱ 페소로', /ledShow\(''\)/.test(h) && /ledShow\('KRW'\)/.test(h) && /ledShow\('PHP'\)/.test(h) && /원래 통화/.test(h) && /₩ 원으로/.test(h) && /₱ 페소로/.test(h));
  ok('누른 버튼이 켜짐 표시(aria-pressed)', /class="ledvtab on" aria-pressed="true" onclick="ledShow\(''\)"/.test(h));
  ok('원래 통화 보기에서는 «환산 안내» 없음', !/굵은 금액은 이 환율로/.test(h));
  S.LED.show = 'KRW'; h = F.ledFxHtml(D);
  ok('바꿔 보기 중에는 «굵은 금액 = 환산 · 엑셀·판정은 원래 통화» 안내', /굵은 금액은 이 환율로 바꾼 금액/.test(h) && /엑셀·경고·합계 판정은 원래 통화/.test(h));
  ok('지난 값·급여 저장값이면 출처를 그대로 말한다',
     /오늘 것을 못 받음/.test(F.ledFxHtml({ fx: { ...FX, source: 'last' } })) && /급여 화면에 저장된 환율/.test(F.ledFxHtml({ fx: { ...FX, source: 'payroll' } })));
  S.EN = true;
  ok('영어 화면도 같은 내용', /₩1,000 = ₱41\.07/.test(F.ledFxHtml(D)) && /Could not get/.test(F.ledFxHtml({ fx: null })));
  S.EN = false;
  S.painted = 0; F.ledShow('PHP');
  ok('누르면 바뀌고 다시 그린다 · 이 기기에 기억', S.LED.show === 'PHP' && S.painted === 1 && S.LS.mangoi_led_show === 'PHP');
  F.ledShow('USD');
  ok('모르는 값은 «원래 통화»', S.LED.show === '');
  S.localStorage = { setItem: () => { throw new Error('blocked'); } };
  let thr = false; try { F.ledShow('KRW'); } catch { thr = true; }
  ok('저장이 막혀도 던지지 않고 바뀐다', !thr && S.LED.show === 'KRW');

  // 배선
  const a = WORK.indexOf('function paintLed(){'), b = WORK.indexOf('function ledConv(');   // 환산 도우미 «앞» 까지
  const region = WORK.slice(a, b);
  ok('장부 그리기의 금액은 lm 을 지난다(raw money 는 «모두 합쳐» 한 곳뿐)', (region.match(/\blm\(/g) || []).length >= 19 && (strip(region).match(/[^.\w]money\(/g) || []).length === 1);
  ok('paintLed 가 환율 줄을 그린다', /h \+= ledFxHtml\(d\);/.test(fnSrc(WORK, 'paintLed')));
  ok('합계 줄에 «모두 합쳐»', /var all = ledAllIn\(d\.totals\);/.test(fnSrc(WORK, 'paintLed')));
  ok('처음 값은 이 기기 기억에서(막히면 원래 통화)', /LED\.show = \(function\(\)\{ try \{ var v = localStorage\.getItem\('mangoi_led_show'\)/.test(WORK));
  ok('엑셀 주소는 보기와 무관(원래 통화)', !/show/.test(winFn(WORK, 'ledCsv')));
  ok('어두운 화면 색', /html\.dark \.ledfx\{/.test(WORK));
} catch (e) { ok('화면 실행', false, e.stack); }

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
