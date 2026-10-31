// 🌐 A.i 말하기(웜업) 화면 언어 KO/EN + 🎤 녹음방식 기억 — 회귀 감시 (2026-10-03 Maimai 제보 2건)
//   ① 「English 로 바꾸고 다른 옵션을 고르면 다시 한국어로」 — 화면에 KO/EN 이 없어 브라우저 번역에 기대는데
//      renderSetup() 이 고를 때마다 innerHTML 을 한국어로 다시 그려 번역이 풀렸다.
//   ② 「녹음하고 보내도 안 된다」 — #1348 이 «이 화면에서만» 녹음 방식으로 바꿔 다음 방문에 같은 실패가 되풀이됐다.
// 판정은 «그 글자가 있는가» 가 아니라 표·함수를 오려 내 실제로 돌려 본다. 브라우저 검사: manual/warmup-ui-lang-browser.mjs
import fs from 'node:fs';
const W = fs.readFileSync(new URL('../cloudflare-deploy/public/warmup.html', import.meta.url), 'utf8');
const AT = fs.readFileSync(new URL('../cloudflare-deploy/public/js/warmup-auto-talk.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const arr = (name) => { const m = W.match(new RegExp('var ' + name + ' = (\\[[\\s\\S]*?\\n\\]);')); try { return m ? new Function('return ' + m[1])() : null; } catch (e) { return null; } };
const bodyOf = (src, sig) => { const i = src.indexOf(sig); if (i < 0) return ''; let k = src.indexOf('{', i), d = 0; for (let j = k; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(i, j + 1); } return ''; };

console.log('① 표마다 영어 이름·설명이 있다');
const LEV = arr('LEVEL_CATALOG'), AGE = arr('AGE_CATALOG'), LANG = arr('LANG_CATALOG');
ok('세 표를 읽었다(전제)', LEV && AGE && LANG && LEV.length === 8 && AGE.length >= 4 && LANG.length >= 2);
for (const [nm, t] of [['LEVEL', LEV || []], ['AGE', AGE || []], ['LANG', LANG || []]])
  ok(nm + ' — 모든 칸에 en·de(영어 설명)', t.every(x => x.en && x.de && !/[가-힣]/.test(x.en + x.de)), JSON.stringify(t.filter(x => !(x.en && x.de)).map(x => x.ko)));

console.log('② 헬퍼를 실제로 돌린다');
const helper = W.slice(W.indexOf('function wuEn()'), W.indexOf('function wuApplyStatic'));
const run = (lang) => new Function('localStorage', 'window', helper + '; return { t: wuT("가","A"), en: wuEn(), g: window.getLang() };')(
  { getItem: (k) => (k === 'mangoi_lang' ? lang : null) }, {});
ok('mangoi_lang=en → 영어', run('en').t === 'A' && run('en').g === 'en');
ok('mangoi_lang=ko → 한국어(짝)', run('ko').t === '가' && run('ko').g === 'ko');
ok('저장값이 없으면 한국어(예전 그대로)', run(null).t === '가');
ok('getLang 은 «없을 때만» 둔다(mango-i18n 과 겹치지 않게)', /if\(typeof window\.getLang !== 'function'\) window\.getLang =/.test(W));

console.log('③ 다시 그리는 자리가 언어를 읽는다(옵션을 골라도 안 풀린다)');
const rs = bodyOf(W, 'function renderSetup(){');
ok('renderSetup 을 오려 냈다(전제)', rs.length > 500);
ok('연령 카드 이름·설명을 ageName/ageDesc 로', /ageName\(a\)/.test(rs) && /ageDesc\(a\)/.test(rs));
ok('언어·수준 카드가 wuT 로', (rs.match(/wuT\(/g) || []).length >= 5);
ok('옛 «a.ko 그대로» 그리기가 없다', !/'<span class="wus-name">'\+a\.ic\+' '\+a\.ko\+/.test(rs));
for (const f of ['function renderTwoWay(', 'function btsRenderBookNow(', 'function btsListHtml('])
  ok(f + ' 가 wuT 를 쓴다', /wuT\(/.test(bodyOf(W, f)));
const ap = bodyOf(W, 'function wuApplyLang(');
ok('언어를 바꾸면 설정·⋮ 값 표시를 다시 그린다', ['renderSetup', 'setLevel', 'setSubMode', 'setRate', 'applyVoiceFace'].every(x => ap.includes(x + '(')));
ok('다른 js(자동 말하기 등)에도 알린다', /mangoi:lang-changed/.test(ap));
ok('🌐 버튼이 설정 화면과 ⋮ 머리에 있다', (W.match(/class="[^"]*wu-langbtn[^"]*"[^>]*onclick="wuToggleUiLang\(\)"/g) || []).length >= 2);
ok('data-ko 는 «글자만 담은» 요소에만(자식 요소를 갈아끼우지 않게)', !/data-en="[^"]*">[^<]*<(?!\/)[a-z]/.test(W));
ok('자동 말하기 카드도 영어를 안다', /Talk automatically/.test(AT) && /uiEn\(\)/.test(bodyOf(AT, 'function btnsHtml(')));
ok('auto-talk ?v= 를 올렸다', /warmup-auto-talk\.js\?v=([6-9]|\d{2,})/.test(W));

console.log('④ 🎤 «받아 적지 못함» 을 기기에 기억한다');
ok('읽기 — 기한이 남아 있으면 처음부터 녹음 방식', /Number\(localStorage\.getItem\(WU_STT_PREF_KEY\)\|\|0\) > Date\.now\(\)\) _micPreferWhisper=true/.test(W));
const fin = bodyOf(W, 'function _finishMic(');
ok('쓰기 — ⏹ 빈손 갈래에서 기한을 적는다', /_micPreferWhisper=true;\s*try\{ localStorage\.setItem\(WU_STT_PREF_KEY/.test(fin));
ok('기한이 있다(영영 묶지 않는다)', /WU_STT_PREF_MS=14\*86400000/.test(W));
console.log(`\nwarmup_ui_lang_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
