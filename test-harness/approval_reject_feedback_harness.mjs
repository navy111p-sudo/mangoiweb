/*
 * 💬 결재 «반려 · 피드백» (2026-11-09 사장님 「여기도 답변이나 피드백 줄 칸」·「승인자에게 반려해서 피드백」)
 *
 *   [무엇이 바뀌었나]
 *     ① 접힌 「대신 결재」 카드(by_proxy)에도 「반려 · 피드백」 버튼 — 「승인」은 그대로 접힘.
 *     ② 반려 칸에 직접 쓰는 피드백 칸(textarea). 예전엔 prompt() 한 줄이었다.
 *        60초 자동 갱신이 다시 그려도 쓰던 글이 안 날아가게 WHY_DRAFT 에 담는다.
 *     ③ 서버 — «주» 결재자가 아닌 사람이 반려하면 그 단계의 결재권자에게도 알리고,
 *        반려 알림 본문에 피드백을 싣는다.
 *
 *   [짝으로 본다]
 *     「빈 피드백은 안 보낸다」만 보면 «아무것도 안 보내는» 코드도 통과한다.
 *     그래서 「쓴 피드백은 그대로 반려로 보낸다」를 함께 센다.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const WORK = readFileSync(process.env.WORK_SRC || join(ROOT, 'cloudflare-deploy/public/work.html'), 'utf8');
const API = readFileSync(process.env.API_SRC || join(ROOT, 'cloudflare-deploy/src/api-approval.ts'), 'utf8');

let PASS = 0, FAIL = 0;
function check(name, ok, detail) {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ ' + name + (detail ? (' — ' + detail) : '')); }
}

/* 시작 문자열부터 중괄호 «짝» 이 닫히는 곳까지 (줄 도중의 0 이 아니라 진짜 짝) */
function cut(src, start) {
  const i = src.indexOf(start);
  if (i < 0) return '';
  const o = src.indexOf('{', i);
  let d = 0;
  for (let j = o; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); }
  }
  return '';
}

/* ── A. 반려 칸을 실제로 돌린다 ───────────────────────────────────────── */
console.log('\n[A] 반려 칸 — 피드백 쓰기·보내기');
const parts = [
  cut(WORK, 'function esc(s){'),
  WORK.slice(WORK.indexOf('var WHYS = ['), WORK.indexOf('];', WORK.indexOf('var WHYS = [')) + 2),
  cut(WORK, 'function whyBoxHtml(id){'),
  cut(WORK, 'window.askWhy = function(id){') + ';',
  cut(WORK, 'window.whyInput = function(id, el){') + ';',
  cut(WORK, 'window.whyOther = function(id){') + ';',
];
check('전제 — 함수들을 오려 냈다', parts.every(p => p.length > 20), parts.map(p => p.length).join(','));

const hosts = {};
const calls = [], toasts = [];
const env = {
  document: { getElementById: (k) => hosts[k] || null },
  window: {},
  WHY_DRAFT: {},
  T: (en, ko) => ko, EN: () => false,
  toast: (m) => toasts.push(m),
  decide: (...a) => calls.push(a),
};
const run = new Function(...Object.keys(env), parts.join('\n') + '\nreturn { whyBoxHtml };');
const { whyBoxHtml } = run(...Object.values(env));
const W = env.window, D = env.WHY_DRAFT;
hosts['why-7'] = { innerHTML: '' };
hosts['whyt-7'] = { focus() { this.focused = true; } };

check('닫혀 있으면 아무것도 안 그린다', whyBoxHtml(7) === '');
W.askWhy(7);
const open = hosts['why-7'].innerHTML;
check('열면 피드백 칸(textarea)이 생긴다', /<textarea id="whyt-7"/.test(open), open.slice(0, 80));
check('사유 버튼은 그대로 한 번에 반려', /decide\(7,'rejected',/.test(open));
check('prompt() 를 안 쓴다', !/prompt\(/.test(parts.join('')));

W.whyInput(7, { value: '   ' });
W.whyOther(7);
check('빈 피드백은 안 보낸다', calls.length === 0);
check('짝 — 대신 «먼저 적어 달라» 고 말한다', toasts.length === 1 && hosts['whyt-7'].focused === true);

W.whyInput(7, { value: '  영수증 <원본> 다시 올려 주세요 ' });
check('다시 그려도 쓰던 글이 남는다 (이스케이프)',
  whyBoxHtml(7).includes('영수증 &lt;원본&gt; 다시 올려 주세요'));
W.whyOther(7);
check('짝 — 쓴 피드백을 그대로 반려로 보낸다',
  calls.length === 1 && calls[0][0] === 7 && calls[0][1] === 'rejected' &&
  calls[0][2] === '영수증 <원본> 다시 올려 주세요', JSON.stringify(calls));
W.whyInput(7, { value: 'x'.repeat(500) });
W.whyOther(7);
check('300자에서 자른다', calls[1] && calls[1][2].length === 300);

W.askWhy(7);
check('한 번 더 누르면 닫히고 쓰던 글도 버린다', hosts['why-7'].innerHTML === '' && D[7] == null);

/* ── B. 카드 배선 ─────────────────────────────────────────────────────── */
console.log('\n[B] 카드 — 접힌 「대신 결재」 에도 반려·피드백');
const fold = (() => {
  const a = WORK.indexOf('if (decidable && r.by_proxy && !PROXY_OPEN[r.id])');
  const b = WORK.indexOf('} else if (decidable) {', a);
  return a >= 0 && b > a ? WORK.slice(a, b) : '';
})();
check('전제 — 접힌 카드 갈래를 오려 냈다', fold.length > 200, 'len=' + fold.length);
check('접힌 카드에 「반려 · 피드백」 버튼이 있다', /onclick="askWhy\(' \+ r\.id/.test(fold));
check('짝 — 접힌 카드에 «승인» 은 여전히 없다', !/'approved'/.test(fold));
/* ⛔ 개수로 못 박지 않는다 — «빈 자리로 그리는 곳이 남았나» 와 «열린 칸을 그리는 곳이 있나» 를 짝으로. */
check('반려 칸 자리를 빈 채로 그리는 곳이 없다', !/<div id="why-' \+ r\.id \+ '"><\/div>/.test(WORK));
check('짝 — 반려 칸 자리가 열린 칸(whyBoxHtml)을 그린다', /<div id="why-' \+ r\.id \+ '">' \+ whyBoxHtml\(r\.id\)/.test(WORK));
check('매일보고 화면은 펼침·쓰던 반려 칸이 있으면 카드를 연 채로 그린다',
  /<details class="handover-request"' \+ \(PROXY_OPEN\[r\.id\] \|\| WHY_DRAFT\[r\.id\] != null \? ' open' : ''\)/.test(WORK));

/* ── C. 쓰는 동안 지켜 주기 ───────────────────────────────────────────── */
console.log('\n[C] 60초 자동 갱신이 쓰던 글을 안 날린다');
const load = cut(WORK, 'function load(fresh){');
const GUARD = "if (!(ae && /^whyt-/.test(ae.id || ''))) repaint();";
check('전제 — load() 를 오려 냈다', load.length > 500, 'len=' + load.length);
/* 성공 경로(D = j … noteArrival) 의 다시 그리기만 본다 — catch 의 repaint 는 `if (!D)`(첫 화면)라 쓰는 중엔 안 닿는다. */
const okPath = (() => { const a = load.indexOf('D = j; offline(false);'), b = load.indexOf('noteArrival(j)', a);
  return a >= 0 && b > a ? load.slice(a, b) : ''; })();
check('load() 성공 경로의 다시 그리기는 전부 «쓰는 중이면 미룸» 가드를 지난다',
  okPath.includes(GUARD) && okPath.split('repaint()').length - 1 === 1, 'len=' + okPath.length);
// 가드 식 자체를 실제로 돌린다 — 쓰는 중이면 안 그리고(짝) 아니면 그린다
const guardRun = (id) => { let n = 0; new Function('ae', 'repaint', GUARD)(id == null ? null : { id }, () => n++); return n; };
check('피드백 칸에 포커스면 다시 그리지 않는다', guardRun('whyt-55') === 0);
check('짝 — 다른 곳·포커스 없음이면 다시 그린다', guardRun('kw') === 1 && guardRun(null) === 1);
check('결정된 건은 반려 칸도 닫는다', /function removeLocal\(id\)\{\s*delete WHY_DRAFT\[id\];/.test(WORK));

/* ── D. 서버 — 결재권자에게도 피드백 (그 블록을 오려 내 실제로 돌린다) ──── */
console.log('\n[D] 서버 — 대신 반려하면 결재권자에게도 알린다');
const blk = (() => {
  const a = API.indexOf('const resultTo = [String(cur.requester_username)];');
  const b = API.indexOf("id, 'approval-result');", a);
  return a >= 0 && b > a ? API.slice(a, b + "id, 'approval-result');".length) : '';
})();
check('전제 — 결과 알림 블록을 오려 냈다', blk.length > 200, 'len=' + blk.length);
const AF = new Function('return async function(){}').call().constructor;
async function notifyRun({ decision, primary, memo = null, pool = ['mgr_jjw', 'admin'] }) {
  const sent = [], afArgs = [];
  await new AF('cur', 'decision', 'memo', 'actor', 'role', 'ph', 'env', 'id', 'isPrimaryApprover', 'approversFor', 'notify', blk)(
    { requester_username: 'mgr_karl', title: 'Projector' }, decision, memo, { username: 'admin' }, 'mgr', false, {}, 55,
    () => primary,
    async (...a) => { afArgs.push(a); return pool.slice(); },
    async (env, to, title, body) => { sent.push({ to, title, body }); });
  return { sent: sent[0], afArgs };
}
const r1 = await notifyRun({ decision: 'rejected', primary: false, memo: '영수증 원본\n[EN] Original receipt please' });
check('대신 반려 → 기안자 + 결재권자에게 (누른 본인은 빼고)',
  r1.sent && JSON.stringify(r1.sent.to) === JSON.stringify(['mgr_karl', 'mgr_jjw']), JSON.stringify(r1.sent));
check('결재권자 목록은 넓히지 않고(widen=false) 기안자를 뺀 채 묻는다',
  r1.afArgs.length === 1 && r1.afArgs[0][1] === 'mgr' && r1.afArgs[0][2] === 'mgr_karl' && r1.afArgs[0][3] === false,
  JSON.stringify(r1.afArgs));
check('반려 알림 본문에 피드백 — 영어 번역이 앞', r1.sent && r1.sent.title === 'Rejected' &&
  r1.sent.body === 'Projector — Original receipt please / 영수증 원본', r1.sent && r1.sent.body);
const r2 = await notifyRun({ decision: 'rejected', primary: true, memo: 'x' });
check('짝 — 주 결재자 본인이 반려하면 기안자에게만', r2.sent && JSON.stringify(r2.sent.to) === '["mgr_karl"]' && !r2.afArgs.length);
const r3 = await notifyRun({ decision: 'approved', primary: false, memo: '메모' });
check('짝 — 승인은 기안자에게만, 본문에 메모 없음',
  r3.sent && JSON.stringify(r3.sent.to) === '["mgr_karl"]' && r3.sent.body === 'Projector' && r3.sent.title === 'Approved');
const r4 = await notifyRun({ decision: 'rejected', primary: false, pool: ['mgr_karl', 'mgr_jjw', 'mgr_jjw'] });
check('같은 사람에게 두 번 안 보낸다', r4.sent && JSON.stringify(r4.sent.to) === '["mgr_karl","mgr_jjw"]', JSON.stringify(r4.sent));
const fnAF = cut(API, 'async function approversFor(');
check('approversFor 는 widen=false 면 폴백(누를 수 있는 사람 전원)으로 안 넓힌다',
  /if \(out\.length \|\| !widen\) return out;/.test(fnAF) && /widen = true\)/.test(fnAF));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
