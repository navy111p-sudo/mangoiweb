// 💱 급여 «원화로 보기» 하니스 (2026-09-25)
//   정본 src/fx-rate.ts 를 --experimental-strip-types 로 «실제로» 돌려
//   ① 성공·캐시·예비 제공자·마지막 저장값·완전 실패(숫자를 지어내지 않음)를 짝으로 보고
//   ② 화면(adm-q3.js)의 fmtP 를 오려 내 «켜졌을 때만 ₩, 환율이 없으면 ₱ 그대로» 를 실제로 평가한다.
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy/src/fx-rate.ts');
const Q3 = join(ROOT, 'cloudflare-deploy/public/js/adm-q3.js');
const REP = join(ROOT, 'cloudflare-deploy/src/accounting-reports.ts');
const ADMIN = join(ROOT, 'cloudflare-deploy/public/admin.html');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// ── ① 정본을 실제로 돌린다 ─────────────────────────────────────
const tmp = mkdtempSync(join(tmpdir(), 'fxh-'));
copyFileSync(SRC, join(tmp, 'fx-rate.ts'));
writeFileSync(join(tmp, 'run.mjs', ), `
import { getPhpKrwLive, sanePhpKrw } from './fx-rate.ts';
const out = {};
function kvMake(init = {}, throws = false) {
  const m = new Map(Object.entries(init));
  return { m, puts: [],
    async get(k) { if (throws) throw new Error('kv down'); const v = m.get(k); return v == null ? null : JSON.parse(v); },
    async put(k, v) { if (throws) throw new Error('kv down'); this.puts.push(k); m.set(k, v); } };
}
function fetchMake(map) {
  const calls = [];
  const f = async (url) => { calls.push(String(url));
    for (const [pat, body] of map) if (String(url).includes(pat)) {
      if (body === 'THROW') throw new Error('net');
      if (typeof body === 'number') return new Response('x', { status: body });
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error('unmapped'); };
  f.calls = calls; return f;
}
const ER_OK = { result: 'success', time_last_update_unix: 1790000000, rates: { KRW: 23.85 } };
const FR_OK = { date: '2026-09-24', rates: { KRW: 23.7 } };
async function run(name, fetchMap, kv) {
  const f = fetchMake(fetchMap); globalThis.fetch = f;
  let r; try { r = await getPhpKrwLive({ SESSION_STATE: kv }); } catch (e) { r = { threw: String(e) }; }
  out[name] = { r, calls: f.calls.length, puts: kv ? kv.puts : [] };
}
out.sane = [sanePhpKrw(23.8), sanePhpKrw(0.5), sanePhpKrw(1000), sanePhpKrw('x'), sanePhpKrw(null)];
await run('fresh', [['open.er-api', ER_OK]], kvMake());
await run('cached', [['open.er-api', ER_OK]], kvMake({ 'fx:PHP:KRW:v1': JSON.stringify({ rate: 22.2, source: 'c' }) }));
await run('fallback', [['open.er-api', 500], ['frankfurter', FR_OK]], kvMake());
await run('insaneFirst', [['open.er-api', { result:'success', rates:{ KRW: 0.4 } }], ['frankfurter', FR_OK]], kvMake());
await run('stale', [['open.er-api', 'THROW'], ['frankfurter', 'THROW']], kvMake({ 'fx:PHP:KRW:last-good': JSON.stringify({ rate: 24.1, source: 'old' }) }));
await run('none', [['open.er-api', 'THROW'], ['frankfurter', 'THROW']], kvMake());
await run('kvDown', [['open.er-api', ER_OK]], kvMake({}, true));
await run('noKv', [['open.er-api', ER_OK]], undefined);
console.log(JSON.stringify(out));
`);
const p = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse(p.stdout.trim().split('\n').pop()); } catch { /* 아래에서 FAIL */ }
check('① 정본을 실제로 실행했다', !!o, (p.stderr || '').slice(0, 300));
if (o) {
  check('①-1 합리 범위만 받는다(23.8 통과 · 0.5/1000/x/null 거절)',
    o.sane[0] === 23.8 && o.sane.slice(1).every(v => v === null), JSON.stringify(o.sane));
  const f = o.fresh.r;
  check('①-2 새로 받으면 ok·rate·stale:false', f.ok === true && f.rate === 23.85 && f.stale === false, JSON.stringify(f));
  check('①-3 rate_time 은 제공자 시각(ms)', f.rate_time === 1790000000 * 1000);
  check('①-4 성공하면 30분 캐시와 «마지막 값» 둘 다 저장', o.fresh.puts.includes('fx:PHP:KRW:v1') && o.fresh.puts.includes('fx:PHP:KRW:last-good'));
  check('①-5 캐시가 있으면 외부를 안 부른다', o.cached.calls === 0 && o.cached.r.rate === 22.2 && o.cached.r.stale === false);
  check('①-6 첫 제공자가 실패하면 두 번째(ECB)로', o.fallback.r.ok && o.fallback.r.rate === 23.7 && /frankfurter/.test(o.fallback.r.source));
  check('①-7 이상한 숫자는 버리고 다음 제공자로', o.insaneFirst.r.rate === 23.7);
  check('①-8 둘 다 실패 + 마지막 값 있음 → stale:true 로 그 값', o.stale.r.ok && o.stale.r.rate === 24.1 && o.stale.r.stale === true);
  check('①-9 둘 다 실패 + 저장값 없음 → ok:false, 숫자를 지어내지 않음',
    o.none.r.ok === false && o.none.r.rate === undefined, JSON.stringify(o.none.r));
  check('①-10 KV 가 던져도 환율은 준다(짝: 캐시 실패가 응답을 막지 않음)', o.kvDown.r.ok === true && o.kvDown.r.rate === 23.85, JSON.stringify(o.kvDown.r));
  check('①-11 KV 없이도 동작', o.noKv.r.ok === true && o.noKv.r.rate === 23.85);
}
const fxSrc = readFileSync(SRC, 'utf8');
check('①-12 급여 설정 환율(payroll_settings)로 폴백하지 않는다', !/payroll_settings|php_krw|DEFAULT_PHP_KRW/.test(fxSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));

// ── ② 라우트 ───────────────────────────────────────────────
const rep = readFileSync(REP, 'utf8');
const ri = rep.indexOf("if (p === 'fx-rate')");
check('② reportsRouter 에 fx-rate 가 있다(index.ts 무수정)', ri > 0);
const rblk = rep.slice(ri, rep.indexOf('\n    }\n', ri));
check('②-1 GET 만 받는다', /request\.method !== 'GET'/.test(rblk));
check('②-2 정본 getPhpKrwLive 를 부른다', /getPhpKrwLive\(env/.test(rblk));
check('②-3 캐시 금지(private, no-store)', /private, no-store/.test(rblk));

// ── ③ 화면 fmtP 를 실제로 평가 ─────────────────────────────────
const q3 = readFileSync(Q3, 'utf8');
const a = q3.indexOf('  let _prKrw = false;');
const b = q3.indexOf("    : '₱ ' + fmt(n);", a);
check('③ fmtP 블록을 오려 냈다', a > 0 && b > a);
if (a > 0 && b > a) {
  const blk = q3.slice(a, b + "    : '₱ ' + fmt(n);".length);
  const mk = (krw, fx) => new Function(`const fmt=(n)=>(Number(n)||0).toLocaleString('ko-KR');${blk.replace('let _prKrw = false;', `let _prKrw = ${krw};`).replace('let _prFx = null;', `let _prFx = ${JSON.stringify(fx)};`)} return fmtP;`)();
  let r;
  try {
    r = [mk(false, null)(7385), mk(true, { rate: 23.85 })(7385), mk(true, null)(7385), mk(true, { error: 'x' })(7385), mk(false, { rate: 23.85 })(100)];
  } catch (e) { r = ['ERR ' + e.message]; }
  check('③-1 기본은 ₱', r[0] === '₱ 7,385', r[0]);
  check('③-2 켜고 환율 있으면 ₩ 반올림', r[1] === '₩ ' + Math.round(7385 * 23.85).toLocaleString('ko-KR'), r[1]);
  check('③-3 켰는데 환율이 없으면 ₱ 그대로(짝)', r[2] === '₱ 7,385' && r[3] === '₱ 7,385', r[2] + ' / ' + r[3]);
  check('③-4 환율이 있어도 안 켰으면 ₱(짝)', r[4] === '₱ 100', r[4]);
}
check('③-5 저장은 ₱ 원본 그대로(prSaveAll 이 _prRows 를 그대로 보냄)', /rows: _prRows \}\)/.test(q3));
check('③-6 조정 금액 칸은 원화 모드에서 (₱) 라고 말한다', /adj:\(_prKrw\?'조정 금액 \(₱\)'/.test(q3));
check('③-7 강사 화면에서는 환율 줄을 숨긴다', /if \(teacherView\) \{ wrap\.style\.display = 'none'/.test(q3));
check('③-8 전환은 다시 계산하지 않고 다시 그린다(__prReuse)', /window\.__prReuse = true; window\.prCalculate\(\)/.test(q3) && /window\.__prReuse && _prLastD/.test(q3));
const adm = readFileSync(ADMIN, 'utf8');
check('③-9 admin.html 에 버튼·환율 줄이 있다', adm.includes('id="pr-krw-btn"') && adm.includes('id="pr-fx"'));
check('③-10 lazy 전역에 prToggleKrw 등록', /adm-q3\.js\?v=\d+" data-card="card-payroll-auto" data-globals="[^"]*prToggleKrw/.test(adm));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
