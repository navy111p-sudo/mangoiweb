// ✏️ AI 영작 «따라 쓰기 +5P» — 결과를 그 자리에 글자로 남기는가(2026-11-02).
// 진짜 rewritePtsView·checkRewrite 를 ai-write.html 에서 오려 내 가짜 DOM·fetch 로 실제로 돌린다.
import fs from 'node:fs';
const SRC = process.env.AW_SRC || new URL('../cloudflare-deploy/public/ai-write.html', import.meta.url);
const html = fs.readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
function body(start) { // start 부터 중괄호 짝
  const i = html.indexOf(start); if (i < 0) return '';
  let j = html.indexOf('{', i), d = 0;
  for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; else if (html[k] === '}') { d--; if (d === 0) return html.slice(i, k + 1); } }
  return '';
}
const fView = body('function rewritePtsView(');
const fCheck = body('window.checkRewrite = async function(){');
const fEsc = body('function escapeHtml(');
ok('전제: 함수를 오려 냈다', fView.length > 50 && fCheck.length > 50 && fEsc.length > 10);

function run(scn) {
  const els = {
    rewriteInput: { value: 'I like dogs.', disabled: false },
    rewriteResult: { innerHTML: '', insertAdjacentHTML(_, h) { this.innerHTML += h; } },
    rewriteCheckBtn: { disabled: false },
  };
  let fetched = 0, toasts = [];
  const win = {};
  const ctx = {
    window: win, document: { getElementById: id => els[id] || null },
    getUid: () => scn.uid, getToken: () => scn.token,
    flowMark() {}, fireConfetti() {}, showToast: t => toasts.push(t),
    awTr: (ko, en) => (scn.en ? en : ko),
    fetch: async () => { fetched++; if (scn.throws) throw new Error('net'); return { json: async () => { if (scn.badJson) throw new Error('x'); return scn.res; } }; },
  };
  const code = `${fEsc}\n${fView}\nlet _lastCorrected='I like dogs.';const _norm=s=>String(s||'').toLowerCase().trim();\n${fCheck}\nreturn window.checkRewrite;`;
  let fn;
  try { fn = new Function(...Object.keys(ctx), code)(...Object.values(ctx)); } catch (e) { return Promise.resolve({ err: e.message }); }
  return Promise.resolve().then(() => fn()).then(() => ({ out: els.rewriteResult.innerHTML, fetched, toasts }), e => ({ err: e.message }));
}
const L = { uid: 'stu1', token: 't' };
const got = await run({ ...L, res: { ok: true, newBalance: 120, rule: { amount: 5 } } });
ok('받으면 +5P 와 잔액이 그 자리에 남는다', !got.err && /따라 쓰기 포인트 \+5P \(잔액 120P\)/.test(got.out) && /class="aw-points got"/.test(got.out));
ok('토스트도 그대로 뜬다', got.toasts && got.toasts.length === 1);
const cap = await run({ ...L, res: { ok: false, error: 'daily_cap_reached', cap: 5 } });
ok('하루 5번 한도면 이유를 말한다', /하루 5번까지/.test(cap.out) && !/\+5P/.test(cap.out) && cap.toasts.length === 0);
const tot = await run({ ...L, res: { ok: false, error: 'daily_total_cap_reached', cap: 100, message_ko: '오늘 받을 수 있는 포인트(100점)를 다 채웠어요. 내일 또 만나요!' } });
ok('전체 상한이면 서버 문구를 그대로', /100점\)를 다 채웠어요/.test(tot.out));
const net = await run({ ...L, throws: true });
ok('통신 실패면 «확인 못 함»(0P 를 지어내지 않음)', /확인하지 못했어요/.test(net.out) && /unknown/.test(net.out));
const bad = await run({ ...L, badJson: true });
ok('응답이 JSON 이 아니면 «확인 못 함»', /확인하지 못했어요/.test(bad.out));
const odd = await run({ ...L, res: { ok: false, error: 'cooldown' } });
ok('모르는 거절은 «확인 못 함»', /확인하지 못했어요/.test(odd.out));
const g = await run({ uid: 'guest_abc', token: 't', res: { ok: true, rule: { amount: 5 } } });
ok('게스트는 서버를 안 부르고 로그인 안내', g.fetched === 0 && /로그인하면/.test(g.out));
const nt = await run({ uid: 'stu1', token: '', res: { ok: true, rule: { amount: 5 } } });
ok('토큰 없으면 로그인 안내', nt.fetched === 0 && /로그인하면/.test(nt.out));
const en = await run({ ...L, en: true, res: { ok: true, newBalance: 9, rule: { amount: 5 } } });
ok('영어 화면은 영어로', /Copy points \+5P \(balance 9P\)/.test(en.out) && /data-ko="/.test(en.out));
const xss = await run({ ...L, res: { ok: false, error: 'game_daily_cap_reached', message_ko: '<img src=x>' } });
ok('서버 문구는 이스케이프', !/<img/.test(xss.out) && /&lt;img/.test(xss.out));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
