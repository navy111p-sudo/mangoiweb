#!/usr/bin/env node
/**
 * 📬 결재 자동화 10단계 (2026-09-25) — 요약 알림에서 한 번에 «묶음 승인» 자리로 · 대표님 주간 요약에 지출 합계
 *
 * 무엇을 지키나
 *   ① digestUrl — 🟢 가 있으면 /work?bulk=1, 없으면 /work(짝).
 *   ② weeklySpend — 승인된 지출만(취소 결재·대기·반려 빼고) · 통화 따로 · 🟡/🔴 수.
 *   ③ 서버 배선 — 요약 알림이 digestUrl 로 갈 곳을 정하고, notify 는 /work 로 시작하는 것만 받는다.
 *        주간 요약이 weeklySpend 를 쓴다.
 *   ④ 화면 — ?bulk=1 이면 1건이어도 묶음 승인 칸을 보이고 그리로 데려간다(짝: 평소엔 2건부터).
 *        남은 🟢 가 없으면 «없다» 고 말한다. ⛔ 저절로 승인하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(process.env.POLICY_SRC || join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(process.env.API_SRC || join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

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

console.log('\n① digestUrl');
try {
  ok('🟢 가 있으면 /work?bulk=1', P.digestUrl(2) === '/work?bulk=1' && P.digestUrl(1) === '/work?bulk=1');
  ok('(짝) 🟢 가 없으면 /work', P.digestUrl(0) === '/work' && P.digestUrl(NaN) === '/work' && P.digestUrl(-1) === '/work');
} catch (e) { ok('digestUrl 을 돌렸다', false, e.message); }

console.log('\n② weeklySpend');
try {
  const r = P.weeklySpend([
    { status: 'approved', amount: 1000, currency: 'PHP', signal: 'green' },
    { status: 'approved', amount: 2500.5, currency: 'php', signal: 'yellow' },
    { status: 'approved', amount: 30000, currency: 'KRW', signal: 'red' },
    { status: 'approved', amount: 9999, currency: 'PHP', reverses_id: 12, signal: 'green' },   // 취소 결재
    { status: 'pending', amount: 7777, currency: 'PHP', signal: 'green' },
    { status: 'rejected', amount: 5555, currency: 'PHP', signal: 'red' },
    { status: 'approved', amount: 0, currency: 'PHP', signal: 'red' },
    { status: 'approved', amount: null, currency: 'PHP', signal: 'red' },
    null,
  ]);
  const php = r.byCur.find(x => x.cur === 'PHP'), krw = r.byCur.find(x => x.cur === 'KRW');
  ok('승인된 지출만 더한다(취소 결재·대기·반려·0원 제외)', php && php.sum === 3500.5 && php.n === 2, JSON.stringify(r));
  ok('통화는 섞지 않는다', krw && krw.sum === 30000 && krw.n === 1 && r.byCur.length === 2);
  ok('🟡/🔴 였던 승인 건 수', r.flagged === 2 && r.count === 3);
  ok('(짝) 전부 🟢 면 flagged 0', P.weeklySpend([{ status: 'approved', amount: 5, currency: 'PHP', signal: 'green' }]).flagged === 0);
  ok('빈 목록이면 count 0', P.weeklySpend([]).count === 0 && P.weeklySpend(null).count === 0);
} catch (e) { ok('weeklySpend 를 돌렸다', false, e.message); }

console.log('\n③ 서버 배선');
{
  const sw = API.slice(API.indexOf('export async function runApprovalSlaSweep'));
  const sweep = bodyAt(sw, sw.indexOf('}> {') + 2);
  ok('전제: 알림 회차 몸통을 잘라 냈다', /let warned = 0/.test(sweep));
  ok('요약 알림이 digestUrl(green) 으로 갈 곳을 넘긴다', /'approval-digest',\s*0, digestUrl\(green\)\)/.test(sweep));
  const ni = API.indexOf('async function notify(');
  const nb = ni < 0 ? '' : API.slice(ni, ni + 2200);
  const m = nb.match(/const url = ([\s\S]*?);\n/);
  ok('전제: notify 의 url 식을 찾았다', !!m);
  if (m) {
    try {
      const f = (reqId, quickSeq, urlOverride) => new Function('reqId', 'quickSeq', 'urlOverride', 'return ' + m[1] + ';')(reqId, quickSeq, urlOverride);
      ok('덮어쓸 주소가 /work… 면 그것', f(0, 0, '/work?bulk=1') === '/work?bulk=1');
      ok('(짝) 없으면 예전처럼 /work?id=N(&qa=)', f(7, 0, '') === '/work?id=7' && f(7, 2, '') === '/work?id=7&qa=2');
      ok('/work 로 시작하지 않는 주소는 안 받는다', f(7, 0, 'https://evil.example/') === '/work?id=7' && f(7, 0, '//x') === '/work?id=7');
    } catch (e) { ok('url 식을 돌렸다', false, e.message); }
  }
  const wi = API.indexOf('export async function runApprovalWeeklyReport');
  const wk = wi < 0 ? '' : API.slice(wi, wi + 9000);
  ok('주간 요약이 weeklySpend 로 «승인된 지출» 줄을 만든다', /const sp = weeklySpend\(/.test(wk) && /if \(sp\.count\)/.test(wk) && /승인된 지출: /.test(wk));
}

console.log('\n④ 화면');
{
  const pb = WORK.indexOf('function paintBulk(){');
  const bl = WORK.indexOf('function bulkLanding(){');
  ok('전제: paintBulk·bulkLanding 을 찾았다', pb >= 0 && bl >= 0);
  const fnAt = i => WORK.slice(i, WORK.indexOf('{', i)) + bodyAt(WORK, i);
  const src = fnAt(pb) + '\n' + fnAt(bl);
  const mk = (clean, want) => {
    const host = { innerHTML: 'X', cls: [], scrolled: 0, classList: null, scrollIntoView() { this.scrolled++; } };
    host.classList = { add: c => host.cls.push(c) };
    const toasts = [];
    const f = new Function('D', 'document', 'T', 'esc', 'toast', 'cleanOnes', 'BULK_WANT0',
      'var BULK_WANT = BULK_WANT0, BULK_KEEP1 = 0;\n' + src +
      '\nreturn { paintBulk, bulkLanding, get want(){ return BULK_WANT; }, get keep(){ return BULK_KEEP1; } };');
    const api = f({ inbox: [] }, { getElementById: id => id === 'bulkBox' ? host : null },
      (en, ko) => ko, x => String(x), m => toasts.push(m), () => clean, want);
    return { api, host, toasts };
  };
  try {
    let t = mk([{ id: 1 }], 0);
    t.api.paintBulk();
    ok('(짝) 평소엔 1건이면 묶음 칸을 안 그린다', t.host.innerHTML === '');
    t = mk([{ id: 1 }], 1);
    t.api.paintBulk(); t.api.bulkLanding();
    ok('?bulk=1 이면 1건이어도 그린다', /1건 한 번에 승인/.test(t.host.innerHTML));
    ok('그리로 데려가고 강조한다 · 한 번만', t.host.scrolled === 1 && t.host.cls.indexOf('bulk-hl') >= 0 && t.api.want === 0);
    t.api.bulkLanding();
    ok('두 번째 다시 그리기에는 또 스크롤하지 않는다', t.host.scrolled === 1);
    t.api.paintBulk();
    ok('데려온 뒤에는 다시 그려도 1건 칸이 남는다', /1건 한 번에 승인/.test(t.host.innerHTML) && t.api.keep === 1);
    t = mk([], 1);
    t.api.paintBulk(); t.api.bulkLanding();
    ok('남은 🟢 가 없으면 «없다» 고 말한다', /한 번에 승인할 건이 없습니다/.test(t.toasts.join()) && t.host.scrolled === 0);
  } catch (e) { ok('화면 함수를 돌렸다', false, e.message); }
  ok('repaint 가 paintBulk 뒤에 bulkLanding 을 부른다', /paintBulk\(\);\s*\n\s*bulkLanding\(\);/.test(bodyAt(WORK, WORK.indexOf('function repaint(){'))));
  ok('?bulk=1 을 읽는다', /\/\[\?&\]bulk=1\(&\|\$\)\/\.test\(location\.search\)\) BULK_WANT = 1/.test(WORK));
  const land = bodyAt(WORK, bl);
  ok('⛔ bulkLanding 은 승인을 보내지 않는다', !/send\(|bulkApprove\(|fetch\(/.test(land));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
