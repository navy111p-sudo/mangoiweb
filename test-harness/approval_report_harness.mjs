/*
 * 📊 결재 「지출 정리」 — 합계가 **정말 맞는가** (2026-09-04)
 *
 *   [왜 이렇게 검사하나]
 *     합계는 **틀려도 에러가 안 납니다.** 통화를 섞거나 반려를 함께 더해도
 *     화면은 멀쩡한 숫자를 보여 주고, 그 숫자가 그대로 사장님 판단 근거가 됩니다.
 *     그래서 정본 summarizeApprovals() 를 **실제로 돌려 숫자를 셉니다.**
 *
 *   [짝으로 본다]
 *     「반려는 안 센다」만 검사하면 **아무것도 안 세는 코드**가 통과합니다.
 *     그래서 「승인은 실제로 센다」를 언제나 함께 셉니다.
 *
 *   [무엇이 걸려 있나]
 *     · 통화를 섞으면 환율을 지어내는 것이 됩니다(PHP + KRW 를 더할 수 없습니다).
 *     · 대기를 승인과 합치면 「이번 달 얼마 썼나」가 거짓이 됩니다.
 *     · 모르는 값을 0으로 때우면 「금액 없는 결재」가 «0원짜리» 로 보입니다.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = join(ROOT, 'cloudflare-deploy/src');
const PUB = join(ROOT, 'cloudflare-deploy/public');

const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { summarizeApprovals, CATEGORIES } = P;

const api = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const work = readFileSync(join(PUB, 'work.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const KST = (d) => Date.parse(d + 'T00:00:00+09:00') + 12 * 3600_000;
/** 통화별 합계를 꺼낸다. 없으면 undefined — 0 과 구분한다. */
const cur = (list, c) => (list.find((x) => x.currency === c) || {}).total;

console.log('════════ 결재 지출 정리 하니스 ════════');

// ══ ⓪ 전제 ═══════════════════════════════════════════════════════════════
console.log('\n[⓪] 전제 — 정본을 실제로 부를 수 있는가');
check('summarizeApprovals 를 불러왔다', typeof summarizeApprovals === 'function');
check('항목 목록도 함께 읽었다 (이름 붙이기에 쓴다)', CATEGORIES.length >= 5);

// ══ ① 통화 ═══════════════════════════════════════════════════════════════
console.log('\n[①] 통화 — PHP 와 KRW 를 절대 더하지 않는다');

const mixed = summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: 1000, currency: 'PHP', created_at: KST('2026-09-01') },
  { req_type: 'expense', status: 'approved', amount: 50000, currency: 'KRW', created_at: KST('2026-09-01') },
]);
check('통화가 둘이면 줄도 둘이다', mixed.approved_money.length === 2,
  JSON.stringify(mixed.approved_money));
check('PHP 합계가 맞다', cur(mixed.approved_money, 'PHP') === 1000);
check('KRW 합계가 맞다', cur(mixed.approved_money, 'KRW') === 50000);
check('⛔ 둘을 더한 «하나의 숫자» 를 만들지 않는다',
  !mixed.approved_money.some((b) => b.total === 51000));

const sameCur = summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: 100, currency: 'PHP', created_at: KST('2026-09-01') },
  { req_type: 'expense', status: 'approved', amount: 250, currency: 'PHP', created_at: KST('2026-09-01') },
]);
check('같은 통화는 더한다 (짝 검사 — 아무것도 안 더하는 코드는 여기서 걸린다)',
  cur(sameCur.approved_money, 'PHP') === 350, JSON.stringify(sameCur.approved_money));
check('통화를 안 적었으면 기본 통화로 본다 (버리지 않는다)',
  cur(summarizeApprovals([{ req_type: 'expense', status: 'approved', amount: 7,
                            created_at: KST('2026-09-01') }]).approved_money, 'PHP') === 7);

// ══ ② 상태 ═══════════════════════════════════════════════════════════════
console.log('\n[②] 상태 — 승인·대기·반려를 섞지 않는다');

const byStat = summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: 100, currency: 'PHP', created_at: KST('2026-09-01') },
  { req_type: 'expense', status: 'pending',  amount: 200, currency: 'PHP', created_at: KST('2026-09-01') },
  { req_type: 'expense', status: 'rejected', amount: 400, currency: 'PHP', created_at: KST('2026-09-01') },
]);
check('승인만 «확정된 돈»', cur(byStat.approved_money, 'PHP') === 100,
  JSON.stringify(byStat.approved_money));
check('대기는 따로 «아직 아닌 돈»', cur(byStat.pending_money, 'PHP') === 200,
  JSON.stringify(byStat.pending_money));
check('⛔ 반려는 어느 합계에도 안 들어간다 (안 쓴 돈)',
  cur(byStat.approved_money, 'PHP') === 100 && cur(byStat.pending_money, 'PHP') === 200);
check('상태 건수는 셋 다 센다 (합계에서 뺐다고 «없던 일» 이 아니다)',
  byStat.by_status.approved === 1 && byStat.by_status.pending === 1 && byStat.by_status.rejected === 1,
  JSON.stringify(byStat.by_status));
check('모르는 상태는 other 로 (조용히 승인으로 넣지 않는다)',
  summarizeApprovals([{ req_type: 'expense', status: 'zzz', amount: 9, created_at: 1 }])
    .by_status.other === 1);

// ══ ③ 모르는 것을 0으로 때우지 않는다 ════════════════════════════════════
console.log('\n[③] 모르는 것 — 0으로 때우지 않는다');

const gaps = summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: null, currency: 'PHP', created_at: KST('2026-09-01') },
  { req_type: 'expense', status: 'approved', amount: 500,  currency: 'PHP', created_at: KST('2026-09-01') },
]);
check('금액 없는 건을 «금액 없음» 으로 센다', gaps.no_amount === 1, gaps.no_amount + '건');
check('그 건이 합계를 흔들지 않는다 (0원으로 더하지 않는다)',
  cur(gaps.approved_money, 'PHP') === 500, JSON.stringify(gaps.approved_money));
check('건수에는 들어간다 (합계에서 뺐다고 «없던 일» 이 아니다)',
  gaps.by_status.approved === 2);

/* ⚠️ 금액은 «돈이 나가는 분류» 에서만 뜻이 있다 — 긴급·불만에 금액이 없는 것은
   빠뜨린 것이 아니라 원래 없는 것이다. 그것까지 세면 화면이 멀쩡한 결재를
   «덜 채워진 것» 처럼 말한다. */
check('긴급·불만의 «금액 없음» 은 세지 않는다',
  summarizeApprovals([{ req_type: 'urgent', status: 'pending', amount: null, created_at: 1 }])
    .no_amount === 0);
check('휴가의 «항목 없음» 도 세지 않는다',
  summarizeApprovals([{ req_type: 'leave', status: 'approved', category: null, created_at: 1 }])
    .no_category === 0);
check('지출의 «항목 없음» 은 센다 (짝 검사)',
  summarizeApprovals([{ req_type: 'expense', status: 'approved', category: null, amount: 1, created_at: 1 }])
    .no_category === 1);

check('영수증이 필요한데 없으면 센다',
  summarizeApprovals([{ req_type: 'expense', status: 'approved', amount: 1, file_key: null, created_at: 1 }])
    .no_file === 1);
check('영수증이 있으면 안 센다 (짝 검사)',
  summarizeApprovals([{ req_type: 'expense', status: 'approved', amount: 1, file_key: 'k', created_at: 1 }])
    .no_file === 0);
check('영수증이 필요 없는 분류는 안 센다',
  summarizeApprovals([{ req_type: 'doc', status: 'approved', file_key: null, created_at: 1 }])
    .no_file === 0);

/* 🔴 반려는 세지 않는다 — 아래 by_category 가 반려를 빼므로, 세면 화면이
   「항목 없음 1건 — 위 「항목 없음」 줄이 그것입니다」라고 하는데 **그 줄이 없다.**
   사람이 없는 줄을 찾게 된다(2026-09-04 함정 대조 지적). */
const rej = summarizeApprovals([
  { req_type: 'expense', status: 'rejected', category: null, amount: null, file_key: null, created_at: 1 },
]);
check('반려는 «항목 없음» 으로 세지 않는다 (가리킬 줄이 없다)', rej.no_category === 0, rej.no_category + '건');
check('반려는 «금액 없음» 으로도 세지 않는다', rej.no_amount === 0, rej.no_amount + '건');
check('반려는 «영수증 없음» 으로도 세지 않는다', rej.no_file === 0, rej.no_file + '건');
check('그래도 반려 건수는 센다 (없던 일이 아니다)', rej.by_status.rejected === 1);
/* 짝 검사 — 승인·대기는 실제로 센다(전부 안 세는 코드가 통과하지 않게) */
check('짝 검사 — 대기 중인 건은 «모르는 것» 으로 센다', (() => {
  const r = summarizeApprovals([{ req_type: 'expense', status: 'pending', category: null,
                                  amount: null, file_key: null, created_at: 1 }]);
  return r.no_category === 1 && r.no_amount === 1 && r.no_file === 1;
})());
/* 「모르는 것」 이 가리키는 줄이 실제로 있는가 — 세는 쪽과 그리는 쪽이 어긋나지 않게 */
check('«항목 없음» 을 셌으면 항목별에도 그 줄이 있다 (세는 쪽과 그리는 쪽이 짝)', (() => {
  const r = summarizeApprovals([
    { req_type: 'expense', status: 'approved', category: null, amount: 10, created_at: 1 },
    { req_type: 'expense', status: 'rejected', category: null, amount: 20, created_at: 1 },
  ]);
  const hasNone = r.by_category.some((c) => c.key === null);
  return (r.no_category > 0) === hasNone && r.no_category === 1;
})());

// ══ ④ 항목별 ═════════════════════════════════════════════════════════════
console.log('\n[④] 항목별');

const byCat = summarizeApprovals([
  { req_type: 'expense',  status: 'approved', category: 'utility', amount: 100, currency: 'PHP', created_at: 1 },
  { req_type: 'expense',  status: 'approved', category: 'utility', amount: 200, currency: 'PHP', created_at: 1 },
  { req_type: 'purchase', status: 'pending',  category: 'equipment', amount: 900, currency: 'PHP', created_at: 1 },
  { req_type: 'expense',  status: 'rejected', category: 'utility', amount: 9999, currency: 'PHP', created_at: 1 },
  { req_type: 'expense',  status: 'approved', category: null, amount: 5, currency: 'PHP', created_at: 1 },
]);
const u = byCat.by_category.find((c) => c.key === 'utility');
check('같은 항목을 모은다', !!u && u.count === 2 && cur(u.money, 'PHP') === 300,
  JSON.stringify(u));
check('⛔ 반려는 항목별에도 안 들어간다', !!u && cur(u.money, 'PHP') === 300);
check('대기도 항목별에는 들어간다 (예정된 지출을 보려는 화면이다)',
  !!byCat.by_category.find((c) => c.key === 'equipment'));
check('항목을 안 고른 건은 «항목 없음» 으로 따로 선다 (기타에 섞지 않는다)',
  !!byCat.by_category.find((c) => c.key === null),
  JSON.stringify(byCat.by_category.map((c) => c.key)));
check('«항목 없음» 은 언제나 맨 뒤 (항목이 붙은 것이 먼저 보여야 한다)',
  byCat.by_category[byCat.by_category.length - 1].key === null,
  JSON.stringify(byCat.by_category.map((c) => c.key)));
check('항목 이름·회계 계정을 함께 준다 (화면이 key 를 그대로 보여 주지 않게)',
  !!u && !!u.ko && !!u.account, JSON.stringify(u && { ko: u.ko, account: u.account }));
check('«항목 없음» 에는 회계 계정을 지어내지 않는다',
  byCat.by_category[byCat.by_category.length - 1].account === null);
check('돈이 안 나가는 분류는 항목별에 안 들어간다',
  summarizeApprovals([{ req_type: 'leave', status: 'approved', created_at: 1 }]).by_category.length === 0);

// ══ ⑤ 달별 ═══════════════════════════════════════════════════════════════
console.log('\n[⑤] 달별 — 어느 날짜로 자르는가');

const byMon = summarizeApprovals([
  // 지출일이 있으면 «쓴 날» 로
  { req_type: 'expense', status: 'approved', amount: 10, currency: 'PHP',
    spent_at: '2026-08-31', created_at: KST('2026-09-03') },
  // 없으면 올린 날로
  { req_type: 'expense', status: 'approved', amount: 20, currency: 'PHP',
    created_at: KST('2026-09-03') },
]);
check('지출일이 있으면 그 달로 잡는다', !!byMon.by_month.find((m) => m.month === '2026-08'),
  JSON.stringify(byMon.by_month.map((m) => m.month)));
check('지출일이 없으면 올린 달로 잡는다', !!byMon.by_month.find((m) => m.month === '2026-09'));
check('어느 눈금을 썼는지 세어서 알려 준다 (화면이 그 사실을 말해야 한다)',
  byMon.dated_by_spent === 1 && byMon.dated_by_created === 1,
  JSON.stringify([byMon.dated_by_spent, byMon.dated_by_created]));
check('달은 오래된 것부터', summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: 1, spent_at: '2026-09-01', created_at: 1 },
  { req_type: 'expense', status: 'approved', amount: 1, spent_at: '2026-07-01', created_at: 1 },
]).by_month.map((m) => m.month).join(',') === '2026-07,2026-09');
check('달별은 승인만 (대기·반려가 «쓴 돈» 으로 안 보이게)',
  summarizeApprovals([{ req_type: 'expense', status: 'pending', amount: 1,
                        spent_at: '2026-09-01', created_at: 1 }]).by_month.length === 0);
check('KST 로 자른다 — 한국 자정 직후는 그날이다', summarizeApprovals([
  { req_type: 'expense', status: 'approved', amount: 1,
    created_at: Date.parse('2026-09-01T00:10:00+09:00') },
]).by_month[0].month === '2026-09');

// ══ ⑥ 이상한 값에도 안 터진다 ════════════════════════════════════════════
console.log('\n[⑥] 이상한 값');
check('빈 배열이어도 안 터진다', summarizeApprovals([]).counted === 0);
check('null 을 넘겨도 안 터진다', summarizeApprovals(null).counted === 0);
check('금액이 글자면 «모름» 으로 (NaN 을 더하지 않는다)', (() => {
  const r = summarizeApprovals([{ req_type: 'expense', status: 'approved', amount: 'abc',
                                  currency: 'PHP', created_at: 1 }]);
  const t = cur(r.approved_money, 'PHP');
  return t === 0 && r.no_amount === 1;
})());
check('음수 금액도 «모름» 으로 (합계를 깎지 않는다)', (() => {
  const r = summarizeApprovals([{ req_type: 'expense', status: 'approved', amount: -500,
                                  currency: 'PHP', created_at: 1 }]);
  return cur(r.approved_money, 'PHP') === 0 && r.no_amount === 1;
})());
check('모르는 분류는 문서로 봐서 지출 합계를 흔들지 않는다',
  summarizeApprovals([{ req_type: '없는분류', status: 'approved', amount: 9,
                        currency: 'PHP', created_at: 1 }]).by_category.length === 0);

// ══ ⑦ 운영 D1 에 실제로 있는 3건 ═════════════════════════════════════════
console.log('\n[⑦] 운영 실데이터 3건 (2026-09-04 실측)');
/* 그날 D1 에서 그대로 뽑은 값이다. 「그럴듯한 예시」가 아니라 **실제 행**이라
   화면이 오늘 무엇을 말할지가 여기서 그대로 나온다. */
const real = summarizeApprovals([
  { req_type: 'expense',  status: 'approved', category: null, amount: 1,
    currency: 'PHP', spent_at: null, created_at: KST('2026-08-05'), file_key: null },
  { req_type: 'urgent',   status: 'pending',  category: null, amount: null,
    currency: 'PHP', spent_at: null, created_at: KST('2026-08-30'), file_key: null },
  { req_type: 'purchase', status: 'approved', category: null, amount: 2800,
    currency: 'PHP', spent_at: '2026-09-03', created_at: KST('2026-09-03'), file_key: 'k' },
]);
check('승인 2건 · PHP 2,801', real.by_status.approved === 2 && cur(real.approved_money, 'PHP') === 2801,
  JSON.stringify(real.approved_money));
check('대기 1건이고 금액이 없어 대기 합계는 0', real.by_status.pending === 1 &&
  (cur(real.pending_money, 'PHP') || 0) === 0);
check('항목 없음 2건 — 긴급은 안 센다 (지출·물품만)', real.no_category === 2, real.no_category + '건');
check('영수증 없음 1건 — 8/5 지출분', real.no_file === 1, real.no_file + '건');
check('«금액 없음» 은 0건 — 긴급은 원래 금액이 없다', real.no_amount === 0, real.no_amount + '건');
check('달은 2026-08 · 2026-09 둘',
  real.by_month.map((m) => m.month).join(',') === '2026-08,2026-09',
  JSON.stringify(real.by_month.map((m) => m.month)));
check('항목별은 «항목 없음» 한 줄뿐 (오늘의 사실 그대로)',
  real.by_category.length === 1 && real.by_category[0].key === null);

// ══ ⑧ 배선 ═══════════════════════════════════════════════════════════════
console.log('\n[⑧] 배선 — 새 경로를 안 만들고 화면이 제대로 부르는가');

check('새 API 경로를 안 만들었다 (기존 목록 경로에 view=report 만)',
  /view'\) === 'report'/.test(api) && /summarizeApprovals\(/.test(api));
check('화면이 view=report 로 부른다', /view=report/.test(work));
check('상한이 있고 넘으면 «잘렸다» 고 내려준다',
  /REPORT_MAX/.test(api) && /truncated:\s*hasMore/.test(api));
check('화면이 «잘렸다» 를 사람에게 말한다', /REP\.truncated/.test(work));

/* 🔴 canView 로 거른 «뒤» 에 세야 인사·급여가 합계에 안 섞인다. 위치로 본다.
   ⚠️ 파일 전체에서 indexOf 하면 안 된다 — `if (!canView(actor` 가 이 파일에 **네 곳**
      있고 그 첫 번째가 훨씬 앞이라, 순서를 뒤집어도 늘 «앞» 으로 나와 검사가 헛돈다
      (2026-09-04 변이시험에서 실제로 그 상태로 통과했다).
   ✅ 그 라우트 블록만 잘라서 그 «안» 에서 비교한다. */
/* ⚠️ 앵커를 `path === '…/requests'` 로 잡으면 **POST 라우트가 먼저** 걸린다(941행).
   메서드까지 넣어 그 라우트를 콕 집고, 끝은 **중괄호 짝**으로 자른다(길이로 자르면
   옆 함수가 딸려 들어온다 — CLAUDE.md 2장). */
const routeAt = api.indexOf("if (method === 'GET' && path === '/api/approval/requests') {");
let route = '';
if (routeAt >= 0) {
  let i = api.indexOf('{', routeAt), d = 0;
  for (; i < api.length; i++) {
    if (api[i] === '{') d++;
    else if (api[i] === '}') { d--; if (d === 0) { i++; break; } }
  }
  route = api.slice(routeAt, i);
}
check('목록 라우트를 실제로 잘라 냈다 (전제 — 못 자르면 아래가 헛돈다)',
  route.length > 500 && route.indexOf('summarizeApprovals') > 0, route.length + '자');
/* 🔴 «위치» 만으로는 못 잡습니다 — 2026-09-04 에 실제로 `page`(거르기 «전»)를 넘기고도
   이 검사가 통과했고, 인사·급여 750,000 이 남의 합계에 섞였습니다(함정 대조가 잡음).
   ✅ 물어야 할 것은 「거른 «결과» 를 쓰는가」입니다 — canView 루프가 채우는 그 변수를
      소스에서 **읽어서** 대조합니다. */
const pushM = route.match(/if \(!canView\(actor[\s\S]{0,300}?\n\s*(\w+)\.push\(rowOf\(/);
const filtered = pushM ? pushM[1] : null;
check('canView 가 채우는 변수를 찾았다 (전제 — 못 찾으면 아래가 헛돈다)',
  !!filtered, String(filtered));
const sumArgM = route.match(/summarizeApprovals\(\s*(\w+)/);
const sumArg = sumArgM ? sumArgM[1] : null;
check('합계를 «거른 결과» 로 낸다 — canView 가 채운 바로 그 변수',
  !!filtered && sumArg === filtered, `canView→${filtered} · summarize(${sumArg})`);
check('⛔ 거르기 «전» 행(page)을 넘기지 않는다 — 인사·급여가 합계로 샌다',
  !/summarizeApprovals\(\s*page\b/.test(route));
/* 엑셀과 리포트가 «같은 행» 을 봐야 한다 — 하나만 걸러지면 파일과 화면이 어긋난다. */
const csvArgM = route.match(/csvResponse\(\s*(\w+)/);
check('엑셀도 같은 행을 본다 (화면과 파일이 어긋나지 않게)',
  !!csvArgM && csvArgM[1] === sumArg, `csv(${csvArgM && csvArgM[1]}) · summarize(${sumArg})`);
check('report 는 offset 을 무시한다 («중간만» 센 합계가 나오지 않게)',
  /const offset = report \? 0 :/.test(route));

/* ⛔ 화면이 스스로 통화를 더하면 서버 규칙이 무의미해진다. */
const workJs = work.replace(/<!--[\s\S]*?-->/g, '');
check('화면이 통화를 합쳐 하나로 만들지 않는다 (repMoney 가 줄로 나열)',
  /function repMoney/.test(workJs) && /out\.join\('  ·  '\)/.test(workJs));
/* ⚠️ 「그 이름이 파일에 있는가」로 물으면 안 된다 — 조건을 `if (false)` 로 죽여도
   **안내 «문구» 안에 그 이름이 남아** 통과한다(변이시험에서 실제로 통과했다).
   ✅ 조건 자체를 본다: gaps 를 채우는 줄이 그 값을 «보고» 있는가. */
const GAP_KEYS = ['no_category', 'no_amount', 'no_file', 'dated_by_created'];
const missGuard = GAP_KEYS.filter((k) => !new RegExp('if \\(s\\.' + k + '\\)').test(workJs));
check('화면이 «모르는 것» 을 적는 자리가 있다 (숫자만 보여 주지 않는다)', /repgap/.test(workJs));
check('그 안내가 실제로 그 값을 보고 켜진다 (문구만 남기고 조건을 죽이지 않았다)',
  missGuard.length === 0, missGuard.join(','));
check('«잘렸다» 도 같은 자리에서 말한다', /if \(REP\.truncated\)/.test(workJs));
check('첫 화면 예산 — 접혀 있다가 누를 때만 부른다',
  /id="repPanel"[^>]*hidden/.test(work) && /if \(!REP\) runRep\(\)/.test(work));
check('언어를 바꾸면 다시 그린다 (JS 로 그린 글자는 data-ko 루프가 못 건드린다)',
  /if \(rp && !rp\.hidden\) \{ paintRepChrome\(\); paintRep\(\); \}/.test(work));
check('«전체» 는 결재자에게만 (서버도 같은 판정으로 403)',
  /D\.can_approve\) scopes\.push\(\['all'/.test(workJs));
check('성공을 «성공이라고 말했는가» 로 판정한다 (404 본문에는 ok 칸이 없다)',
  /d\.ok !== true \|\| !d\.summary/.test(workJs));

console.log('\n──────────────────────────────────────');
if (FAIL) {
  console.log(`  ❌ ${FAIL}건 실패 / ${PASS + FAIL}건`);
  for (const f of FAILS) console.log('     ' + f);
  console.log('  합계는 틀려도 에러가 안 납니다. 위 항목을 고치세요.');
  process.exit(1);
}
console.log(`  ✅ ${PASS}건 전부 통과 — 합계가 사실을 말합니다.`);
