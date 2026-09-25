// 💱 급여 «원화로 보기» 하니스 (2026-09-25)
//   ① 라우트가 결재함과 같은 환율 정본(getTodayFx)을 부르고 «못 구하면 숫자 없이» 답하는지 실제로 돌려 보고
//   ② 화면(adm-q3.js)의 fmtP 를 오려 내 «켜졌을 때만 ₩, 환율이 없으면 ₱ 그대로» 를 실제로 평가한다.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const Q3 = join(ROOT, 'cloudflare-deploy/public/js/adm-q3.js');
const REP = join(ROOT, 'cloudflare-deploy/src/accounting-reports.ts');
const ADMIN = join(ROOT, 'cloudflare-deploy/public/admin.html');

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

// ── ① 환율 정본은 결재함과 «같은» getTodayFx 하나 — 라우트가 그것을 부르고 값을 그대로 옮기는가 ──
//   라우트 블록을 오려 내 가짜 getTodayFx 로 «실제로» 돌린다(원본 getTodayFx 자체는 approval_automation16 이 본다).
const rep = readFileSync(REP, 'utf8');
const ri = rep.indexOf("if (p === 'fx-rate')");
check('① reportsRouter 에 fx-rate 가 있다(index.ts 무수정)', ri > 0);
const rblk = ri > 0 ? rep.slice(ri, rep.indexOf('\n    }\n', ri) + 6) : '';
check('①-1 결재함과 같은 정본 getTodayFx 를 import 한다', /import \{ getTodayFx \} from '\.\/fx-rate'/.test(rep));
check('①-2 급여용 환율 모듈을 따로 두지 않는다(정본 한 벌)', !existsSync(join(ROOT, 'cloudflare-deploy/src/payroll-fx.ts')) && !/getPhpKrwLive/.test(rep));
async function runRoute(method, fx) {
  const body = rblk.replace(/\bas any\b/g, '');
  const fn = new Function('p', 'request', 'env', 'getTodayFx', `return (async () => { ${body} return null; })();`);
  const res = await fn('fx-rate', { method }, {}, async () => fx);
  return res ? { status: res.status, cc: res.headers.get('Cache-Control'), j: await res.json().catch(() => null) } : null;
}
let okR = null, noneR = null, postR = null;
try {
  okR = await runRoute('GET', { krw_per_php: 23.85, date: '2026-09-25', source: 'live' });
  noneR = await runRoute('GET', null);
  postR = await runRoute('POST', { krw_per_php: 23.85, date: '2026-09-25', source: 'live' });
} catch (e) { console.log('  (라우트 실행 오류) ' + e.message); }
check('①-3 환율이 있으면 ok·rate·date·source 를 그대로', okR && okR.status === 200 && okR.j.ok === true && okR.j.rate === 23.85 && okR.j.date === '2026-09-25' && okR.j.source === 'live', JSON.stringify(okR));
check('①-4 못 구하면 ok:false · 숫자 없음(지어내지 않음)', noneR && noneR.status === 502 && noneR.j.ok === false && noneR.j.rate === undefined, JSON.stringify(noneR));
check('①-5 GET 만 받는다', postR && postR.status === 405);
check('①-6 캐시 금지(private, no-store)', okR && okR.cc === 'private, no-store');

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
check('③-4b 옛 값·급여 저장값이면 화면이 그렇게 말한다', /last: '⚠ 지난번에 받은 환율/.test(q3) && /payroll: '⚠ 급여 화면에 저장된 환율/.test(q3));
check('③-5 저장은 ₱ 원본 그대로(prSaveAll 이 _prRows 를 그대로 보냄)', /rows: _prRows \}\)/.test(q3));
check('③-6 조정 금액 칸은 원화 모드에서 (₱) 라고 말한다', /adj:\(_prKrw\?'조정 금액 \(₱\)'/.test(q3));
check('③-7 강사 화면에서는 환율 줄을 숨긴다', /if \(teacherView\) \{ wrap\.style\.display = 'none'/.test(q3));
check('③-8 전환은 다시 계산하지 않고 다시 그린다(__prReuse)', /window\.__prReuse = true; window\.prCalculate\(\)/.test(q3) && /window\.__prReuse && _prLastD/.test(q3));
const adm = readFileSync(ADMIN, 'utf8');
check('③-9 admin.html 에 버튼·환율 줄이 있다', adm.includes('id="pr-krw-btn"') && adm.includes('id="pr-fx"'));
check('③-10 lazy 전역에 prToggleKrw 등록', /adm-q3\.js\?v=\d+" data-card="card-payroll-auto" data-globals="[^"]*prToggleKrw/.test(adm));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
