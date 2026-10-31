// 2026-10-18 — «어느 소리가 약했나» 음소 피드백 (개선안 1순위 ①)
//   js/phoneme-tips.js 를 실제로 돌리고, 음소를 «버리지 않는가» 를 두 경로(브라우저 SDK·서버 REST)에서 실행해 봅니다.
//   그리고 speech-coach.html 의 renderWordMap 을 오려 내 가짜 DOM 에 그려 «한 줄이 실제로 나오는가» 를 봅니다.
//   짝: «말한다» 옆에 «표에 없는 소리·충분한 점수·빠뜨린 단어·영어 아닌 단어에는 말하지 않는다».
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const P = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const MOD = P('cloudflare-deploy/public/js/phoneme-tips.js', 'PT_SRC');
const SDKJS = P('cloudflare-deploy/public/js/speech-azure.js', 'SA_SRC');
const AZ = P('cloudflare-deploy/src/azure-pronunciation.ts', 'AZ_SRC');
const SC = P('cloudflare-deploy/public/speech-coach.html', 'SC_SRC');
const CN = P('cloudflare-deploy/public/speech-coach-cn.html', 'CN_SRC');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

const win = {};
try { vm.runInNewContext(MOD, { window: win }); } catch (e) { check('모듈 실행', false, e.message); }
const M = win.MangoPhonemeTips;
check('모듈을 실제로 실행했다(전제)', !!M);
if (M) {
  const W = (word, ph, et) => ({ word, accuracy: 70, errorType: et, phonemes: ph.map(([p, acc]) => ({ p, acc })) });
  const r1 = M.weakest([W('right', [['r', 35], ['ay', 90], ['t', 88]]), W('now', [['n', 95], ['aw', 80]])]);
  check('가장 약한 소리 하나 — right 의 r(35)', r1 && r1.word === 'right' && r1.phoneme === 'r' && r1.acc === 35, r1);
  const r2 = M.weakest([W('think', [['th', 50]]), W('right', [['r', 30]])]);
  check('여러 단어 중 «가장» 약한 것', r2 && r2.word === 'right', r2);
  check('IPA 기호도 같은 소리로 읽는다(θ → th)', M.key('θ') === 'th' && M.key('ɹ') === 'r' && M.key('ð') === 'dh');
  check('대문자 이름도 읽는다', M.key('TH') === 'th');
  check('짝: 경계 — 59 는 약함, 60 은 충분', !!M.weakest([W('red', [['r', 59]])]) && M.weakest([W('red', [['r', 60]])]) === null);
  check('짝: 표에 없는 소리는 말하지 않는다(지어내지 않음)', M.weakest([W('cat', [['k', 10], ['t', 12]])]) === null);
  check('짝: 빠뜨린·덧붙인 단어는 보지 않는다', M.weakest([W('very', [['v', 10]], 'Omission'), W('so', [['s', 5]], 'Insertion')]) === null);
  check('짝: 영어가 아닌 단어(중국어)는 보지 않는다', M.weakest([W('你好', [['r', 10]])]) === null);
  check('짝: 음소가 없으면(옛 데이터) null', M.weakest([{ word: 'right', accuracy: 30 }]) === null && M.weakest(null) === null);
  check('숫자가 아닌 점수는 버린다', M.weakest([W('right', [['r', 'x']])]) === null);
  const ko = M.line([W('very', [['v', 20]])], false);
  check('한국어 한 줄: 단어·소리·팁', /<b>very<\/b> 의 <b>\/v\/<\/b> 소리가 약했어요/.test(ko) && /윗니/.test(ko), ko);
  const en = M.line([W('very', [['v', 20]])], true);
  check('영어 한 줄에는 한글이 없다', /In <b>very<\/b>, the <b>\/v\/<\/b> sound was weak/.test(en) && !/[가-힣]/.test(en), en);
  check('그릴 것이 없으면 빈 문자열', M.line([W('cat', [['k', 10]])], false) === '');
  check('단어는 이스케이프한다', !/<img/.test(M.line([{ word: "it's", phonemes: [{ p: 'ih', acc: 10 }] }], false)) && /it&#39;s/.test(M.line([{ word: "it's", phonemes: [{ p: 'ih', acc: 10 }] }], false)));
  check('팁 문구에 CJK 홑낫표가 없다(한자 글꼴 검사 함정)', !/[「」]/.test(MOD));
  // 🇰🇷 붙은 자음 자리(2026-10-18 ⑦) — «말한다» 와 «말하지 않는다» 를 짝으로
  const st = M.weakest([W('street', [['s', 40], ['t', 45], ['r', 85], ['iy', 90], ['t', 88]])]);
  check('붙은 자음: street 의 s(40) → 자음 자리 팁', st && st.phoneme === 'cluster' && st.label === 's·t' && /«으»/.test(st.tipKo), st);
  check('붙은 자음 짝: 철자에 자음이 안 붙으면(cat) 말하지 않는다', M.weakest([W('cat', [['k', 10], ['t', 12]])]) === null);
  check('붙은 자음 짝: 앞뒤가 모음이면 말하지 않는다', M.weakest([W('stop', [['ah', 90], ['t', 20], ['aa', 90]])]) === null);
  const st2 = M.weakest([W('street', [['s', 50], ['t', 70], ['r', 30], ['iy', 90]])]);
  check('붙은 자음 짝: 표에 있는 소리(r)가 더 약하면 그 팁이 이긴다', st2 && st2.phoneme === 'r', st2);
  check('붙은 자음: 충분한 점수(60)면 말하지 않는다', M.weakest([W('stop', [['s', 60], ['t', 90]])]) === null);
  check('붙은 자음: IPA 기호도 읽는다(ɡ·l)', (M.weakest([W('glad', [['ɡ', 30], ['l', 90], ['æ', 90], ['d', 90]])]) || {}).label === 'g·l');
  const stEn = M.line([W('street', [['s', 40], ['t', 45]])], true);
  check('붙은 자음 영어 줄에는 한글이 없다', /street/.test(stEn) && !/[가-힣]/.test(stEn), stEn);
}

// ── 브라우저 SDK 경로: words 매핑을 오려 내 실제로 돌린다 ──
{
  const a = SDKJS.indexOf('words: raw.slice(0, 40).map(function (w) {');
  let e = -1, d = 0;
  if (a > 0) for (let i = SDKJS.indexOf('.map(', a) + 4; i < SDKJS.length; i++) { if (SDKJS[i] === '(') d++; else if (SDKJS[i] === ')') { d--; if (d === 0) { e = i + 1; break; } } }
  check('SDK: words 매핑을 오려 냈다(전제)', a > 0 && e > a);
  let out = null;
  try {
    const expr = SDKJS.slice(a + 'words: '.length, e);
    const n = (v) => { const x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0; };
    out = new Function('raw', 'n', 'return ' + expr)([{ Word: 'right', PronunciationAssessment: { AccuracyScore: 62 }, Phonemes: [{ Phoneme: 'r', PronunciationAssessment: { AccuracyScore: 31.6 } }, { Phoneme: 'ay', PronunciationAssessment: { AccuracyScore: 99 } }] }, { Word: 'go', PronunciationAssessment: { AccuracyScore: 90 } }], n);
  } catch (err) { check('SDK 매핑 실행', false, err.message); }
  check('SDK: 음소를 남긴다(r=32)', !!(out && out[0] && out[0].phonemes && out[0].phonemes[0] && out[0].phonemes[0].p === 'r' && out[0].phonemes[0].acc === 32), out && out[0]);
  check('SDK: 음소가 없는 단어는 빈 배열(던지지 않음)', out && Array.isArray(out[1].phonemes) && out[1].phonemes.length === 0);
}

// ── 서버 REST 경로 ──
{
  let phonemesOf = null;
  try {
    const js = stripTypeScriptTypes(AZ).replace(/^export\s+/gm, '');
    phonemesOf = new Function(js + '\nreturn phonemesOf;')();
  } catch (e) { check('서버 모듈 로드', false, e.message); }
  const num = (v) => { const x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100, Math.round(x))) : 0; };
  check('서버: 음소를 남긴다', phonemesOf && JSON.stringify(phonemesOf({ Phonemes: [{ Phoneme: 'th', PronunciationAssessment: { AccuracyScore: 40 } }] }, num)) === '[{"p":"th","acc":40}]');
  check('서버: 이상한 값은 버리고 던지지 않는다', phonemesOf && phonemesOf(null, num).length === 0 && phonemesOf({ Phonemes: [{}] }, num).length === 0);
  const calls = (AZ.match(/phonemes: phonemesOf\(w, (n2|num)\)/g) || []).length;
  check('서버: 두 응답 경로(정상·재시도) 모두 음소를 싣는다', calls === 2, calls);
}

// ── 화면: renderWordMap 을 오려 내 실제로 그린다 ──
{
  const s = SC.indexOf('function renderWordMap(words) {');
  let e = -1, d = 0;
  if (s > 0) for (let i = SC.indexOf('{', s); i < SC.length; i++) { if (SC[i] === '{') d++; else if (SC[i] === '}') { d--; if (d === 0) { e = i + 1; break; } } }
  check('화면: renderWordMap 을 오려 냈다(전제)', s > 0 && e > s);
  const draw = (words, tips, en) => {
    const box = { style: {}, innerHTML: '', onclick: null };
    const w = { getLang: () => (en ? 'en' : 'ko'), MangoPhonemeTips: tips ? M : undefined };
    const fn = new Function('window', 'document', 'MangoPhonemeTips', SC.slice(s, e) + '\nrenderWordMap(arguments[3]);');
    fn(w, { getElementById: () => box }, tips ? M : undefined, words);
    return box.innerHTML;
  };
  const words = [{ word: 'Very', accuracy: 55, phonemes: [{ p: 'v', acc: 22 }, { p: 'eh', acc: 80 }] }, { word: 'good', accuracy: 92, phonemes: [{ p: 'g', acc: 95 }] }];
  let h = '';
  try { h = draw(words, true, false); } catch (err) { check('화면 그리기', false, err.message); }
  check('화면: 약한 소리 한 줄을 그린다', /wordmap-phon/.test(h) && /<b>Very<\/b> 의 <b>\/v\/<\/b>/.test(h), h.slice(-300));
  let h2 = ''; try { h2 = draw([{ word: 'cat', accuracy: 40, phonemes: [{ p: 'k', acc: 10 }] }], true, false); } catch (err) {}
  check('화면 짝: 표에 없는 소리면 그 줄이 없다(단어 지도는 그대로)', !/wordmap-phon/.test(h2) && /wordmap-words/.test(h2));
  let h3 = ''; try { h3 = draw(words, false, false); } catch (err) {}
  check('화면 짝: 모듈이 안 실려도 단어 지도는 그대로 그린다', !/wordmap-phon/.test(h3) && /wordmap-words/.test(h3));
  let h4 = ''; try { h4 = draw(words, true, true); } catch (err) {}
  check('화면: 영어 화면에서는 영어 한 줄', /the <b>\/v\/<\/b> sound was weak/.test(h4));
}
check('speech-coach 가 모듈을 싣는다', /<script src="\/js\/phoneme-tips\.js\?v=\d+" defer><\/script>/.test(SC));
check('두 화면이 speech-azure.js 같은 번호를 부른다(캐시에 옛 SDK 매핑이 남지 않게)',
  (SC.match(/speech-azure\.js\?v=(\d+)/) || [])[1] === (CN.match(/speech-azure\.js\?v=(\d+)/) || [])[1] && (SC.match(/speech-azure\.js\?v=(\d+)/) || [])[1] !== '1');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
