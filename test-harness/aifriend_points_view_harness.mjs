import { fileURLToPath } from 'node:url';
// 🪙 AI 친구 «오늘 받은 포인트» 칸 — 서버가 실제로 적립한 값만 그리는가 (2026-11-02)
// 화면 함수 aiFriendPtsView 를 오려 내 실제로 돌리고, 서버 earned_today 계산·배선을 확인합니다.
import fs from 'node:fs';
const root = fileURLToPath(new URL('..', import.meta.url));
const html = fs.readFileSync(process.env.AIF_SRC || (root + 'cloudflare-deploy/public/ai-friend.html'), 'utf8');
const ts = fs.readFileSync(root + 'cloudflare-deploy/src/api-ai.ts', 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('❌ FAIL', n); } };
function bodyAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const b = src.indexOf('{', i + head.length - 1); let d = 0;
  for (let j = b; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) return src.slice(i, j + 1); } }
  return '';
}
const fnSrc = bodyAt(html, 'function aiFriendPtsView(');
ok('① 화면 함수를 오려 냈다', fnSrc.length > 50);
let view = null;
try { view = new Function(fnSrc + '; return aiFriendPtsView;')(); } catch (e) { console.log(e.message); }
const run = (g, en) => { try { return view(g, en); } catch (e) { return { text: 'ERR:' + e.message, title: '' }; } };
ok('② 실제 적립 12 → +12P', run({ earnedToday: 12 }, false).text === '+12P');
ok('② 0 도 숫자로(지어내지 않음) → +0P', run({ earnedToday: 0 }, false).text === '+0P');
ok('③ 모르면 «—» (null)', run({ earnedToday: null }, false).text === '—');
ok('③ 모르면 «—» (NaN)', run({ earnedToday: 'x' }, false).text === '—');
ok('③ g 없음 → «—»', run(null, false).text === '—');
ok('④ 게스트 → 로그인하면 적립', run({ guest: true, earnedToday: 0 }, false).text === '로그인하면 적립');
ok('④ 게스트 영어', run({ guest: true }, true).text === 'Log in to earn');
ok('⑤ 하루 10번 다 받음 사유', /10/.test(run({ earnedToday: 20, chatCapped: 'daily' }, false).title));
ok('⑤ 전체 한도 사유', /한도/.test(run({ earnedToday: 20, chatCapped: 'total' }, false).title));
ok('⑤ 짝: 한도 아니면 사유 없음', !/한도|10번/.test(run({ earnedToday: 4, chatCapped: null }, false).title));
ok('⑥ 영어 사유', /limit/.test(run({ earnedToday: 1, chatCapped: 'total' }, true).title));
// 배선
const live = html.replace(/\/\*[\s\S]*?\*\//g, '');
ok('⑦ updateHUD 가 aiFriendPtsView 로 칸을 그림', /aiFriendPtsView\(g, isEn\(\)\)/.test(bodyAt(live, 'function updateHUD(')));
ok('⑦ 추정치(오늘 수 × 2)가 사라짐', !/Math\.min\(gamState\.today, 10\) \* 2/.test(live) && !/sessionPts/.test(live));
const ag = bodyAt(live, 'function applyGam(');
ok('⑧ applyGam 이 서버 earned_today 를 받음', /gamState\.earnedToday\s*=\s*\(g\.earned_today == null\)/.test(ag));
ok('⑧ applyGam 이 chat_capped 를 받음', /gamState\.chatCapped\s*=\s*g\.chat_capped/.test(ag));
// 서버
const snap = bodyAt(ts, 'const aiFriendGamSnapshot = async (uid: string) =>');
ok('⑨ 스냅샷이 point_rule_log 의 ai_friend_* 합을 셈', /SUM\(amount\)[\s\S]*point_rule_log[\s\S]*ai_friend_chat/.test(snap) && /earned_today: earnedToday/.test(snap));
ok('⑨ 조회 실패는 null(모름)', /let earnedToday: number \| null = guest \? 0 : null/.test(snap));
ok('⑩ 실제 적립을 더하고 재시도를 상한으로 오인하지 않음', /afterChatUsed>=10\?'daily':\(!afterAllowance\.ok\?'total':null\)/.test(ts) && /gam\.earned_today = Number\(gam\.earned_today\) \+ gam\.awarded/.test(ts));
// ⑪ (2026-11-03) 축하 배너가 뜨는 턴에도 «이번에 받은 포인트» 를 함께 — applyGam 을 오려 내 실제로 돌림
{
  const ag2 = bodyAt(html, 'function applyGam(');
  const mk = () => { try { return new Function('st', `
    var gamState = { today: st.today0, lifetime: st.life0, streak: 0, word: { w: 'brave' } };
    function calcLevel(n){ return { n: n >= 100 ? 2 : 1, name: 'L', nameEn: 'L' }; }
    function updateHUD(){} function isEn(){ return st.en; }
    function celebrate(big, title, sub){ st.cel.push({ title: title, sub: sub }); }
    function ptToast(t){ st.toast.push(t); }
    ${ag2}
    return applyGam;`); } catch (e) { return null; } };
  const go = (g, o = {}) => {
    const st = { today0: o.today0 ?? 0, life0: o.life0 ?? 0, en: !!o.en, cel: [], toast: [] };
    const f = mk(); if (!f) return { st, err: 'build' };
    try { f(st)(g); } catch (e) { return { st, err: e.message }; }
    return { st };
  };
  let r = go({ today: 1, lifetime: 120, awarded: 2 }, { life0: 98 });
  ok('⑪ 레벨업 턴: 축하에 +2P', r.st.cel.length === 1 && /\+2P/.test(r.st.cel[0].sub) && !r.err);
  r = go({ today: 1, lifetime: 10, awarded: 2, word_bonus: 5, voice_bonus: 1 }, { life0: 8 });
  ok('⑪ 오늘의 단어 턴: 실제 합계 +8P(하드코딩 +5P 아님)', r.st.cel.length === 1 && /\+8P/.test(r.st.cel[0].sub) && !/\+5P/.test(r.st.cel[0].title + r.st.cel[0].sub));
  r = go({ today: 5, lifetime: 10, awarded: 2 }, { today0: 4, life0: 8 });
  ok('⑪ 퀘스트 달성 턴: 축하에 +2P', r.st.cel.length === 1 && /\+2P/.test(r.st.cel[0].sub));
  r = go({ today: 5, lifetime: 10, awarded: 0, chat_capped: 'daily' }, { today0: 4, life0: 8 });
  ok('⑪ 짝: 0P 턴의 축하에는 +0P 를 붙이지 않음', r.st.cel.length === 1 && !/\+\d+P/.test(r.st.cel[0].sub));
  r = go({ today: 2, lifetime: 10, awarded: 2 }, { today0: 1, life0: 8 });
  ok('⑪ 짝: 축하 없는 턴은 예전처럼 알림 +2P', r.st.cel.length === 0 && r.st.toast[0] === '+2P ⭐');
  r = go({ today: 1, lifetime: 120, awarded: 2 }, { life0: 98, en: true });
  ok('⑪ 영어 축하에도 +2P', /\+2P/.test(r.st.cel[0] && r.st.cel[0].sub));
}
console.log(`aifriend_points_view_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
