// 🔊 AI 단어 퀴즈 — 낱말을 «한 문장» 모양으로 TTS 에 보내는가 (2026-09-24)
//   낱말 하나만 보내면 Aura 가 첫소리를 자르거나 억양이 이상해진다(사장님 제보).
//   ttsWord 를 소스에서 오려 내 «실제로 돌려» 답을 보고, speakWord 가 그것을 부르는지 짝으로 본다.
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../cloudflare-deploy/public/micro-quiz.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (name, c) => { if (c) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };
function bodyAt(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const o = src.indexOf('{', i); let d = 0;
  for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
const fnSrc = bodyAt(html, 'function ttsWord(');
ok('전제: ttsWord 를 오려 냈다', fnSrc.length > 30);
let ttsWord = null;
try { ttsWord = new Function(fnSrc + '; return ttsWord;')(); } catch (e) { console.log('  (오려 내기 실패: ' + e.message + ')'); }
const run = (w) => { try { return ttsWord ? ttsWord(w) : '__ERR__'; } catch (e) { return '__THROW__'; } };
ok('낱말 하나 → 대문자+마침표 (study → Study.)', run('study') === 'Study.');
ok('구(phrase)도 끝맺음 (go to school → Go to school.)', run('go to school') === 'Go to school.');
ok('이미 대문자면 대문자 유지 (TV → TV.)', run('TV') === 'TV.');
ok('앞뒤 공백 정리 ("  big ") → Big.', run('  big ') === 'Big.');
ok('짝: 이미 마침표면 그대로 (Hello. → Hello.)', run('Hello.') === 'Hello.');
ok('짝: 물음표·느낌표도 그대로', run('Why?') === 'Why?' && run('Wow!') === 'Wow!');
ok('짝: 영문이 아니면 손대지 않음 (你好)', run('你好') === '你好');
ok('짝: 한글 섞이면 손대지 않음', run('apple 사과') === 'apple 사과');
ok('짝: 빈 값은 빈 문자열', run('') === '' && run(null) === '' && run(undefined) === '');
ok("아포스트로피·하이픈 낱말도 처리 (don't → Don't.)", run("don't") === "Don't." && run('ice-cream') === 'Ice-cream.');
// 배선 — speakWord 가 ttsWord 를 «실제로» 거쳐 MangoiTTS.speak 에 넘기는가(실행해서 확인)
const spSrc = bodyAt(html, 'function speakWord(');
ok('전제: speakWord 를 오려 냈다', spSrc.length > 20);
let spoken = null;
try {
  const win = { MangoiTTS: { setLang() {}, speak(t) { spoken = t; } } };
  new Function('window', 'MangoiTTS', fnSrc + '\n' + spSrc + '; speakWord("study");')(win, win.MangoiTTS);
} catch (e) { console.log('  (speakWord 실행 실패: ' + e.message + ')'); }
ok('배선: speakWord("study") 가 "Study." 를 보낸다', spoken === 'Study.');
ok('배선: 옛 모양(낱말 그대로 speak) 으로 되돌아가지 않았다', !/MangoiTTS\.speak\(String\(w/.test(spSrc));
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
