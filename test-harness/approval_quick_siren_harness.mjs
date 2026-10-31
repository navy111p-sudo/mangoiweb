#!/usr/bin/env node
/**
 * 📲🚨 결재 — 알림에서 바로 승인 · 관리자 화면 사이렌 · 반려 줄이기 · 매달 반복 · 켜기 판단 (2026-09-24)
 *
 * 무엇을 지키나
 *   ① pushApproveDenyReason — 알림 [승인] 은 «볼 것이 없는» 건만. 「막는다」 옆에 「🟢 돈 건은 통과」를 짝으로.
 *   ② 배선 — decide 가 via:'push' 일 때 그 게이트를 «지금 잰 신호» 로 부르는가, notify 가 &qa= 를 다는가,
 *      sw.js 가 링크에서 번호를 읽어 버튼을 달고 누르면 via:'push' 로 보내는가.
 *   ③ 관리자 사이렌 — due() 를 실제로 돌려 «울릴 건만» 고르는가(대신 결재·앞 단계 내가 찍은 건·밤 제외).
 *   ④ 반려 사유 목록이 화면 버튼(WHYS)과 같은 글자인가 · rejectTipsFrom · shadowTally · monthlyRepeats.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(join(PUB, 'work.html'), 'utf8');
const SW = readFileSync(join(PUB, 'sw.js'), 'utf8');
const ADMIN = readFileSync(join(PUB, 'admin.html'), 'utf8');
const SIREN = readFileSync(join(PUB, 'js', 'adm-approval-siren.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
function bodyAt(src, i) {             // 여는 중괄호부터 짝 맞는 닫는 중괄호까지
  const s = src.indexOf('{', i); if (s < 0) return '';
  let d = 0;
  for (let k = s; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(s, k + 1); }
  }
  return '';
}

console.log('\n① 알림 [승인] 게이트');
{
  const base = { decision: 'approved', expectSeq: 1, seq: 1, signal: 'green', reqType: 'purchase', byProxy: false, reversesId: null };
  const g = (o) => P.pushApproveDenyReason(Object.assign({}, base, o));
  ok('🟢 물품 · 같은 단계 · 주 결재자 → 통과(짝)', g({}) === null);
  ok('🟢 지출도 통과(짝)', g({ reqType: 'expense' }) === null);
  ok('🟡 는 막는다', g({ signal: 'yellow' }) === 'not_green');
  ok('🔴 는 막는다', g({ signal: 'red' }) === 'not_green');
  ok('반려는 막는다(사유를 써야 함)', g({ decision: 'rejected' }) === 'approve_only');
  ok('단계가 넘어갔으면 막는다', g({ expectSeq: 2 }) === 'stage_moved');
  ok('단계 번호가 없으면 막는다', g({ expectSeq: undefined }) === 'stage_moved');
  ok('휴가 등 돈 아닌 분류는 막는다', g({ reqType: 'leave' }) === 'type_not_quick');
  ok('대신 결재는 막는다', g({ byProxy: true }) === 'proxy');
  ok('취소 결재는 막는다', g({ reversesId: 12 }) === 'reversal');
  ok('quickApprovable: 🟢 돈 건만 버튼', P.quickApprovable({ signal: 'green', reqType: 'purchase' }) === true
     && P.quickApprovable({ signal: 'yellow', reqType: 'purchase' }) === false
     && P.quickApprovable({ signal: 'green', reqType: 'leave' }) === false
     && P.quickApprovable({ signal: 'green', reqType: 'expense', reversesId: 3 }) === false);
}

console.log('\n② 배선');
{
  const di = API.indexOf("path.match(/^\\/api\\/approval\\/requests\\/(\\d+)\\/decide$/)");
  ok('전제: decide 라우트를 찾았다', di > 0);
  const dBody = bodyAt(API, API.indexOf('if (method === \'POST\' && mDecide)', di));
  const pi = dBody.indexOf("String(payload?.via || '') === 'push'");
  ok('decide 가 via:push 를 따로 본다', pi > 0);
  const pBlock = bodyAt(dBody, pi);
  ok('그 갈래가 신호를 «지금» 다시 잰다(signalOf(cur…))', /signalOf\(\{\s*reqType:\s*cur\.req_type/.test(pBlock));
  ok('그 갈래가 게이트를 부르고 막으면 돌아간다', /pushApproveDenyReason\(/.test(pBlock) && /if \(deny\)\s*\{[\s\S]*return json/.test(pBlock));
  ok('게이트가 «지금 잰» 신호를 넘긴다', /signal:\s*psig\.signal/.test(pBlock));
  ok('게이트 갈래가 DB 를 바꾸는 UPDATE 보다 앞이다', pi < dBody.indexOf('UPDATE approval_requests'));
  // ⚠️ notify 의 반환 타입(Promise<{…}>)에 중괄호가 먼저 나온다 — 그 뒤의 몸통부터 자른다.
  const ni = API.indexOf('async function notify(');
  const nBody = bodyAt(API, API.indexOf('> {', ni) + 1);
  ok('notify 가 quickSeq 로 &qa= 를 붙인다', /quickSeq > 0 \? '&qa=' \+ quickSeq/.test(nBody));
  ok('새 결재·다음 단계·재알림 세 곳이 quickSeq 를 넘긴다',
     /reqId, 'approval',\s*\n\s*quickApprovable\(/.test(API) && /'approval', quickSeqOf\(cur, nextSeq\)/.test(API)
     && /'approval-nudge', quickSeqOf\(r, seq\)/.test(API));

  // sw.js — approvalQuick 을 오려 내 실제로 돌린다
  const qi = SW.indexOf('function approvalQuick(');
  ok('전제: sw.js approvalQuick 이 있다', qi > 0);
  let aq = null;
  try {
    const fnSrc = SW.slice(qi, qi + SW.slice(qi).indexOf('{')) + bodyAt(SW, qi);
    aq = new Function('self', 'URL', 'return ' + fnSrc)({ location: { origin: 'https://mangoi.ai' } }, URL);
  } catch (e) { aq = null; }
  ok('approvalQuick 을 실행할 수 있다', typeof aq === 'function');
  if (typeof aq === 'function') {
    const r1 = aq('/work?id=42&qa=2');
    ok('/work?id=42&qa=2 → {id:42, seq:2}', r1 && r1.id === 42 && r1.seq === 2);
    ok('qa 가 없으면 버튼 없음(짝)', aq('/work?id=42') === null);
    ok('다른 화면 주소는 버튼 없음', aq('/?id=42&qa=1') === null);
  }
  ok('qa 가 있을 때만 actions 를 단다', /if \(qa\) \{\s*\n\s*opts\.actions = \[\{ action: 'approve'/.test(SW));
  const ai = SW.indexOf('async function approveFromPush(');
  const aBody = bodyAt(SW, ai);
  ok('승인 요청이 via:push 와 단계를 싣는다', /via: 'push', expect_seq: qa\.seq/.test(aBody));
  ok('성공 판정은 ok === true 로(«실패라고 안 했다» 가 아니라)', /d\.ok === true/.test(aBody));
  ok('결과를 반드시 알림으로 말한다', /showNotification\(ok \?/.test(aBody));
  ok('approve 버튼일 때만 그 경로로 간다', /event\.action === 'approve' && qa/.test(SW));
}

console.log('\n③ 관리자 사이렌');
{
  ok('admin.html 이 사이렌 파일을 싣는다(defer)', /<script src="\/js\/adm-approval-siren\.js\?v=\d+" defer><\/script>/.test(ADMIN));
  ok('결재함과 같은 미루기 저장칸을 쓴다', SIREN.indexOf("'mangoi_work_siren_snooze_v1'") > 0 && WORK.indexOf("'mangoi_work_siren_snooze_v1'") > 0);
  ok('403·401 이면 그만 묻는다', /r\.status === 401 \|\| r\.status === 403\) \{ stopped = true/.test(SIREN));
  // due() 를 실제로 돌린다
  const di = SIREN.indexOf('function due()');
  const qi = SIREN.indexOf('function quiet()');
  let due = null, setInbox = null;
  try {
    const code = 'var inbox=[];' + SIREN.slice(qi, qi + SIREN.slice(qi).indexOf('\n')) + '\n' +
      'function due()' + bodyAt(SIREN, di) + '; return {due:due, set:function(a){inbox=a;}};';
    const o = new Function(code)(); due = o.due; setInbox = o.set;
  } catch (e) { due = null; }
  ok('due() 를 오려 내 실행할 수 있다', typeof due === 'function');
  if (typeof due === 'function') {
    const past = Date.now() - 60000, fut = Date.now() + 3600000;
    const h = new Date(Date.now() + 9 * 3600000).getUTCHours(), night = h >= 22 || h < 8;
    setInbox([{ id: 1, status: 'pending', siren_at: past, req_type: night ? 'urgent' : 'purchase' }]);
    ok('사이렌 시각이 지난 내 건은 울린다(짝)', (due() || {}).id === 1);
    setInbox([{ id: 2, status: 'pending', siren_at: fut, req_type: 'urgent' }]);
    ok('아직 시각 전이면 안 울린다', due() === null);
    setInbox([{ id: 3, status: 'pending', siren_at: past, req_type: 'urgent', by_proxy: true }]);
    ok('대신 결재 건은 안 울린다', due() === null);
    setInbox([{ id: 4, status: 'pending', siren_at: past, req_type: 'urgent', same_decider: true }]);
    ok('앞 단계를 내가 찍은 건은 안 울린다', due() === null);
    setInbox([{ id: 5, status: 'approved', siren_at: past, req_type: 'urgent' }]);
    ok('끝난 건은 안 울린다', due() === null);
  }
}

console.log('\n④ 반려 줄이기 · 켜기 판단 · 매달 반복');
{
  const m = WORK.match(/var WHYS = \[([\s\S]*?)\];/);
  const whys = m ? [...m[1].matchAll(/en: '([^']+)', ko: '([^']+)'/g)].map(x => x[1] + '|' + x[2]) : [];
  const pol = P.REJECT_REASONS.map(r => r.en + '|' + r.ko);
  ok('전제: 화면 반려 버튼을 읽었다', whys.length >= 3);
  ok('반려 사유 목록이 화면 버튼과 같은 글자다', whys.length === pol.length && whys.every((w, i) => w === pol[i]));
  ok('반려가 없으면 체크리스트도 없다(지어내지 않음)', P.rejectTipsFrom([]).length === 0 && P.rejectTipsFrom([null, '그냥']).length === 0);
  const tips = P.rejectTipsFrom(['영수증 첨부 필요', 'Receipt needed / 영수증 첨부 필요', 'Check the amount', null]);
  ok('많이 나온 이유가 앞', tips[0].code === 'receipt' && tips[0].n === 2 && tips[1].code === 'amount');
  const t = P.shadowTally([{ signal: 'red', status: 'rejected' }, { signal: 'red', status: 'approved' },
    { signal: 'red', status: 'pending' }, { signal: 'green', status: 'rejected' }]);
  ok('shadowTally: 끝난 🔴 만 센다', t.red === 2 && t.agreed === 1 && t.disagreed === 1);
  const D = (y, mo) => Date.UTC(y, mo - 1, 10);
  const mr = P.monthlyRepeats([
    { title: 'Internet bill', amount: 1500, req_type: 'expense', created_at: D(2026, 9) },
    { title: 'internet bill ', amount: 1400, req_type: 'expense', created_at: D(2026, 8) },
    { title: 'Printer ink', amount: 900, req_type: 'purchase', created_at: D(2026, 9) },
    { title: 'Printer ink', amount: 900, req_type: 'purchase', created_at: D(2026, 9) + 86400000 },
  ]);
  ok('서로 다른 달 두 번 → 매달 반복(최근 금액)', mr.length === 1 && mr[0].title === 'Internet bill' && mr[0].amount === 1500 && mr[0].months === 2);
  ok('같은 달에 두 번은 반복이 아니다(짝)', !mr.some(x => x.title === 'Printer ink'));
  ok('화면이 매달 반복을 따로 말한다', /r\.monthly \? T\('🔁 Monthly: ', '🔁 매달 반복: '\)/.test(WORK));
  ok('화면이 체크리스트를 서버 값으로만 그린다', /D\.reject_tips/.test(WORK) && /if \(!arr\.length \|\| !PICK\)/.test(WORK));
  ok('home 응답에 reject_tips 를 싣는다', /reject_tips: rejectTips/.test(API));
  ok('주간 요약에 켜기 판단 줄이 있다', /shadowTally\(/.test(API) && /AI 자동 반려\(연습\) 14일/.test(API));
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
