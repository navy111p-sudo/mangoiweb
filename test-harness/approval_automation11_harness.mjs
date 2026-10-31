#!/usr/bin/env node
/**
 * 🏪 결재 자동화 11단계 (2026-09-25) — 처음 보는 가게 · 일주일에 여러 번 → 🟡 참고 + 대표님 즉시 알림
 *
 * 무엇을 지키나
 *   ① vendorKey / isNewVendor — 이름 모양이 달라도 같은 가게는 같다 · 기록이 적으면 «처음» 이라 말하지 않는다(짝).
 *   ② runChecks — 돈 나가는 분류에서만 frequent · new_vendor 를 붙이고, 문턱 아래·다른 분류는 안 붙인다(짝).
 *        🔴 로 올리지 않는다(🟡 참고).
 *   ③ 대표님 즉시 알림 신호(EXEC_WATCH_CODES)에 두 신호가 들어 있고, 서버가 그 정본 목록을 쓴다.
 *   ④ 서버 — gatherCheckFacts 를 오려 내 가짜 D1 로 «실제로» 돌려 weekCount·newVendor 가 나오고,
 *        올리기·올리기 전 점검 두 곳이 그 값을 runChecks 에 넘긴다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');

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

console.log('\n① vendorKey · isNewVendor');
try {
  ok('모양이 달라도 같은 가게', P.vendorKey('7-Eleven ') === P.vendorKey('7 ELEVEN') && P.vendorKey('7-Eleven') === '7eleven');
  const known = ['Jollibee', 'SM Supermarket', 'National Book Store', 'Petron', 'Mercury Drug',
                 'Puregold', 'Grab', 'Meralco', 'PLDT', 'Ace Hardware'];
  ok('기록이 충분하면 모르는 가게는 «처음»', P.isNewVendor('Robinsons', known) === true);
  ok('(짝) 아는 가게는 «처음» 이 아니다(대소문자·공백 무시)', P.isNewVendor('jollibee', known) === false
     && P.isNewVendor('NATIONAL  BOOK STORE', known) === false);
  ok('(짝) 기록이 문턱보다 적으면 말하지 않는다', P.isNewVendor('Robinsons', known.slice(0, P.VENDOR_HISTORY_MIN - 1)) === false);
  ok('(짝) 이름이 너무 짧거나 비면 말하지 않는다', P.isNewVendor('', known) === false && P.isNewVendor('ab', known) === false
     && P.isNewVendor(null, known) === false);
  ok('같은 가게가 여러 번 적혀도 «하나» 로 센다', P.isNewVendor('Robinsons', Array(20).fill('Jollibee')) === false);
} catch (e) { ok('isNewVendor 를 돌렸다', false, e.message); }

console.log('\n② runChecks — frequent · new_vendor');
try {
  const base = { reqType: 'expense', amount: 500, currency: 'PHP', hasFile: true, ocrAmount: 500,
                 body: 'Printer ink for the office printer.', spentAt: null, now: Date.UTC(2026, 8, 25) };
  const codes = x => P.runChecks({ ...base, ...x }).map(f => f.code);
  const N = P.FREQUENT_WEEK_MIN;
  ok('문턱 이상이면 frequent', codes({ weekCount: N }).includes('frequent'));
  ok('(짝) 문턱 바로 아래는 안 붙는다', !codes({ weekCount: N - 1 }).includes('frequent') && !codes({}).includes('frequent'));
  const fr = P.runChecks({ ...base, weekCount: N }).find(f => f.code === 'frequent');
  ok('«N번째» 는 이 건을 더해 센다', fr && fr.ko.indexOf((N + 1) + '번째') >= 0 && fr.en.indexOf('#' + (N + 1)) >= 0, fr && fr.ko);
  ok('newVendor 가 참이고 이름이 있으면 new_vendor', codes({ newVendor: true, vendor: 'Robinsons' }).includes('new_vendor'));
  ok('(짝) 이름이 없거나 거짓이면 안 붙는다', !codes({ newVendor: true, vendor: '' }).includes('new_vendor')
     && !codes({ newVendor: false, vendor: 'Robinsons' }).includes('new_vendor'));
  ok('(짝) 돈 안 나가는 분류(휴가)엔 안 붙는다',
     !P.runChecks({ reqType: 'leave', hasFile: false, weekCount: 9, newVendor: true, vendor: 'Robinsons' })
       .some(f => f.code === 'frequent' || f.code === 'new_vendor'));
  const both = P.runChecks({ ...base, weekCount: N + 2, newVendor: true, vendor: 'Robinsons' });
  const sig = P.signalOf({ reqType: 'expense', amount: 500, ocrAmount: 500, hasFile: true, flags: both });
  ok('🔴 로 올리지 않는다 — 🟡 참고', sig.signal === 'yellow'
     && sig.reasons.some(r => r.code === 'frequent') && sig.reasons.some(r => r.code === 'new_vendor'), JSON.stringify(sig));
  ok('(짝) 아무 신호가 없으면 🟢 그대로',
     P.signalOf({ reqType: 'expense', amount: 500, ocrAmount: 500, hasFile: true, flags: P.runChecks(base) }).signal === 'green');
} catch (e) { ok('runChecks 를 돌렸다', false, e.message); }

console.log('\n③ 대표님 즉시 알림 신호');
try {
  const W = P.EXEC_WATCH_CODES;
  ok('새 두 신호가 들어 있다', W.includes('new_vendor') && W.includes('frequent'));
  ok('예전 신호도 그대로(큰 금액·중복·AI 검토)', ['unusual_amount', 'duplicate_recent', 'ai_review', 'amount_mismatch_big'].every(c => W.includes(c)));
  ok('(짝) ocr_unread 는 여전히 안 넣는다(소음)', !W.includes('ocr_unread'));
  const code = strip(API);
  ok('서버가 정본 목록을 쓴다', /sig\.reasons\.some\(x => EXEC_WATCH_CODES\.indexOf\(x\.code\) >= 0\)/.test(code));
  ok('(짝) 서버에 옛 목록을 다시 적지 않았다', !/const WATCH\s*=/.test(code));
} catch (e) { ok('알림 신호를 읽었다', false, e.message); }

console.log('\n④ 서버 — gatherCheckFacts 를 실제로 돌린다');
try {
  const i = API.indexOf('async function gatherCheckFacts(');
  ok('전제: 함수를 찾았다', i > 0);
  const sigEnd = API.indexOf('}> {', i);
  const body = bodyAt(API, sigEnd + 2);
  ok('전제: 몸통을 잘라 냈다', body.length > 500);
  const js = body.replace(/\s+as any\[\]/g, '').replace(/\s+as any\b/g, '').replace(/\.all<\{[^>]*\}>/g, '.all')
                 .replace(/: any\b/g, '').replace(/: number\b/g, '');
  const run = async (rows) => {
    const seen = [];
    const env = { DB: { prepare(sql) {
      seen.push(sql);
      const stmt = { bind() { return stmt; },
        async first() {
          if (/created_at >= \?\s*AND status NOT IN/.test(sql) && !/amount = \?/.test(sql)) return { c: rows.week };
          if (/SUM\(amount\)/.test(sql)) return { s: 0 };
          return { c: 0 };
        },
        async all() {
          if (/DISTINCT vendor/.test(sql)) { if (rows.vendorThrow) throw new Error('no such column: vendor'); return { results: rows.vendors.map(v => ({ vendor: v })) }; }
          return { results: [] };
        } };
      return stmt;
    } } };
    const safe = async (fn, fb) => { try { return await fn(); } catch { return fb; } };
    const f = new Function('safe', 'isNewVendor', 'env', 'requester', 'reqType', 'amount', 'currency', 'vendor',
      'return (async () => ' + js + ')();');
    const out = await f(safe, P.isNewVendor, env, 'mgr_karl', 'expense', 500, 'PHP', rows.vendor ?? null);
    return { out, seen };
  };
  const known = ['Jollibee', 'SM', 'National Book Store', 'Petron', 'Mercury Drug', 'Puregold', 'Grab', 'Meralco', 'PLDT', 'Ace Hardware', 'Shopee'];
  const a = await run({ week: 4, vendors: known, vendor: 'Robinsons' });
  ok('weekCount 를 돌려준다', a.out.weekCount === 4, JSON.stringify(a.out));
  ok('처음 보는 가게면 newVendor = true', a.out.newVendor === true);
  const b = await run({ week: 0, vendors: known, vendor: 'jollibee' });
  ok('(짝) 아는 가게면 false', b.out.newVendor === false && b.out.weekCount === 0);
  const c = await run({ week: 0, vendors: known, vendor: null });
  ok('(짝) 가게 이름이 없으면 가게 조회를 하지 않는다', c.out.newVendor === false && !c.seen.some(s => /DISTINCT vendor/.test(s)));
  const d = await run({ week: 0, vendors: [], vendor: 'Robinsons', vendorThrow: true });
  ok('칸이 없어 조회가 실패하면 «처음» 이라 하지 않는다(던지지도 않는다)', d.out.newVendor === false);
  const wkSql = a.seen.find(s => /created_at >= \?/.test(s) && /requester_username = \?/.test(s) && !/amount = \?/.test(s));
  ok('주간 건수는 반려·회수·취소·취소결재를 빼고 센다', wkSql && /status NOT IN \('rejected','withdrawn','cancelled'\)/.test(wkSql) && /reverses_id IS NULL/.test(wkSql));
  const vSql = a.seen.find(s => /DISTINCT vendor/.test(s)) || '';
  ok('아는 가게는 «승인된» 결재에서만 모은다', /status = 'approved'/.test(vSql) && /reverses_id IS NULL/.test(vSql));
} catch (e) { ok('gatherCheckFacts 를 돌렸다', false, e.message); }

console.log('\n⑤ 두 입구가 값을 넘기는가');
try {
  const code = strip(API);
  const calls = code.match(/gatherCheckFacts\(env, actor\.username, reqType, amount, currency, (\w+)\)/g) || [];
  ok('올리기·점검 두 곳 모두 가게 이름을 넘긴다', calls.length === 2, String(calls.length));
  const passes = code.match(/weekCount: facts\.weekCount, vendor: (\w+), newVendor: facts\.newVendor/g) || [];
  ok('두 곳 모두 runChecks 에 weekCount·vendor·newVendor 를 넘긴다', passes.length === 2, String(passes.length));
  const gv = [...code.matchAll(/gatherCheckFacts\(env, actor\.username, reqType, amount, currency, (\w+)\)/g)].map(m => m[1]);
  const rv = [...code.matchAll(/weekCount: facts\.weekCount, vendor: (\w+), newVendor/g)].map(m => m[1]);
  ok('두 입구 모두 «영수증에서 읽은 가게 이름» 변수를 넘긴다(null·상수 아님)',
     gv.join(',') === 'ocrVendor,preVendor', gv.join(','));
  ok('각 입구에서 조회에 넘긴 가게 = runChecks 에 넘긴 가게', gv.join(',') === rv.join(','), gv + ' / ' + rv);
  ok('점검 입구의 가게 이름은 화면이 보낸 ocr_vendor 에서 온다',
     /const preVendor = String\(b\?\.ocr_vendor \|\| ''\)/.test(code));
} catch (e) { ok('배선을 읽었다', false, e.message); }

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
