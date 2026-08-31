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
//     ⑥ 🔴 시작 문장과 답이 «둘 다 전치사» 여도 겹치지 않는다 —
//        2026-08-31 사장님 화면에 「I was at in my house.」 가 그대로 찍혔다.
//        (같은 낱말만 보던 앞의 검사가 at + in 을 못 잡았다.)
//     ⑦ 🔗 주제 목록이 셋(그림·글감·이야기)인데 «가는 길» 은 하나다 —
//        그림·글감을 눌러도 브레인스토밍이 그 주제로 열린다. 예전의 «한 줄만 넣기» 는
//        「질문 없이 바로 쓰기」로 남아 있다.
//
//   ⚠️ 이 하니스는 «값» 만 본다. 「눌러서 진짜 그렇게 되는가」는 브라우저로 봐야 한다:
//        PW_DIR=/tmp/pw node test-harness/manual/ai-write-brainstorm-browser.mjs
//
//   실행: node test-harness/ai_write_brainstorm_harness.mjs
import { readFileSync, existsSync, statSync } from 'fs';
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
  cut(/const PIC_SCENES = \[[\s\S]*?\n    \];/, 'PIC_SCENES'),
  cut(/const TOPICS = \[[\s\S]*?\n    \];/, 'TOPICS'),
  cut(/const GO_BASE = \[[\s\S]*?\n    \];/, 'GO_BASE'),
  cut(/const GO_SCENE_Q = \[[\s\S]*?\n    \];/, 'GO_SCENE_Q'),
  cut(/const GO_TOPIC_Q = \[[\s\S]*?\n    \];/, 'GO_TOPIC_Q'),
  cut(/const GO_THEMES = \[[\s\S]*?\n    \];/, 'GO_THEMES'),
  cut(/const GO_PARTS = \[[\s\S]*?\n    \];/, 'GO_PARTS'),
  cut(/const GO_PREP = [^\n]+\n/, 'GO_PREP'),
  cut(/const goHasKo = [^\n]+\n/, 'goHasKo'),
  cut(/const goIsEn  = [^\n]+\n/, 'goIsEn'),
  cut(/function goThemeFromScene\(idx\) \{[\s\S]*?\n    \}/, 'goThemeFromScene'),
  cut(/function goThemeFromTopic\(idx\) \{[\s\S]*?\n    \}/, 'goThemeFromTopic'),
  cut(/function goQuestions\(\) \{[\s\S]*?\n    \}/, 'goQuestions'),
  cut(/function goLineFor\(q\) \{[\s\S]*?\n    \}/, 'goLineFor'),
  cut(/function goOutline\(\) \{[\s\S]*?\n    \}/, 'goOutline'),
].join('\n');

// theme: 'lost' 같은 문자열 · {pic:i}(오늘의 그림) · {topic:i}(오늘의 글감) · null
let RUN = null;
if (SRC.length > 800) {
  RUN = new Function('theme', 'answers',
    'let _goAnswers = answers || {};\n' + SRC +
    '\nlet _goTheme = typeof theme === "string" ? (GO_THEMES.find(t => t.id === theme) || null)' +
    ' : (theme && theme.pic !== undefined) ? goThemeFromScene(theme.pic)' +
    ' : (theme && theme.topic !== undefined) ? goThemeFromTopic(theme.topic) : null;' +
    '\nreturn { out: goOutline(), qs: goQuestions(), theme: _goTheme, topics: TOPICS, scenes: PIC_SCENES };');
  check('뼈대 생성기가 실행된다', Array.isArray(RUN('lost', {}).out.parts));
}
const outline = RUN ? ((t, a) => RUN(t, a).out) : null;
const meta_topics = RUN ? RUN(null, {}).topics : [];

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

  /* ⑤ 🔴 전치사 겹침 — 2026-08-31 사장님 화면 「I was at in my house.」
     ⚠️ 이 검사를 지우면 그 문장이 그대로 되살아난다. */
  const prep = a => outline('bday', { where: a }).parts[0].lines.map(l => l.en).slice(-1)[0];
  eq('⑤ 「I was at 」 + 「in my house」', prep('in my house'), 'I was in my house.');
  eq('⑤ 「I was at 」 + 「on the beach」', prep('on the beach'), 'I was on the beach.');
  eq('⑤ 전치사가 하나뿐이면 그대로', prep('at the park'), 'I was at the park.');
  eq('⑤ 전치사가 없으면 시작 문장 그대로', prep('my house'), 'I was at my house.');

  /* ⑤-2 🔴 2026-08-31 «문법 전수검사»(13,344 조합)에서 잡은 세 가지.
     되돌리면 아이들이 따라 쓸 문장이 비문이 된다. */
  const line1 = (theme, k, a) => {
    const o = RUN(theme, { [k]: a }).out;
    return o.parts.flatMap(p2 => p2.lines.map(l => l.en)).filter(Boolean).slice(-1)[0] || '';
  };
  // ① «답이 이미 시작 문장으로 시작하는가» 를 부분문자열로 보면 주어가 사라진다
  //    starter 「I 」 + 「in my house」 → 「in my house.」(주어 없음) 였다
  check('⑤-2 시작 문장 판정은 낱말 경계로 (주어가 사라지지 않는다)',
    /^I\b/.test(line1('proud', 'what', 'in my house')), line1('proud', 'what', 'in my house'));
  check('⑤-2 답이 진짜로 시작 문장을 포함하면 겹쳐 쓰지 않는다',
    line1('lost', 'what', 'I lost my watch') === 'I lost my watch.', line1('lost', 'what', 'I lost my watch'));
  // ② 시작 문장이 관사로 끝나면 「a at the park」·「a an elephant」 가 된다 → 관사는 학생이 쓴다
  check('⑤-2 글감 시작 문장이 관사(a/an)로 끝나지 않는다',
    !meta_topics.some(t => /\b(a|an)\s$/.test(t.starter)),
    meta_topics.filter(t => /\b(a|an)\s$/.test(t.starter)).map(t => t.ko).join(','));
  // ③ 학생이 소문자로 적은 답을 그대로 쓸 때 문장 첫 글자가 소문자로 남았다
  check('⑤-2 문장 첫 글자는 대문자',
    /^M/.test(line1({ topic: meta_topics.findIndex(t => t.starter === 'My school is ') }, 'what', 'my school is big')),
    line1({ topic: meta_topics.findIndex(t => t.starter === 'My school is ') }, 'what', 'my school is big'));

  /* ⑥ 🔗 그림·글감에서 온 주제 — 목록은 셋이어도 뼈대는 같은 규칙으로 만들어진다 */
  const pic = RUN({ pic: 3 }, { where: 'a jungle', who: 'a lion', what: 'the elephant walked to me', how: 'we ran away' });
  check('⑥ 그림 주제는 장면용 5문항 (언제는 묻지 않는다)',
    pic.qs.map(q => q.k).join(',') === 'where,who,what,why,how', pic.qs.map(q => q.k).join(','));
  check('⑥ 그림 주제의 첫 문장 = 그 장면의 시작 문장',
    pic.out.text.indexOf('In the jungle, I saw many animals.') === 0, pic.out.text.slice(0, 60));
  check('⑥ 그림 주제도 3문단', pic.out.text.split('\n\n').length === 3);
  check('⑥ 그림 주제에 «어디서 왔는지» 가 붙는다', pic.theme.srcKo === '오늘의 그림' && pic.theme.icon === '🖼');

  const top = RUN({ topic: 0 }, { what: 'pizza', more: 'I eat it every Friday', why: 'it tastes good', how: 'happy' });
  check('⑦ 글감 주제는 4문항 (사건이 아니라 이야기 하나)',
    top.qs.map(q => q.k).join(',') === 'what,more,why,how', top.qs.map(q => q.k).join(','));
  check('⑦ 글감의 시작 문장을 첫 질문이 그대로 쓴다',
    top.out.text.indexOf('My favorite food is pizza.') === 0, top.out.text.slice(0, 60));
  check('⑦ 글감 주제도 3문단', top.out.text.split('\n\n').length === 3);

  /* ⑧ 한글 답은 그림·글감에서도 글에 안 들어간다 (빈 줄도 남기지 않는다) */
  const koPic = RUN({ pic: 3 }, { who: '사자' }), koTop = RUN({ topic: 0 }, { what: '피자', why: '맛있어서' });
  check('⑧ 그림 주제 — 한글 답이 뼈대 글에 없다', !HANGUL.test(koPic.out.text), koPic.out.text);
  check('⑧ 글감 주제 — 한글 답이 뼈대 글에 없다', !HANGUL.test(koTop.out.text), koTop.out.text);
  check('⑧ 한글 답은 메모로 남는다',
    koTop.out.parts.some(p => p.lines.some(l => l.memo === '피자')));
  check('⑧ 빈 줄로 시작하거나 끝나지 않는다',
    !/^\n|\n\n\n|\n$/.test(koTop.out.text), JSON.stringify(koTop.out.text));

  /* ⑨ 문단 배치는 «질문 자신» 이 안다 — 목록을 두 벌로 적으면 곧 어긋난다 */
  check('⑨ 모든 질문에 문단 번호(p)가 있다',
    [RUN('lost', {}), pic, top].every(r => r.qs.every(q => q.p === 0 || q.p === 1 || q.p === 2)));
  check('⑨ GO_PARTS 에는 질문 목록(keys)이 없다', !/const GO_PARTS[\s\S]{0,400}keys:/.test(HTML));
}

/* ═══════════════════════════════════════════════════════════════════
   [A-2] 🖼 오늘의 그림 · 🎲 오늘의 글감 — 목록과 «실물 파일» 이 짝인가
   🔴 그림 항목만 늘리고 파일을 안 넣으면 그 날짜에 걸린 학생은 «빈 카드» 를 본다.
      에러도 안 나고(사진만 안 뜸) 화면 코드도 멀쩡하므로 여기서 파일을 직접 센다.
   ═══════════════════════════════════════════════════════════════════ */
console.log('\n[A-2] 🖼 그림·🎲 글감 목록 ↔ 실물 파일');
{
  const scenes = [...(HTML.match(/const PIC_SCENES = \[[\s\S]*?\n    \];/) || [''])[0]
    .matchAll(/\{ img:'([a-z-]+)',\s*bg:'(#[0-9a-f]{6})',\s*ko:'([^']*)',\s*en:'([^']*)',\s*starter:'([^']*)'/g)]
    .map(m => ({ img: m[1], bg: m[2], ko: m[3], en: m[4], starter: m[5] }));
  const topics = [...(HTML.match(/const TOPICS = \[[\s\S]*?\n    \];/) || [''])[0]
    .matchAll(/\{ ko: '([^']*)', en: '([^']*)', starter: '([^']*)' \}/g)]
    .map(m => ({ ko: m[1], en: m[2], starter: m[3] }));

  // 2026-08-31 사장님 지시로 각각 20개씩 늘렸다. 아래로 다시 줄이면 그때 판단이 사라진다.
  check(`🖼 그림이 30개 이상 (지금 ${scenes.length}개)`, scenes.length >= 30, String(scenes.length));
  check(`🎲 글감이 30개 이상 (지금 ${topics.length}개)`, topics.length >= 30, String(topics.length));

  const missing = scenes.filter(s2 => !existsSync(join(root, 'cloudflare-deploy/public/img/write-scenes', s2.img + '.webp')));
  check('🔴 그림 항목마다 실물 webp 파일이 있다', missing.length === 0, missing.map(m => m.img).join(','));

  const tooBig = scenes.filter(s2 => {
    const f = join(root, 'cloudflare-deploy/public/img/write-scenes', s2.img + '.webp');
    return existsSync(f) && statSync(f).size > 400 * 1024;      // 필리핀 회선 — 한 장 400KB 넘기지 않는다
  });
  check('그림 한 장이 400KB 를 넘지 않는다', tooBig.length === 0, tooBig.map(x => x.img).join(','));

  const dupImg = scenes.map(x => x.img).filter((v, i, a) => a.indexOf(v) !== i);
  check('그림 파일 이름이 겹치지 않는다', dupImg.length === 0, dupImg.join(','));

  /* 🔴 starter 는 브레인스토밍 서론의 «첫 줄» 로 그대로 들어간다(goThemeFromScene 의 open).
     미완성 문장이면 뼈대 첫 줄이 「I went to the」 처럼 끊긴 채로 학생 글에 박힌다. */
  const badStarter = scenes.filter(x => !/[.!?]\s*$/.test(x.starter));
  check('🖼 그림 starter 는 «완성된 한 문장» 이다', badStarter.length === 0, badStarter.map(x => x.img).join(','));
  const badScene = scenes.filter(x => !x.ko || !x.en || !x.bg);
  check('🖼 그림마다 ko·en·대표색이 다 있다', badScene.length === 0, badScene.map(x => x.img).join(','));

  /* 글감 starter 는 반대로 «이어 쓰는 조각» 이라 공백으로 끝나야 한다
     (goThemeFromTopic 이 첫 질문의 시작 문장으로 그대로 쓴다). */
  const badTopic = topics.filter(t => !t.en || !/ $/.test(t.starter));
  check('🎲 글감마다 영어 이름이 있고 starter 가 공백으로 끝난다', badTopic.length === 0, badTopic.map(t => t.ko).join(','));
  const dupTopic = topics.map(t => t.ko).filter((v, i, a) => a.indexOf(v) !== i);
  check('🎲 글감 이름이 겹치지 않는다', dupTopic.length === 0, dupTopic.join(','));

  // ⚠️ Win10 두부 방지 — 이모지는 Unicode 12 이하만 (CLAUDE.md 1-4)
  const cp13 = [...scenes.map(x => x.ko + x.en).join(''), ...topics.map(t => t.ko + t.en).join('')]
    .filter(c => c.codePointAt(0) >= 0x1FA70);
  check('Unicode 13 이상 이모지를 쓰지 않았다', cp13.length === 0, cp13.join(' '));
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
/* 🔗 주제 목록 셋이 한 길로 모인다 — 화면 배선 */
check('🔗 그림 「이 장면으로 쓰기」가 브레인스토밍을 연다', /window\.usePicPrompt[\s\S]{0,400}goSelectScene\(_picIdx\)/.test(HTML));
check('🔗 글감 칩이 브레인스토밍을 연다', /chip\.onclick = \(\) => \{ try \{ goSelectTopic\(i\)/.test(HTML));
check('🔗 예전 동작(시작 문장 한 줄)은 «질문 없이 바로 쓰기» 로 남아 있다',
  /window\.goSkipToWrite/.test(HTML) && /질문 없이 바로 쓰기/.test(HTML));
check('🔗 «지금 주제» 표시줄이 어디서 온 주제인지 말한다',
  /go-cur-src/.test(HTML) && /goClearTheme/.test(HTML));
check('🔗 글감 칩도 EN 에서 영어로 보인다 (TOPICS 에 en)',
  /\{ ko: '🍕 내가 좋아하는 음식', en: '/.test(HTML) && /chip\.setAttribute\('data-en'/.test(HTML));
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
  const T = 'I have many thing in my room and a bad man took my bag and my old cup.';
  const got = runUp(T, { upgrades: [
    { from: 'thing', to: 'property', why: '소유물을 뜻하는 어른스러운 단어예요.' },
    { from: 'unicorn', to: 'stallion', why: '원문에 없는 단어예요.' },
    { from: 'bad man', to: '도둑', why: '한글이 섞였어요.' },
    { from: 'bag', to: 'bag', why: '같은 단어예요.' },
    { from: 'room', to: 'chamber', why: '' },                 // 이유 없음 → 버린다
    { from: 'old', to: 'ancient', why: 'more natural' },       // 영어 이유 → 버린다
    { from: 'cup', to: 'mug', why: '자연스러움' },              // 6자 미만 → 버린다
  ] });
  eq('걸러 내고 남는 건수', got.length, 1);
  check('정상 업그레이드는 그대로 통과', got[0] && got[0].from === 'thing' && got[0].to === 'property');
  check('원문에 없는 단어(unicorn)는 버린다', !got.some(u => u.from === 'unicorn'));
  check('to 에 한글이 섞이면 버린다', !got.some(u => HANGUL.test(u.to)));
  check('from 과 to 가 같으면 버린다', !got.some(u => u.from === u.to));
  /* 🔤 [2026-08-31 · A안] 이유가 비면 **기본 문구로 채우지 않고 그 항목을 버린다**.
     운영 D1 실측에서 실제로 나온 업그레이드 1건의 why 가 서버 폴백 문구 그대로였다
     (모델이 why 를 비워 보냄 — 교정 이유가 21/21 폴백이던 것과 같은 패턴).
     어휘 «왜» 는 의미 판단이라 결정론으로 만들 수 없으므로 지어내는 대신 버린다. */
  check('⛔ 이유가 비면 그 항목을 버린다 (기본 문구를 채우지 않는다)',
    !got.some(u => u.from === 'room'), JSON.stringify(got));
  check('⛔ 영어로만 쓴 이유는 버린다', !got.some(u => u.from === 'old'));
  check('⛔ 너무 짧은 이유(6자 미만)는 버린다', !got.some(u => u.from === 'cup'));
  check('⛔ 옛 폴백 문구가 소스에 남아 있지 않다', !/더 자연스럽고 어른스러운 표현이에요/.test(upSrc), upSrc.slice(0, 0));
  check('남은 항목의 이유는 전부 한국어 6자 이상',
    got.every(u => /[가-힣]/.test(u.why) && u.why.length >= 6));
  // ⚠️ to 는 «따라 쓸 영어» 라 숫자도 안 받는다 — 검사 데이터에 숫자를 넣지 말 것
  const many = runUp('a b c d e f', { upgrades: 'abcdef'.split('').map(c => ({ from: 'a', to: 'alpha' + c, why: '더 자연스러운 표현이에요.' })) });
  check('최대 3건까지만 내보낸다', many.length === 3, String(many.length));
  check('upgrades 가 없어도 안전하다 (빈 배열)', runUp('hello', {}).length === 0);

  /* 되돌리면 FAIL — 게이트를 빼면 이유 없는 항목이 그대로 학생 화면으로 나간다 */
  const mutated = upSrc.replace(/\/\[가-힣\]\/\.test\(u\.why\) && u\.why\.length >= 6 &&/, '');
  check('변이 대상이 소스에 있다 (why 게이트)', mutated !== upSrc);
  if (mutated !== upSrc) {
    const runBad = new Function('text', 'parsed',
      'const _lowText = text.toLowerCase();\n' + mutated.replace(/: any/g, '') + '\nreturn upgrades;');
    const bad = runBad(T, { upgrades: [{ from: 'room', to: 'chamber', why: '' }] });
    check('되돌리면 깨진다: 이유 없는 항목이 통과한다', bad.length === 1, JSON.stringify(bad));
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n❌ 실패:'); FAILS.forEach(f => console.log('   - ' + f)); process.exit(1); }
console.log('\n🎉 브레인스토밍 파이프라인 전체 통과 — 한글이 영어 칸에 안 섞이고, 지어낸 어휘 업그레이드가 안 나간다.');
