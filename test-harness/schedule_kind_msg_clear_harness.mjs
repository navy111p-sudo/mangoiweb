// 🧹 수업 예약 등록 — 종류를 바꾸면 «앞 등록의 결과 문구» 를 지우는가 (2026-09-23)
// 사장님 사진: One-off 로 바꿨는데 「반복 수업은 요일을 하나 이상…」 ❌ 가 그대로 남음.
// 소스에서 syncKind·say 를 오려 내 가짜 DOM 으로 «실제로 돌려» 봅니다.
// 짝: «등록 결과» 는 지운다 ↔ «강사 목록 폴백 안내» 는 남긴다 ↔ 종류 전환 자체는 그대로.
import { readFileSync } from 'node:fs';
const SRC = process.env.SRC || 'cloudflare-deploy/public/admin/student.html';
const s = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };

function bodyAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const b = src.indexOf('{', i + head.length - 1);
  let d = 0;
  for (let k = b; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const init = bodyAt(s, '(function initNewSchedule(){');
const syncSrc = bodyAt(init, 'function syncKind(){');
const saySrc = bodyAt(init, 'function say(html, color');
ok(!!syncSrc && !!saySrc, '전제: syncKind·say 를 소스에서 오려 냈다');

function el() {
  const a = {};
  return { style: {}, innerHTML: '', value: 'recurring',
    getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: k => { delete a[k]; } };
}
function run(fn) {
  const kindEl = el(), daysWrap = el(), dateWrap = el(), msgEl = el(), startWrap = el();
  let f;
  try { f = new Function('kindEl', 'daysWrap', 'dateWrap', 'msgEl', 'startWrap', saySrc + '\n' + syncSrc + '\nreturn { say, syncKind };')(kindEl, daysWrap, dateWrap, msgEl, startWrap); }
  catch (e) { return { err: e.message }; }
  try { fn(f, { kindEl, daysWrap, dateWrap, msgEl, startWrap }); } catch (e) { return { err: e.message }; }
  return { kindEl, daysWrap, dateWrap, msgEl, startWrap };
}

// ① 등록 결과(❌ 요일 없음) → 종류를 바꾸면 지워진다
let r = run((f, d) => { f.say('❌ 반복 수업은 요일을 하나 이상 선택해 주세요.', '#ef4444', 'submit'); d.kindEl.value = 'one_off'; f.syncKind(); });
ok(!r.err && r.msgEl.innerHTML === '', '등록 결과 문구는 종류를 바꾸면 지워진다' + (r.err ? ' (' + r.err + ')' : ''));
ok(!r.err && r.msgEl.getAttribute('data-src') === null, '지운 뒤 표식도 남지 않는다');
// ② 짝: 강사 목록 폴백 안내는 남는다
r = run((f, d) => { f.say('⚠️ 강사 목록을 못 받아 이름을 직접 입력합니다', '#fbbf24'); d.kindEl.value = 'one_off'; f.syncKind(); });
ok(!r.err && r.msgEl.innerHTML.includes('강사 목록을 못 받아'), '«등록 결과가 아닌» 안내는 종류를 바꿔도 남는다');
// ③ 표식 없는 say 가 앞 표식을 지운다(폴백 안내가 등록 결과로 오인되지 않게)
r = run((f, d) => { f.say('x', '#ef4444', 'submit'); f.say('⚠️ 강사 목록을 못 받아', '#fbbf24'); d.kindEl.value = 'one_off'; f.syncKind(); });
ok(!r.err && r.msgEl.innerHTML.includes('강사 목록을 못 받아'), '표식 없는 문구가 덮으면 앞 표식도 사라진다');
// ④ 종류 전환 자체는 그대로
r = run((f, d) => { d.kindEl.value = 'one_off'; f.syncKind(); });
ok(!r.err && r.daysWrap.style.display === 'none' && r.dateWrap.style.display === 'flex', 'One-off: 요일 숨김 · 날짜 보임(예전 그대로)');
r = run((f, d) => { d.kindEl.value = 'recurring'; f.syncKind(); });
ok(!r.err && r.daysWrap.style.display === 'flex' && r.dateWrap.style.display === 'none', 'Weekly: 요일 보임 · 날짜 숨김(예전 그대로)');
// 📅 (2026-09-24) 시작일 칸은 매주 반복에서만 보인다 — 짝으로 본다(한쪽만 보면 «늘 보이기» 도 통과).
ok(!r.err && r.startWrap.style.display === 'flex', 'Weekly: 시작일 칸이 보인다');
r = run((f, d) => { d.kindEl.value = 'one_off'; f.syncKind(); });
ok(!r.err && r.startWrap.style.display === 'none', 'One-off: 시작일 칸은 숨긴다(날짜 칸이 그 역할)');

// ⑤ 배선: submit 안의 say 는 전부 'submit' 표식을 단다
const sub = bodyAt(init, 'async function submit(force){');
const calls = (sub.match(/\bsay\(/g) || []).length;
const tagged = (sub.match(/'submit'\)/g) || []).length;
ok(calls > 0 && calls === tagged, `submit 안의 결과 문구 ${calls}곳이 전부 'submit' 표식을 단다 (${tagged}/${calls})`);
// ⑥ 폴백 안내는 표식을 달지 않는다
const fb = bodyAt(init, 'function nsFallbackToText(');
ok(!!fb && fb.includes('say(') && !/'submit'\)/.test(fb), '강사 목록 폴백 안내는 표식을 달지 않는다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
