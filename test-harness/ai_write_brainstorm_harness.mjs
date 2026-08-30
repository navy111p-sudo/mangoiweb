// ✍️🧠 AI 영작 첨삭 — «브레인스토밍(그래픽 오가나이저) → 정밀첨삭 → 고쳐쓰기·출력» 감시 하니스 (2026-08-30)
//
//   왜 필요한가 —
//     제안서(«AI 영작 첨삭 및 브레인스토밍 통합»)대로 4단계 파이프라인을 넣었다.
//     이 중 «무슨 글자가 글쓰기 칸에 들어가는가» 는 문자열 검사로 볼 수 없다 —
//     함수도 값도 다 «있고» 틀리는 것은 «무엇이 나오는가» 뿐이기 때문이다
//     (CLAUDE.md 2장 「하니스가 전부 초록인데 화면이 죽어 있음」과 같은 사정).
//     그래서 뼈대 생성 함수를 HTML 에서 **오려 내 실제로 돌린다.**
//
//   이 하니스가 못 박는 것 —
//     ① 🔴 한글로 적은 답은 **글쓰기 칸에 절대 들어가지 않는다.**
//        그 칸의 글은 그대로 영어 AI 첨삭으로 간다 — 한글이 섞이면 첨삭이 통째로 헛돈다.
//        한글 답은 «메모» 로만 남는다.
//     ② 시작 문장이 답과 «겹치지 않는다» — 「I lost 」 + 「I lost my watch」 =
//        「I lost I lost my watch」 가 되던 것을 실제로 밟아 고쳤다(2026-08-30 브라우저 실측).
//     ③ 서론·본론·결론 3문단 구조가 유지된다. 답이 하나도 없으면 «뼈대로 쓰기» 가 안 열린다.
//     ④ 🔴 어휘 업그레이드는 **학생이 실제로 쓴 말** 만 고친다 — 모델이 지어낸 단어를
//        그대로 내보내면 «내가 안 쓴 말» 이 내 글에서 고쳐진 것처럼 뜬다. 서버 검증부를
//        오려 내 실제로 돌린다. to 에 한글·한자가 섞이면 버린다(따라 쓸 영어라서).
//     ⑤ 한 장 출력(초안·첨삭·완성본)의 인쇄 규칙과 4단계 배너가 살아 있다.
//
//   ⚠️ 이 하니스는 «값» 만 본다. 「눌러서 진짜 그렇게 되는가」는 브라우저로 봐야 한다:
//        PW_DIR=/tmp/pw node test-harness/manual/ai-write-brainstorm-browser.mjs
//
//   실행: node test-harness/ai_write_brainstorm_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dir);
const read = (p) => { try { return readFileSync(join(root, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0; const FAILS = [];
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; FAILS.push(name); console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
};
const eq = (name, got, want) => check(`${name} → «${got}»`, got === want, `기대 «${want}»`);
const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

console.log('✍️🧠 AI 영작 브레인스토밍 하니스 · ' + new Date().toISOString());

const HTML = read('cloudflare-deploy/public/ai-write.html');
const API = read('cloudflare-deploy/src/api-ai.ts');
check('ai-write.html · api-ai.ts 를 읽었다', HTML.length > 0 && API.length > 0);

/* ═══════════════════════════════════════════════════════════════════
   [A] 뼈대 생성기를 소스에서 오려 내 «실제로» 돌린다
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[A] 🔴 뼈대 생성기(goLineFor·goOutline)를 오려 내 실행');
const cut = (re, label) => {
  const m = HTML.match(re);
  check('오려 냄: ' + label, !!m);
  return m ? m[0] : '';
};
const SRC = [
  cut(/const GO_BASE = \[[\s\S]*?\n    \];/, 'GO_BASE'),
  cut(/const GO_THEMES = \[[\s\S]*?\n    \];/, 'GO_THEMES'),
  cut(/const GO_PARTS = \[[\s\S]*?\n    \];/, 'GO_PARTS'),
  cut(/const goHasKo = [^\n]+\n/, 'goHasKo'),
  cut(/const goIsEn  = [^\n]+\n/, 'goIsEn'),
  cut(/function goQuestions\(\) \{[\s\S]*?\n    \}/, 'goQuestions'),
  cut(/function goLineFor\(q\) \{[\s\S]*?\n    \}/, 'goLineFor'),
  cut(/function goOutline\(\) \{[\s\S]*?\n    \}/, 'goOutline'),
].join('\n');

let outline = null;
if (!/오려 냄/.test('') && SRC.length > 500) {
  outline = new Function('themeId', 'answers',
    'let _goTheme = null, _goAnswers = answers || {};\n' + SRC +
    '\n_goTheme = GO_THEMES.find(t => t.id === themeId) || null;\nreturn goOutline();');
  check('뼈대 생성기가 실행된다', Array.isArray(outline('lost', {}).parts));
}

if (outline) {
  // ① 한글 답은 글쓰기 칸에 절대 안 들어간다
  const koOnly = outline('lost', { when: '지난 일요일', who: '엄마랑 동생', what: '시계를 잃어버림' });
  check('① 한글로만 답해도 뼈대 글에 한글이 없다', !HANGUL.test(koOnly.text), JSON.stringify(koOnly.text));
  check('① 한글 답은 «메모» 로 남는다',
    koOnly.parts.some(p => p.lines.some(l => l.memo === '엄마랑 동생')));

  // ② 시작 문장이 답과 겹치지 않는다
  const dup = outline('lost', { what: 'I lost my favorite watch' });
  const whatLine = dup.parts[1].lines.map(l => l.en).join(' ');
  eq('② 「I lost 」+「I lost my favorite watch」', whatLine, 'I lost my favorite watch.');
  const dup2 = outline('lost', { when: 'happened last Sunday' });
  check('② 첫 낱말이 시작 문장 끝말과 같으면 한 번만 쓴다',
    /It happened last Sunday\./.test(dup2.text) && !/happened happened/.test(dup2.text), dup2.text);
  const whole = outline('lost', { how: 'I was very sad that day.' });
  check('② 이미 완성된 문장은 손대지 않는다', /I was very sad that day\./.test(whole.text) && !/I felt I was/.test(whole.text), whole.text);
  const plain = outline('bday', { how: 'so happy' });
  check('② 보통 답은 시작 문장 + 답 + 마침표', /I felt so happy\./.test(plain.text), plain.text);

  // ③ 서론·본론·결론
  const full = outline('trip', { when: 'last summer', where: 'Jeju', who: 'my family', what: 'we went swimming', why: 'I saw the sea for the first time', how: 'excited' });
  check('③ 서론·본론·결론 3문단으로 나뉜다', full.text.split('\n\n').length === 3, JSON.stringify(full.text));
  check('③ 주제 첫 문장이 맨 앞에 온다', full.text.indexOf('Last year, I went on a trip') === 0);
  check('③ 답이 하나도 없으면 answered 0 (뼈대로 쓰기 잠김)', outline('trip', {}).answered === 0);
  check('③ 답이 하나면 answered 1', outline('trip', { how: 'good' }).answered === 1);

  // ④ 주제 8종이 6하원칙 질문을 모두 갖췄다
  const bad = [];
  const ids = [...HTML.matchAll(/\{ id:'([a-z]+)'/g)].map(m => m[1]);
  ids.forEach(id => {
    const o = outline(id, { when: 'x', where: 'x', who: 'x', what: 'x', why: 'x', how: 'x' });
    const n = o.parts.reduce((a, p) => a + p.lines.length, 0);
    if (n !== 7) bad.push(id + ':' + n);      // 주제 첫 문장 1 + 질문 6
  });
  check('④ 주제 8종 모두 6하원칙 6문항 + 첫 문장', ids.length === 8 && bad.length === 0, ids.length + '종 ' + JSON.stringify(bad));
}

/* ═══════════════════════════════════════════════════════════════════
   [B] 화면 구조 — 4단계 배너 · 오가나이저 · 메모 · 한 장 출력
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[B] 화면 구조');
check('4단계 파이프라인 배너가 있다', [1, 2, 3, 4].every(n => HTML.includes(`data-step="${n}"`)));
check('그래픽 오가나이저 카드가 글쓰기 칸 «앞» 에 있다',
  HTML.indexOf('id="goCard"') > 0 && HTML.indexOf('id="goCard"') < HTML.indexOf('<textarea id="text"'));
check('브레인스토밍 메모 줄이 있다 (쓰면서 보기)', HTML.includes('id="goMemo"') && HTML.includes('id="goMemoBody"'));
check('한 장 출력 오버레이가 있다', HTML.includes('id="sheetModal"') && HTML.includes('window.openSheet'));
check('한 장 출력에 초안·첨삭·완성본이 모두 들어간다',
  /② 내 초안/.test(HTML) && /③ AI 첨삭 피드백/.test(HTML) && /④ 완성본/.test(HTML) && /① 브레인스토밍/.test(HTML));
check('인쇄할 때 뒤 화면을 숨긴다', /body\.sheet-open > \*:not\(#sheetModal\)/.test(HTML));
check('이미 쓴 글은 확인 없이 덮어쓰지 않는다', /goApply[\s\S]{0,600}confirm\(/.test(HTML));
check('EN 화면에서도 읽히게 새 UI 에 data-en 이 붙어 있다',
  /class="fs-t" data-ko="[^"]+" data-en="/.test(HTML) && /data-en="Start writing with this outline"/.test(HTML));
/* ⚠️ 아이콘만 있는 버튼이 아니라 «글자 버튼» 이므로 data-ko/data-en 이 맞다.
   아이콘 버튼에 그 둘을 달면 textContent 가 통째로 갈려 문장이 들어앉는다(CLAUDE.md 2장). */
check('오가나이저 라벨은 글자 흐름을 flex 로 쪼개지 않는다',
  !/\.go-q-label\s*\{[^}]*display:\s*flex/.test(HTML) && !/\.go-part-b\s*\{[^}]*display:\s*flex/.test(HTML));
check('긴 글은 «고쳐진 문장만» 따라 쓰게 한다', /function pickRewriteTarget/.test(HTML) && /_lastCorrected = rwTarget/.test(HTML));
check('문장 나누기에 lookbehind 를 쓰지 않는다 (구형 사파리)', !/\(\?<=/.test(HTML));

/* ═══════════════════════════════════════════════════════════════════
   [C] 어휘 업그레이드 — 서버 검증부를 오려 내 «실제로» 돌린다
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[C] 🔴 어휘 업그레이드 검증부(api-ai.ts)를 오려 내 실행');
check('프롬프트가 어휘 업그레이드를 요구한다', /vocabulary upgrades/.test(API) && /"upgrades": \[\{"from"/.test(API));
check('첨삭 응답·저장에 upgrades 가 함께 나간다',
  /corrected, score, issues, tip, reply, upgrades, level,/.test(API) && /issues, tip, reply, upgrades, mission_words/.test(API));
check('화면이 upgrades 를 그린다 (결과 + 복습 모달)',
  /d\.upgrades \|\| \[\]/.test(HTML) && /feedback\.upgrades \|\| \[\]/.test(HTML));

const upSrc = (API.match(/const upgrades = \(Array\.isArray\(parsed\.upgrades\)[\s\S]*?\.slice\(0, 3\);/) || [])[0] || '';
check('업그레이드 검증부를 오려 냈다', upSrc.length > 100);
if (upSrc) {
  const runUp = new Function('text', 'parsed',
    'const _lowText = text.toLowerCase();\n' + upSrc.replace(/: any/g, '') + '\nreturn upgrades;');
  const T = 'I have many thing in my room and a bad man took my bag.';
  const got = runUp(T, { upgrades: [
    { from: 'thing', to: 'property', why: '소유물을 뜻하는 어른스러운 단어예요.' },
    { from: 'unicorn', to: 'stallion', why: '원문에 없는 단어' },
    { from: 'bad man', to: '도둑', why: '한글이 섞임' },
    { from: 'bag', to: 'bag', why: '같은 단어' },
    { from: 'room', to: 'chamber', why: '' },
  ] });
  eq('원문에 있는 말만 남는다 (건수)', got.length, 2);
  check('정상 업그레이드는 그대로 통과', got[0] && got[0].from === 'thing' && got[0].to === 'property');
  check('원문에 없는 단어(unicorn)는 버린다', !got.some(u => u.from === 'unicorn'));
  check('to 에 한글이 섞이면 버린다', !got.some(u => HANGUL.test(u.to)));
  check('from 과 to 가 같으면 버린다', !got.some(u => u.from === u.to));
  check('이유가 비면 기본 문구를 채운다', !!(got[1] && got[1].why && got[1].why.length > 3), JSON.stringify(got[1]));
  // ⚠️ to 는 «따라 쓸 영어» 라 숫자도 안 받는다 — 검사 데이터에 숫자를 넣지 말 것
  const many = runUp('a b c d e f', { upgrades: 'abcdef'.split('').map(c => ({ from: 'a', to: 'alpha' + c, why: 'x' })) });
  check('최대 3건까지만 내보낸다', many.length === 3, String(many.length));
  check('upgrades 가 없어도 안전하다 (빈 배열)', runUp('hello', {}).length === 0);
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 브레인스토밍 파이프라인 전체 통과 — 한글이 영어 칸에 안 섞이고, 지어낸 어휘 업그레이드가 안 나간다.');
