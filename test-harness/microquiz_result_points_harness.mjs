// 🪙 AI 단어 퀴즈 결과 화면 «받은 포인트» (2026-11-03)
//   micro-quiz.html 에서 mqEarnView·mqPaintEarn·awardPoints 를 «중괄호 짝» 으로 오려 내 실제로 돌립니다.
//   MQ_SRC=<변형 사본> 으로 변이시험.
import { readFileSync } from 'node:fs';
const SRC = process.env.MQ_SRC || 'cloudflare-deploy/public/micro-quiz.html';
const html = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('❌ FAIL', m); } };
function cut(sig) {
  const i = html.indexOf(sig); if (i < 0) return '';
  let j = html.indexOf('{', i), d = 0;
  for (let k = j; k < html.length; k++) { const c = html[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return html.slice(i, k + 1); } }
  return '';
}
const fView = cut('function mqEarnView('), fPaint = cut('function mqPaintEarn('), fAward = cut('async function awardPoints(');
ok(fView && fPaint && fAward, '세 함수를 오려 냈다');
let lang = 'ko';
const BODY = `${fView}\n${fPaint}
  var slot = { innerHTML: '' };
  var document = { getElementById: function(){ return slot; } };
  function getUid(){ return state.uid; } function getName(){ return ''; } function __mgTok(){ return 't'; }
  function sfx(){ state.sfx++; } function confetti(){}
  var serverQuizzesRaw = [{ id: 7 }], retryCount = 0;
  async function fetch(u, o){ state.calls.push(u); var r = state.route(u, o); if (r instanceof Error) throw r; return { ok: true, json: async function(){ if (r === 'BAD') throw new Error('x'); return r; } }; }
  ${fAward}
  return { view: mqEarnView, award: awardPoints, slot: slot };`;
function world(route, uid = 'stu1') {
  const state = { uid, route, calls: [], sfx: 0 };
  let w = null;
  try { w = new Function('tt', 'state', BODY)((k, e) => lang === 'en' ? e : k, state); } catch (e) { w = null; }
  return { w, state };
}
const text = h => String(h).replace(/<[^>]+>/g, '');

// ① 순수 판정
{
  const { w } = world(() => ({}));
  ok(!!w, '실행 준비');
  if (w) {
    const v = w.view;
    const full = v({ ok: true, awarded: 80, balance: 1200 }, 80);
    ok(full.cls === 'earn' && /\+80P/.test(full.html) && /1,200P/.test(full.html) && !full.note, '다 받으면 +80P · 잔액 · 안내 없음');
    const part = v({ ok: true, awarded: 30, balance: 500 }, 80);
    ok(part.cls === 'earn' && /\+30P/.test(part.html) && /30P만/.test(part.note) && /80P/.test(part.note), '일부만 → +30P + 한도 안내(맞힌 점수 80P)');
    const zero = v({ ok: true, awarded: 0, daily_cap: true }, 80);
    ok(zero.cls === 'hint' && /다 받았어요/.test(zero.html) && !/\+0P/.test(zero.html), '0P → 한도 안내(+0P 를 «받은 것» 처럼 안 그림)');
    ok(/이미 받았어요/.test(v({ ok: true, awarded: 0, duplicate: true }, 80).html), '중복 → 이미 받았어요');
    ok(/확인하지 못했어요/.test(v(null, 80).html), '응답 없음 → 확인 못 함');
    ok(/확인하지 못했어요/.test(v({ ok: false, error: 'x', awarded: 40 }, 80).html), 'ok:false 면 awarded 칸이 있어도 확인 못 함');
    ok(/확인하지 못했어요/.test(v({ error: 'Not Found' }, 80).html), 'ok 칸 없는 404 → 확인 못 함');
    ok(/확인하지 못했어요/.test(v({ ok: true }, 80).html), 'awarded 칸이 없으면 지어내지 않음');
    ok(/로그인/.test(v({ ok: false, error: 'auth_required' }, 80).html), '토큰 만료 → 다시 로그인 안내');
    ok(!/잔액|내 포인트/.test(v({ ok: true, awarded: 20 }, 20).html), '잔액 칸이 없으면 잔액을 안 그림');
    lang = 'en';
    ok(/\+30P/.test(v({ ok: true, awarded: 30 }, 80).html) && /only 30P/.test(v({ ok: true, awarded: 30 }, 80).note), 'EN 문구');
    lang = 'ko';
  }
}

// ② 배선 — awardPoints 가 실제로 그 판정으로 그리는가
const run = async (route, correct, uid) => { const { w, state } = world(route, uid); if (!w) return { slot: '', state }; try { await w.award(correct); } catch (e) { return { slot: 'THREW ' + e.message, state }; } return { slot: text(w.slot.innerHTML), state }; };
const R = (sess, stats) => u => /reward/.test(u) ? sess : (stats || { ok: true, today_reviewed: 0 });
(async () => {
  let r = await run(R({ ok: true, awarded: 40, balance: 300 }), 4);
  ok(/\+40P/.test(r.slot) && /300P/.test(r.slot), '결과: +40P · 잔액 300P');
  ok(r.state.sfx === 1, '받았을 때만 효과음');
  r = await run(R({ ok: true, awarded: 10, balance: 300 }), 4);
  ok(/\+10P/.test(r.slot) && /10P만/.test(r.slot) && /40P/.test(r.slot), '맞힌 4개(40P) 중 10P 만 → 한도 안내');
  r = await run(R({ ok: true, awarded: 200 }), 25);
  ok(!/만 들어갔어요/.test(r.slot), '정답 25개도 서버 상한(20개=200P)과 같게 계산 → 거짓 «덜 들어감» 없음');
  r = await run(R({ ok: true, awarded: 0, duplicate: true }), 4);
  ok(/이미 받았어요/.test(r.slot), '결과: 중복');
  r = await run(() => new Error('net'), 4);
  ok(/확인하지 못했어요/.test(r.slot), '결과: 통신 실패 → 확인 못 함(예전엔 빈칸)');
  r = await run(R('BAD'), 4);
  ok(/확인하지 못했어요/.test(r.slot), '결과: JSON 아님 → 확인 못 함');
  r = await run(R({ ok: true, awarded: 0, daily_cap: true }), 4);
  ok(/다 받았어요/.test(r.slot), '결과: 한도');
  r = await run(R({ ok: true, awarded: 40 }), 4, 'guest_ab');
  ok(/로그인하면/.test(r.slot) && r.state.calls.length === 0, '게스트 → 요청 없이 로그인 안내');
  r = await run(R({ ok: true, awarded: 40 }), 0);
  ok(r.slot === '' && r.state.calls.length === 0, '0개 맞힘 → 아무것도 안 함(예전 그대로)');
  r = await run(u => /reward/.test(u) && !/stats/.test(u) ? (r.__m = (r.__m || 0) + 1, r.__m === 1 ? { ok: true, awarded: 40 } : { ok: true, awarded: 35 }) : { ok: true, today_reviewed: 12, mission_done: false }, 4);
  ok(/보너스 \+35P/.test(r.slot), '미션 보너스는 서버가 준 금액 그대로(+35P)');

  // ③ 발음 보너스도 서버 금액 그대로
  ok(/💰 \+'\+Number\(d\.awarded\)\+'P/.test(html) && !/💰 \+20P<\/span>/.test(html), '발음 보너스 +20P 하드코딩 제거');

  console.log(`microquiz_result_points_harness — PASS ${pass} / FAIL ${fail}`);
  if (fail) process.exit(1);
})();
