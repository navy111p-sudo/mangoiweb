// 🔊 음성 서버 입구 — 짧은 영어 낱말을 «한 문장» 모양으로 (2026-09-24)
//   게임·퀴즈 20곳이 /api/voice/tts 를 각자 부른다. 낱말 하나(`study`)를 받으면 Aura 가 어색하게 읽어서
//   서버 입구 한 곳(src/tts-short-text.ts)에서 `Study.` 로 다듬는다.
//   정본을 «실제로 돌려» 답을 보고, 두 입구(voice/tts · review-quiz/tts)가 그것을 캐시 키보다 «먼저» 거치는지 본다.
import { readFileSync, readdirSync } from 'node:fs';
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
// ⑤ 기기 목소리(speechSynthesis) — public/js/tts-short-text.js (2026-09-24)
{
  const pub = new URL('../cloudflare-deploy/public/', import.meta.url);
  const bsrc = readFileSync(new URL('js/tts-short-text.js', pub), 'utf8');
  let spoken = [], win = null;
  const mk = () => {
    spoken = [];
    const ss = { speak(u) { spoken.push(u.text); } };
    win = { speechSynthesis: ss };
    const doc = { documentElement: { lang: 'ko' } };
    new Function('window', 'document', bsrc)(win, doc);
  };
  try { mk(); } catch (e) { console.log('  (브라우저 파일 실행 실패: ' + e.message + ')'); }
  const bfn = win && win.mgTtsShortText;
  ok('전제: 브라우저 규칙을 실행했다', typeof bfn === 'function');
  // 서버 정본과 «같은 답» 인가 — 입력 묶음 전수 대조
  const CASES = ['study','go to school','TV',"don't",'ice-cream','apple,','  big ','I like to eat','Hello.','Why?','Wow!','ni hao','你好','apple 사과','10','', 'a', 'Mr Kim', 'look at me now'];
  const LANGS = ['en','en-us','EN-GB','zh','zh-CN','ko',''];
  let diff = [];
  for (const t of CASES) for (const l of LANGS) { let a, b; try { a = fn(t, l); b = bfn(t, l); } catch (e) { a = 'E'; b = 'e'; } if (a !== b) diff.push(JSON.stringify([t, l, a, b])); }
  ok('브라우저 규칙 = 서버 정본 (' + CASES.length * LANGS.length + '조합)', typeof bfn === 'function' && diff.length === 0);
  if (diff.length) console.log('    어긋남: ' + diff.slice(0, 5).join(' '));
  // speak() 감싸기 — 실제로 호출해 «무엇이 읽혔나» 를 본다
  const say = (text, lang, voiceLang) => { const u = { text, lang: lang || '', voice: voiceLang ? { lang: voiceLang } : null }; try { win.speechSynthesis.speak(u); } catch (e) { return '__THROW__'; } return spoken[spoken.length - 1]; };
  try { mk(); } catch (e) {}
  ok('기기: en-US 낱말 → Study.', say('study', 'en-US') === 'Study.');
  ok('기기: lang 없음 + 한국어 문서 + 영어 낱말 → Big.', say('big', '') === 'Big.');
  ok('기기: voice.lang 이 en 이면 적용', say('happy', '', 'en-GB') === 'Happy.');
  ok('기기 짝: 중국어 음성은 그대로 (ni hao / 你好)', say('ni hao', 'zh-CN') === 'ni hao' && say('你好', 'zh-CN') === '你好');
  ok('기기 짝: 긴 문장은 그대로', say('I like to eat pizza', 'en-US') === 'I like to eat pizza');
  ok('기기 짝: 한국어 문장은 그대로', say('안녕하세요', 'ko-KR') === '안녕하세요');
  ok('기기: 원래 speak 를 한 번씩 부른다(삼키지 않음)', (() => { mk(); say('a','en'); say('b','zh'); return spoken.length === 2; })());
  ok('기기: 두 번 실려도 두 번 감싸지 않는다', (() => { spoken = []; const ss = { speak(u) { spoken.push(u.text); } }; const w = { speechSynthesis: ss }; const d = { documentElement: { lang: 'en' } }; new Function('window','document',bsrc)(w,d); const once = w.speechSynthesis.speak; new Function('window','document',bsrc)(w,d); w.speechSynthesis.speak({ text: 'study', lang: 'en' }); return w.speechSynthesis.speak === once && spoken.length === 1 && spoken[0] === 'Study.'; })());
  ok('기기: speechSynthesis 가 없어도 던지지 않는다', (() => { try { new Function('window','document',bsrc)({}, { documentElement: {} }); return true; } catch (e) { return false; } })());
  // 배선 — 기기 목소리를 쓰는 학생 화면이 이 파일을 빠짐없이 싣는가(기계로 센다)
  const MODS = ['mangoi-listen-first.js','mangoi-speak-cycle.js','scene-curriculum.js','scene-quest.js','game-tts.js'];
  const EXCLUDE = new Set(['index.html','admin.html','zh-voice-sample.html']);   // 공동 금지구역 · 관리자 · 중국어 성우 견본
  const pages = readdirSync(pub).filter(f => f.endsWith('.html') && !EXCLUDE.has(f));
  const need = pages.filter(f => { const h = readFileSync(new URL(f, pub), 'utf8'); return /new\s+SpeechSynthesisUtterance/.test(h) || MODS.some(m => h.includes('/js/' + m)); });
  const miss = need.filter(f => !/<script[^>]+src="\/js\/tts-short-text\.js\?v=\d+"/.test(readFileSync(new URL(f, pub), 'utf8')));
  ok('전제: 기기 목소리를 쓰는 학생 화면을 찾았다 (' + need.length + '곳)', need.length >= 20);
  ok('배선: 그 화면 전부가 tts-short-text.js 를 싣는다', miss.length === 0);
  if (miss.length) console.log('    빠진 화면: ' + miss.join(', '));
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
