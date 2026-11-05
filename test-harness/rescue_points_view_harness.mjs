import { fileURLToPath } from 'node:url';
// 🪙 망고 구조선(단어 게임) 결과 화면 «이번 판에 받은 포인트» (2026-11-02)
// 화면의 RV_PTS·rescuePtsView·paintRescuePts·awardRescuePoints 를 오려 내 가짜 fetch 로 실제로 돌립니다.
import fs from 'node:fs';
const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(root + 'cloudflare-deploy/public/student-game-rescue-voyage.html', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n); } };
const i = html.indexOf('    var RV_PTS='), j = html.indexOf('    function showPointToast(');
const block = i > 0 && j > i ? html.slice(i, j) : '';
ok('① 블록을 오려 냈다', block.includes('function awardRescuePoints'));
async function scenario({ uid = 'stu1', token = 'tok', resp, throws = false }) {
  const els = [{ innerHTML: '' }, { innerHTML: '' }];
  const toasts = []; let calls = 0;
  const MGV = { getUserId: () => uid };
  const ctx = {
    window: { MangoiGameVocab: MGV }, MangoiGameVocab: MGV,
    localStorage: { getItem: k => (k === 'mango_token' ? token : (k === 'mango_user_id' ? 'u_device' : null)) },
    document: { querySelectorAll: () => els },
    fetch: async () => { calls++; if (throws) throw new Error('net'); return { json: async () => resp }; },
    showPointToast: m => toasts.push(m),
  };
  let api;
  try {
    api = new Function(...Object.keys(ctx), block + '; return { award: awardRescuePoints, view: rescuePtsView, state: () => RV_PTS, reset: () => { RV_PTS={ got:0, pending:0, cap:\'\', fail:0, login:false }; } };')(...Object.values(ctx));
  } catch (e) { return { err: e.message, els, calls }; }
  try { api.award(); } catch (e) { return { err: e.message, els, calls }; }
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  return { api, els, calls, toasts, st: api.state() };
}
const ok1 = await scenario({ resp: { ok: true, rule: { amount: 5 } } });
ok('② 적립 5 → 결과칸에 +5P', /\+5P/.test(ok1.els[0].innerHTML) && ok1.els[0].innerHTML === ok1.els[1].innerHTML);
const two = ok1.api; two.award(); await new Promise(r => setTimeout(r, 5));
ok('② 두 번 → +10P 누적', /\+10P/.test(ok1.els[0].innerHTML));
const noamt = await scenario({ resp: { ok: true } });
ok('③ 금액 없으면 지어내지 않음(+5P 아님)', !/\+\d+P/.test(noamt.els[0].innerHTML) && /확인하지 못했/.test(noamt.els[0].innerHTML));
const cap = await scenario({ resp: { ok: false, error: 'game_daily_cap_reached', message_ko: '게임·퀴즈 포인트는 하루 30점까지예요.' } });
ok('④ 게임 상한 → 서버 문구', /하루 30점까지/.test(cap.els[0].innerHTML) && !/\+\d+P/.test(cap.els[0].innerHTML));
const cap2 = await scenario({ resp: { ok: false, error: 'daily_cap_reached', cap: 30 } });
ok('④ 규칙 상한(daily_cap_reached)도 상한으로', /🌙/.test(cap2.els[0].innerHTML));
const net = await scenario({ throws: true });
ok('⑤ 통신 실패 → 확인 못함', /확인하지 못했/.test(net.els[0].innerHTML));
const guest = await scenario({ uid: 'guest_abc', resp: { ok: true, rule: { amount: 5 } } });
ok('⑥ 게스트 → 서버 안 부름 + 로그인 안내', guest.calls === 0 && /로그인하면/.test(guest.els[0].innerHTML));
const nouid = await scenario({ uid: '', resp: { ok: true, rule: { amount: 5 } } });
ok('⑥ 계정 없으면 기기번호(mango_user_id)로 안 보냄', nouid.calls === 0);
const notok = await scenario({ token: '', resp: { ok: true, rule: { amount: 5 } } });
ok('⑥ 토큰 없으면 안 보냄', notok.calls === 0);
// 판마다 새로 — 옛 판 응답이 새 판에 안 더해짐
{
  let resolve; const els = [{ innerHTML: '' }];
  const M2 = { getUserId: () => 'stu1' }; const ctx = { window: { MangoiGameVocab: M2 }, MangoiGameVocab: M2, localStorage: { getItem: () => 'tok' }, document: { querySelectorAll: () => els },
    fetch: () => new Promise(r => { resolve = () => r({ json: async () => ({ ok: true, rule: { amount: 5 } }) }); }), showPointToast() {} };
  const api = new Function(...Object.keys(ctx), block + '; return { award: awardRescuePoints, reset: () => { RV_PTS={ got:0, pending:0, cap:\'\', fail:0, login:false }; paintRescuePts(); }, state: () => RV_PTS };')(...Object.values(ctx));
  api.award(); api.reset(); resolve(); await new Promise(r => setTimeout(r, 5));
  ok('⑦ 옛 판 응답은 새 판 «+0» 그대로', api.state().got === 0);
}
// 배선
ok('⑧ startGame 이 판마다 RV_PTS 를 비움', /G\.stageIdx=0;[^\n]*\n\s*RV_PTS=\{ got:0/.test(html));
for (const id of ['clearMsg', 'overMsg', 'winMsg']) ok('⑨ ' + id + ' 아래 결과칸', new RegExp('id="' + id + '"></p>\\s*<div class="rv-pts"').test(html));
const live = html.replace(/\/\*[\s\S]*?\*\//g, '');
ok('⑩ 결과 화면 셋에서 paintRescuePts 부름', (live.match(/paintRescuePts\(\);\s*\n\s*\$\('(clear|win|over)'\)\.classList\.add\('on'\)/g) || []).length === 4);
ok('⑪ mango_user_id 를 계정으로 안 씀', !/getUserId\(\)\)\|\|localStorage\.getItem\('mango_user_id'\)/.test(live));
console.log(`rescue_points_view_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
