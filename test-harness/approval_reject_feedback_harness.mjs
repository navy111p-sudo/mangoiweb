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
check('반려 칸 자리가 두 갈래 모두 열린 칸을 그린다',
  (WORK.match(/<div id="why-' \+ r\.id \+ '">' \+ whyBoxHtml\(r\.id\)/g) || []).length === 2);

/* ── C. 쓰는 동안 지켜 주기 ───────────────────────────────────────────── */
console.log('\n[C] 60초 자동 갱신이 쓰던 글을 안 날린다');
const load = cut(WORK, 'function load(fresh){');
check('쓰는 중(포커스가 피드백 칸)이면 다시 그리지 않는다',
  /activeElement[\s\S]{0,120}\/\^whyt-\/\.test[\s\S]{0,40}\)\) repaint\(\);/.test(load));
check('결정된 건은 반려 칸도 닫는다', /function removeLocal\(id\)\{\s*delete WHY_DRAFT\[id\];/.test(WORK));

/* ── D. 서버 — 결재권자에게도 피드백 ────────────────────────────────────── */
console.log('\n[D] 서버 — 대신 반려하면 결재권자에게도 알린다');
const dec = (() => {
  const a = API.indexOf("const mDecide = path.match(");
  const b = API.indexOf('const mDel = path.match(', a);
  return a >= 0 && b > a ? API.slice(a, b) : '';
})();
check('전제 — 결정 라우트를 오려 냈다', dec.length > 1000, 'len=' + dec.length);
check('반려 + «주» 결재자가 아님일 때만 결재권자를 더한다',
  /if \(decision === 'rejected' && !isPrimaryApprover\(actor, role, ph\)\) \{[\s\S]{0,200}approversFor\(env, String\(role\)/.test(dec));
check('누른 사람 자신에게는 안 보낸다', /u !== String\(actor\.username\)/.test(dec));
check('그 목록으로 결과를 알린다', /await notify\(env, resultTo,/.test(dec));
check('피드백은 «반려» 일 때만 알림 본문에', /decision === 'rejected' && memo \? ' — ' \+ memo\.slice\(0, 160\)/.test(dec));

console.log('\n결과: PASS ' + PASS + ' / FAIL ' + FAIL);
process.exit(FAIL ? 1 : 0);
