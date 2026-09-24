// 🔊 음성 서버 입구 — 짧은 영어 낱말을 «한 문장» 모양으로 (2026-09-24)
//   게임·퀴즈 20곳이 /api/voice/tts 를 각자 부른다. 낱말 하나(`study`)를 받으면 Aura 가 어색하게 읽어서
//   서버 입구 한 곳(src/tts-short-text.ts)에서 `Study.` 로 다듬는다.
//   정본을 «실제로 돌려» 답을 보고, 두 입구(voice/tts · review-quiz/tts)가 그것을 캐시 키보다 «먼저» 거치는지 본다.
import { readFileSync } from 'node:fs';
const root = new URL('../cloudflare-deploy/src/', import.meta.url);
const modSrc = readFileSync(new URL('tts-short-text.ts', root), 'utf8');
const games = readFileSync(new URL('api-games.ts', root), 'utf8');
const exam = readFileSync(new URL('api-exam.ts', root), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n); } };

// ① 정본을 타입만 걷어 내고 실제로 실행 (esbuild 없이 — 이 모듈은 타입 표기뿐이다)
let fn = null, MAXW = null;
try {
  const js = modSrc.replace(/export\s+/g, '').replace(/\(text: string, lang: string\): string/, '(text, lang)');
  const out = new Function(js + '; return { ttsShortText, TTS_SHORT_MAX_WORDS };')();
  fn = out.ttsShortText; MAXW = out.TTS_SHORT_MAX_WORDS;
} catch (e) { console.log('  (정본 실행 실패: ' + e.message + ')'); }
ok('전제: 정본을 실행했다', typeof fn === 'function');
const r = (t, l) => { try { return fn ? fn(t, l) : '__ERR__'; } catch (e) { return '__THROW__'; } };
ok('낱말 하나 → Study.', r('study', 'en') === 'Study.');
ok('세 낱말 → Go to school.', r('go to school', 'en') === 'Go to school.');
ok('대문자 낱말 유지 → TV.', r('TV', 'en') === 'TV.');
ok("아포스트로피·하이픈 → Don't. / Ice-cream.", r("don't", 'en') === "Don't." && r('ice-cream', 'en') === 'Ice-cream.');
ok('끝 쉼표는 떼고 마침표 → Apple.', r('apple,', 'en') === 'Apple.');
ok('lang 이 en-US 여도 적용', r('big', 'en-us') === 'Big.');
// 짝: 안 바꾸는 것
ok('짝: 네 낱말 이상 문장은 그대로(캐시 보호)', r('I like to eat', 'en') === 'I like to eat');
ok('짝: 이미 끝맺은 것 그대로', r('Hello.', 'en') === 'Hello.' && r('Why?', 'en') === 'Why?' && r('Wow!', 'en') === 'Wow!');
ok('짝: 중국어 lang 은 그대로', r('ni hao', 'zh') === 'ni hao' && r('你好', 'zh') === '你好');
ok('짝: 한글 섞이면 그대로', r('apple 사과', 'en') === 'apple 사과');
ok('짝: 숫자로 시작하면 그대로', r('10', 'en') === '10');
ok('짝: 빈 값', r('', 'en') === '' && r(null, 'en') === '' && r(undefined, 'en') === '');
ok('상한 상수는 3', MAXW === 3);

// ② 배선 — 라우트 몸통을 중괄호 짝으로 잘라 «그 함수로 text 를 만들고, 캐시 키보다 먼저» 인지
function routeBody(src, anchor) {
  const i = src.indexOf(anchor); if (i < 0) return '';
  const o = src.indexOf('{', i); let d = 0;
  for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } }
  return '';
}
ok('배선: 정본을 import 한다', /import\s*\{\s*ttsShortText\s*\}\s*from\s*'\.\/tts-short-text'/.test(games));
for (const [name, anchor] of [['voice/tts', "path === '/api/voice/tts'"], ['review-quiz/tts', "path === '/api/review-quiz/tts'"]]) {
  const body = routeBody(games, anchor);
  ok(`전제: ${name} 라우트를 잘라 냈다`, body.length > 500);
  const m = body.match(/const text = ttsShortText\(/);
  const iText = m ? m.index : -1;
  const iKey = body.search(/TextEncoder\(\)\.encode\(/);
  ok(`배선: ${name} 의 text 가 ttsShortText 로 만들어진다`, iText >= 0);
  ok(`배선: ${name} 에서 캐시 키보다 먼저`, iText >= 0 && iKey > iText);
  ok(`배선: ${name} 에 «낱말 그대로» text 선언이 되살아나지 않았다`, (body.match(/const text\s*=/g) || []).length === 1);
}
// ③ 복습퀴즈: 중국어 퀴즈(병음 audio_text)는 안 바뀌어야 한다 — lang 인자를 «실제로» 평가
{
  const body = routeBody(games, "path === '/api/review-quiz/tts'");
  const m = body.match(/const text = ttsShortText\(([\s\S]*?)\);\n/);
  let zhOut = '__ERR__', enOut = '__ERR__';
  if (m && fn) {
    try {
      const call = new Function('ttsShortText', 'q', 'isZh', 'return ttsShortText(' + m[1] + ');');
      zhOut = call(fn, { type: 'listen', audio_text: 'ni hao' }, true);
      enOut = call(fn, { type: 'listen', audio_text: 'study' }, false);
    } catch (e) { console.log('  (호출 평가 실패: ' + e.message + ')'); }
  }
  ok('복습퀴즈: 중국어 퀴즈의 병음은 그대로 (ni hao)', zhOut === 'ni hao');
  ok('복습퀴즈 짝: 영어 퀴즈 낱말은 Study.', enOut === 'Study.');
}
// ④ 시험 듣기(GET /api/exam/tts, MeloTTS) — 같은 정본을 캐시 키보다 먼저 (2026-09-24)
{
  ok('시험: 정본을 import 한다', /import\s*\{\s*ttsShortText\s*\}\s*from\s*'\.\/tts-short-text'/.test(exam));
  const body = routeBody(exam, "path === '/api/exam/tts'");
  ok('전제: exam/tts 라우트를 잘라 냈다', body.length > 500);
  const m = body.match(/const text = ttsShortText\(([\s\S]*?)\);\n/);
  const iText = m ? m.index : -1;
  const iKey = body.search(/TextEncoder\(\)\.encode\(/);
  ok('시험: text 가 ttsShortText 로 만들어진다', iText >= 0);
  ok('시험: 캐시 키보다 먼저', iText >= 0 && iKey > iText);
  ok('시험: text 선언이 하나뿐', (body.match(/const text\s*=/g) || []).length === 1);
  let w = '__ERR__', l = '__ERR__';
  if (m && fn) {
    try {
      const call = new Function('ttsShortText', 'url', 'return ttsShortText(' + m[1] + ');');
      const u = (t) => ({ searchParams: new URLSearchParams({ text: t }) });
      w = call(fn, u('study')); l = call(fn, u('Listen and choose the best answer'));
    } catch (e) { console.log('  (시험 호출 평가 실패: ' + e.message + ')'); }
  }
  ok('시험: 낱말 하나 → Study.', w === 'Study.');
  ok('시험 짝: 긴 문장은 그대로', l === 'Listen and choose the best answer');
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
