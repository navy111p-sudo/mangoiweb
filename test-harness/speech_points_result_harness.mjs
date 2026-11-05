import { fileURLToPath } from 'node:url';
// 🪙 발음 코칭 세트 완주 «받은 포인트» 상자 (2026-11-02) — 두 페이지의 awardSpeechPoints 를 가짜 fetch·DOM 으로 실제 실행
import fs from 'node:fs';
const root = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.log('❌ FAIL', n); } };
function cut(h, a, b) { const i = h.indexOf(a), j = h.indexOf(b, i + 1); return i >= 0 && j > i ? h.slice(i, j) : ''; }
for (const [page, anchor] of [['speech-coach.html', 'rec-status'], ['speech-coach-cn.html', 'progress']]) {
  const h = fs.readFileSync(root + 'cloudflare-deploy/public/' + page, 'utf8');
  const blk = cut(h, 'function mgAcctUid(){', 'function shortLabel(') || cut(h, 'function mgAcctUid(){', '/* 완주 사운드');
  ok(page + ' ① 블록을 오려 냄', blk.includes('function awardSpeechPoints') && blk.includes('function speechPtsView'));
  async function scen({ logged = true, resp, throws = false }) {
    const store = { mango_token: 'tok' }; if (logged) store.mangoi_logged_user = JSON.stringify({ uid: 'stu1', name: '김' });
    const nodes = {}; let box = null, calls = 0;
    const anchorEl = { textContent: '', parentNode: { insertBefore: (n) => { box = n; nodes['sc-ptsbox'] = n; } }, nextSibling: null };
    nodes[anchor] = anchorEl;
    const document = { getElementById: id => nodes[id] || null, createElement: () => ({ style: {}, setAttribute() {}, innerHTML: '' }) };
    const localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } };
    const fetch = async () => { calls++; if (throws) throw new Error('net'); return { json: async () => resp }; };
    let api; try { api = new Function('document', 'localStorage', 'fetch', 'window', blk + '; return awardSpeechPoints;')(document, localStorage, fetch, {}); } catch (e) { return { err: e.message }; }
    try { api('en:voice-coach', '🏅 영어 발음 마스터'); } catch (e) { return { err: e.message }; }
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    return { html: box ? box.innerHTML : '', status: anchorEl.textContent, calls };
  }
  const g = await scen({ resp: { ok: true, rule: { amount: 20 } } });
  ok(page + ' ② 적립 → 상자 +20P', /\+20P/.test(g.html) && /영어 발음 마스터/.test(g.html) && /\+20P 적립/.test(g.status));
  const n = await scen({ resp: { ok: true } });
  ok(page + ' ③ 금액 없음 → 지어내지 않음(+20P 아님)', !/\+\d+P/.test(n.html) && /확인하지 못했/.test(n.html) && !/P 적립/.test(n.status));
  const c = await scen({ resp: { ok: false, error: 'daily_cap_reached', cap: 5 } });
  ok(page + ' ④ 규칙 하루 5번 → 이유', /하루 5번까지/.test(c.html));
  const c2 = await scen({ resp: { ok: false, error: 'game_daily_cap_reached', message_ko: '게임·퀴즈 포인트는 하루 30점까지예요.' } });
  ok(page + ' ④ 게임 30점 → 서버 문구', /하루 30점까지/.test(c2.html));
  const f = await scen({ throws: true });
  ok(page + ' ⑤ 통신 실패 → 확인 못함', /확인하지 못했/.test(f.html));
  const l = await scen({ logged: false, resp: { ok: true, rule: { amount: 20 } } });
  ok(page + ' ⑥ 비로그인 → 서버 안 부름 + 로그인 안내', l.calls === 0 && /로그인하면/.test(l.html));
  const view = new Function(blk + '; return speechPtsView;')();
  ok(page + ' ⑦ 배지 이름 이스케이프', !/<img/.test(view('got', { ok: true, rule: { amount: 20 } }, '<img src=x>', false)));
  ok(page + ' ⑧ 상자에 닫기 버튼', /aria-label="닫기"/.test(blk));
}
{
  const h = fs.readFileSync(root + 'cloudflare-deploy/public/speech-coach.html', 'utf8');
  const v = new Function(cut(h, 'function mgAcctUid(){', 'function shortLabel(') + '; return speechPtsView;')();
  ok('⑨ 영어 문구', /Mango points/.test(v('got', { ok: true, rule: { amount: 20 } }, 'X', true)) && /Log in/.test(v('login', null, 'X', true)));
}
console.log(`speech_points_result_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
