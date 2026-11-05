import { fileURLToPath } from 'node:url';
// 📚 동화책 — 다시 열어도 «오늘 이 이야기로 받은 포인트» 가 보이는가(2026-11-03).
// 184개 이야기 화면에서 STORY-REOPEN 블록을 오려 내 가짜 localStorage 로 실제로 돌린다.
import fs from 'node:fs';
import path from 'node:path';
const DIR = fileURLToPath(new URL('../cloudflare-deploy/public/', import.meta.url));
const ONE = process.env.STORY_SRC || path.join(DIR, 'story-s1-07.html');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };
function cut(src, start, endMark) { const i = src.indexOf(start); if (i < 0) return ''; const j = src.indexOf(endMark, i); return j < 0 ? '' : src.slice(i, j); }
function fnBody(src, start) { const i = src.indexOf(start); if (i < 0) return ''; let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return ''; }

// ── ① 184개 화면이 같은 블록을 갖는가(손으로 한 화면만 고치는 사고 방지)
const files = fs.readdirSync(DIR).filter(f => /^story-.*\.html$/.test(f) && f !== 'story-cover-gallery.html');
const blocks = new Set(); let wired = 0, reopen = 0, resetClr = 0;
for (const f of files) {
  const s = fs.readFileSync(path.join(DIR, f), 'utf8');
  blocks.add(cut(s, '  function viewKey(){', '  var board ='));
  if (/localStorage\.setItem\(paidKey\(\), '1'\); \} catch\(e\)\{\} saveView\(v\); \}/.test(s)) wired++;
  if (/allDone\(st\) && fin\) \{ window\.__storyLastEarn = \{ kind: 'again', saved: savedView\(\) \}; finishMsg\(window\.__storyLastEarn\); \}/.test(s)) reopen++;
  if (/function reset\(\)\{ st = \{\}; save\(\); paint\(\); window\.__storyLastEarn = null;/.test(s)) resetClr++;
}
ok('전제: 이야기 화면이 180개 넘게 있다 (' + files.length + ')', files.length >= 180);
ok('모든 화면이 같은 블록 (' + blocks.size + '종)', blocks.size === 1 && [...blocks][0].length > 300);
ok('모든 화면이 받은 결과를 저장한다 (' + wired + ')', wired === files.length);
ok('모든 화면이 다시 열 때 보여 준다 (' + reopen + ')', reopen === files.length);
ok('«처음부터 다시» 가 남은 표시를 지운다 (' + resetClr + ')', resetClr === files.length);

// ── ② 실제 실행
const src = fs.readFileSync(ONE, 'utf8');
const block = cut(src, '  function paidKey(){', '  var board =');
const fin = fnBody(src, '  function finishMsg(view){');
ok('전제: 블록·finishMsg 를 오려 냈다', block.length > 300 && fin.length > 300);
function world(o = {}) {
  const store = Object.assign({}, o.store || {});
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { if (o.throws) throw new Error('q'); store[k] = String(v); } };
  const finEl = { innerHTML: '' };
  const doc = { documentElement: { lang: o.en ? 'en' : 'ko' }, getElementById: () => null };
  const ctx = { localStorage: ls, document: doc, STORY_ID: 's1-07', STORY_POINTS: 10, StoryCore: { kstDay: () => o.day || '2026-11-03' }, fin: finEl, window: {} };
  const code = `function en(){ return document.documentElement.lang === 'en'; } function t(ko,e){ return en()?e:ko; }\n${block}\n${fin}\nreturn { saveView, savedView, againHtml, finishMsg, viewKey };`;
  let api; try { api = new Function(...Object.keys(ctx), code)(...Object.values(ctx)); } catch (e) { return { err: e.message }; }
  return { api, store, finEl };
}
const show = w => { try { w.api.finishMsg({ kind: 'again', saved: w.api.savedView() }); return w.finEl.innerHTML; } catch (e) { return 'ERR ' + e.message; } };
let w = world(); ok('전제: 실행된다', !w.err);
if (!w.err) {
  w.api.saveView({ kind: 'ok', amount: 10, balance: 340 });
  const raw = w.store[w.api.viewKey()] || '';
  ok('받았으면 금액을 남기고 잔액은 남기지 않는다', /"amount":10/.test(raw) && !/340/.test(raw));
  const h = show(world({ store: w.store }));
  ok('다시 열면 «+10P · 오늘 받은 포인트»', /\+10P/.test(h) && /오늘 이 이야기로 받은 포인트/.test(h) && /이미 완주한 이야기/.test(h));
  ok('다시 열면 잔액은 안 보인다(그새 바뀜)', !/340/.test(h));
  const he = show(world({ store: w.store, en: true }));
  ok('영어 화면은 영어로', /Points you got for this story today/.test(he) && /\+10P/.test(he));
  const nd = show(world({ store: w.store, day: '2026-11-04' }));
  ok('다음 날에는 어제 포인트를 보여 주지 않는다', !/\+10P/.test(nd) && /이미 완주한 이야기/.test(nd));
  const c = world(); c.api.saveView({ kind: 'cap', ko: '<b>오늘 다 채웠어요</b>', en: 'cap' });
  const hc = show(world({ store: c.store }));
  ok('한도였으면 그 이유를 다시 말한다(이스케이프)', /오늘 다 채웠어요/.test(hc) && !/<b>/.test(hc) && !/\+\d+P/.test(hc));
  const np = show(world({ store: { 'story_s1-07_paid_2026-11-03': '1' } }));
  ok('옛 버전으로 받아 결과가 없으면 «이미 받았어요»', /이미 받았어요/.test(np));
  const none = show(world());
  ok('받은 기록이 없으면 지어내지 않는다', !/P<\/p>/.test(none) && !/이미 받았어요/.test(none) && /이미 완주한 이야기/.test(none));
  const bad = show(world({ store: { 'story_s1-07_paid_2026-11-03_view': '{oops' } }));
  ok('저장값이 깨졌으면 무시', /이미 완주한 이야기/.test(bad) && !/ERR/.test(bad));
  const zero = show(world({ store: { 'story_s1-07_paid_2026-11-03_view': '{"kind":"ok","amount":0}' } }));
  ok('0P 저장값은 «받음» 으로 안 보인다', !/\+0P/.test(zero));
  const thr = world({ throws: true }); let threw = false; try { thr.api.saveView({ kind: 'ok', amount: 10 }); } catch (e) { threw = true; }
  ok('저장이 막혀도 던지지 않는다', !threw);
}
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
