// 👁 자막 3단계 + 📖 뜻 보기 하니스 — 2026-08-07
//   배경: 경쟁사(클라우봇) 벤치마킹에서 «대화 자막 표시/숨김»이 우리에게 없다는 지적이 나왔다.
//         그런데 실제로 더 큰 구멍은 «뜻을 볼 길이 없다» 였다 — 모르는 문장을 만나면 대화가
//         그 자리에서 끊긴다. 그래서 둘을 반드시 함께 넣었다.
//
//   이 하니스가 고정하는 것(=다시 깨지면 안 되는 것):
//     ① 가리는 것은 AI 말풍선뿐이다. 학생이 자기가 쓴 말은 절대 가려지지 않는다.
//     ② ⛔ 어느 단계에서도 «다시 보는 길»이 반드시 있다.
//        (녹화 끄기 사고와 같은 모양 — 끄기만 있고 켜기가 없으면 학생은 나갈 수밖에 없다)
//        - CSS 의 감춤 규칙은 전부 :not(.sub-shown) 을 달고 있어야 하고
//        - 그 sub-shown 을 실제로 붙여 주는 클릭 배선이 있어야 하고
//        - «완전 끄기»는 빈 말풍선이 아니라 안내(.sub-veil)를 남겨야 한다
//        - «가리기»도 마찬가지다. 흐린 글자만 남으면 «글자가 잘 안 나온다»=고장 으로 읽힌다
//          (2026-08-31 실제 제보). 그래서 .sub-hint 로 «왜 흐린지 + 눌러서 보기»를 말풍선이 직접 말한다.
//          그 안내는 반드시 흐림 대상 «밖»에 있어야 한다 — 같이 흐려지면 없는 것과 같다
//        - 설정 줄이 접혀 있어도 지금 자막이 꺼져 있다는 표시가 보여야 한다(ai-friend ⚙ 요약)
//     ③ 감춤은 filter/display 로만 한다. opacity+transition 금지 —
//        백그라운드 탭·저전력 모드에서 transition 이 멈추면 영영 안 보인다(CLAUDE.md 함정).
//     ④ 뜻 보기는 /api/translate 에 target:'ko' 로 묻고, 그 경로가 index.ts 게이트에 등록돼 있다.
//        (등록 안 하면 본문 없는 404 가 되어 «눌러도 아무 일도 안 남»이 된다)
//     ⑤ speech-coach 는 «보고 읽으라고 있는 문장»이라 자막 가리기를 넣지 않는다 — 뜻 보기만.
//     ⑥ CSS 주석에 CJK 홑낫표를 쓰지 않는다(한자 폰트 983KB 유발 — admin_lazyload_harness 와 같은 규칙).
//
//   실행: node test-harness/subtitle_meaning_harness.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const P = (...p) => join(__dirname, '..', 'cloudflare-deploy', ...p);
const read = (f) => readFileSync(f, 'utf8');

const aif = read(P('public', 'ai-friend.html'));
const wup = read(P('public', 'warmup.html'));
const spc = read(P('public', 'speech-coach.html'));
const idx = read(P('src', 'index.ts'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? '  →  ' + JSON.stringify(extra) : '')); }
}
const styleOf = (t) => (t.match(/<style[\s\S]*?<\/style>/gi) || []).join('\n');

/* ─────────────────────────────────────────────────────────────
   1. 자막 3단계가 실제로 세 단계인가 (ai-friend · warmup)
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ① 자막 3단계 — 보이기 / 가리기 / 완전 끄기 ]');

for (const [name, t, sel] of [['ai-friend', aif, 'data-sub'], ['warmup', wup, 'data-s']]) {
  const modes = ['on', 'blur', 'off'].filter(m => new RegExp(sel + '="' + m + '"').test(t));
  check(`${name}: 세 단계가 모두 있다 (${modes.join('/') || '없음'})`, modes.length === 3, modes);
}
// «가리기»가 실제로 중간 단계인가 — blur 가 감춤이되 완전 삭제가 아니어야 한다
check('ai-friend: 가리기는 blur(흐림)이고 display:none 이 아니다',
  /\[data-sub="blur"\][\s\S]{0,200}?filter:\s*blur\(/.test(styleOf(aif))
  && !/\[data-sub="blur"\][^{]*\{[^}]*display:\s*none/.test(styleOf(aif)));
check('warmup: 가리기는 blur(흐림)이고 display:none 이 아니다',
  /\[data-sub="blur"\][\s\S]{0,200}?filter:\s*blur\(/.test(styleOf(wup))
  && !/\[data-sub="blur"\][^{]*\{[^}]*display:\s*none/.test(styleOf(wup)));

/* ─────────────────────────────────────────────────────────────
   2. ⛔ 되돌아올 길 — 이 절이 이 하니스의 핵심이다
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ② ⛔ 어느 단계에서도 «다시 보는 길»이 있는가 ]');

for (const [name, t] of [['ai-friend', aif], ['warmup', wup]]) {
  const css = styleOf(t);
  // 감추는 규칙(blur/off)을 전부 뽑아 하나하나 :not(.sub-shown) 을 달고 있는지 본다.
  //   하나라도 빠지면 그 상태에 갇힌 말풍선이 생긴다.
  const hideRules = (css.match(/^[^{}\n]*\[data-sub="(blur|off)"\][^{}]*\{[^}]*\}/gm) || []);
  const naked = hideRules.filter(r => !r.includes(':not(.sub-shown)'));
  check(`${name}: 감춤 규칙이 존재한다 (${hideRules.length}개)`, hideRules.length >= 2, hideRules.length);
  check(`${name}: 모든 감춤 규칙에 :not(.sub-shown) 탈출구가 달려 있다`, naked.length === 0, naked);
  // 그 sub-shown 을 실제로 붙여 주는 배선이 있는가 (CSS 만 있고 배선이 없으면 영영 못 연다)
  check(`${name}: 탭하면 sub-shown 을 붙이는 클릭 배선이 있다`,
    /classList\.toggle\(\s*['"]sub-shown['"]/.test(t) || /classList\.add\(\s*['"]sub-shown['"]/.test(t));
  // «완전 끄기»가 빈 말풍선이 되지 않게 안내를 남기는가
  check(`${name}: 완전 끄기에서 안내(.sub-veil)가 보인다`,
    /\[data-sub="off"\][^{]*\.sub-veil[^{]*\{[^}]*display:\s*(inline|block)/.test(css));
  check(`${name}: 안내 문구가 «탭하면 보인다»를 알려 준다`, /탭하면 보/.test(t));
  // «가리기»도 왜 흐린지 말해 줘야 한다 — 안 그러면 고장으로 읽힌다(2026-08-31 제보)
  check(`${name}: 가리기에서도 «왜 흐린지» 안내(.sub-hint)가 보인다`,
    /\[data-sub="blur"\][^{]*\.sub-hint[^{]*\{[^}]*display:\s*(inline|block)/.test(css)
    && /class="sub-hint"/.test(t));
  // 그 안내가 흐림 대상에 들어가 있으면 함께 흐려져 아무 소용이 없다
  const blurTargets = (css.match(/\[data-sub="blur"\][^{]*\{[^}]*filter:\s*blur\([^}]*\}/g) || []).join('\n');
  check(`${name}: 그 안내 자신은 흐림 대상이 아니다`, !/\.sub-hint/.test(blurTargets), blurTargets);
  check(`${name}: 안내가 눌러서 보는 길을 알려 준다`, /sub-hint[\s\S]{0,160}?눌러서 보기/.test(t));
  // 단계를 바꾸면 이전에 열어 둔 것들을 닫는가 (안 닫으면 가리기로 바꿔도 계속 보인다)
  check(`${name}: 단계를 바꾸면 이전 sub-shown 을 지운다`,
    /sub-shown[\s\S]{0,220}?classList\.remove\(\s*['"]sub-shown['"]/.test(t)
    || /remove\(\s*['"]sub-shown['"]/.test(t));
}
// 설정 줄이 접혀 있어도 «지금 꺼져 있다»가 보여야 한다 (ai-friend 는 .opts 가 기본 접힘)
check('ai-friend: .opts 는 기본으로 접혀 있다(전제 확인)',
  /body:not\(\.opts-open\)\s*\.opts/.test(styleOf(aif)));
check('ai-friend: 접힌 상태에서도 자막이 꺼져 있으면 ⚙ 요약에 표시된다',
  /opt\.active\[data-sub\]/.test(aif) && /dataset\.sub\s*!==\s*['"]on['"]/.test(aif));

/* ─────────────────────────────────────────────────────────────
   3. 가리는 대상 — AI 말풍선만. 내 말은 절대 가리지 않는다
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ③ 가리는 것은 AI 말풍선뿐인가 ]');

check('ai-friend: 감춤 선택자가 .ai-row 로 한정된다',
  (styleOf(aif).match(/\[data-sub="(blur|off)"\][^{]*\{/g) || []).every(s => s.includes('.ai-row')));
check('warmup: 감춤 선택자가 .msg.ai 로 한정된다',
  (styleOf(wup).match(/\[data-sub="(blur|off)"\][^{]*\{/g) || []).every(s => s.includes('.msg.ai')));
check('ai-friend: 내 말풍선(.msg.user)에는 감춤 규칙이 없다',
  !/\[data-sub="(blur|off)"\][^{]*\.msg\.user/.test(styleOf(aif)));
check('warmup: 내 말풍선(.msg.me)에는 감춤 규칙이 없다',
  !/\[data-sub="(blur|off)"\][^{]*\.msg\.me/.test(styleOf(wup)));
check('ai-friend: AI 본문이 .ai-text 로 감싸여 있다', /<span class="ai-text">/.test(aif));
check('warmup: AI 본문이 .wu-text 로 감싸여 있다', /<span class="wu-text">/.test(wup));

/* ─────────────────────────────────────────────────────────────
   4. 감추는 방법 — opacity+transition 금지
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ④ 감춤은 filter/display 로만 (백그라운드 탭에서 멈추는 transition 금지) ]');

for (const [name, t] of [['ai-friend', aif], ['warmup', wup]]) {
  const hide = (styleOf(t).match(/\[data-sub="(blur|off)"\][^{}]*\{[^}]*\}/g) || []).join('\n');
  check(`${name}: 감춤 규칙에 opacity 를 쓰지 않는다`, !/opacity\s*:/.test(hide), hide.match(/opacity[^;]*/g));
  check(`${name}: 감춤 규칙에 transition/animation 을 쓰지 않는다`,
    !/(transition|animation)\s*:/.test(hide), hide.match(/(transition|animation)[^;]*/g));
}

/* ─────────────────────────────────────────────────────────────
   5. 뜻 보기 — 세 화면 모두, 그리고 서버 경로가 실제로 열려 있는가
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ⑤ 뜻 보기 — 눌렀을 때만 부르고, 경로가 살아 있는가 ]');

for (const [name, t] of [['ai-friend', aif], ['warmup', wup], ['speech-coach', spc]]) {
  check(`${name}: 뜻 보기 버튼이 있다`, /mean-btn/.test(t));
  check(`${name}: /api/translate 에 target:'ko' 로 묻는다`,
    /\/api\/translate/.test(t) && /target:\s*['"]ko['"]/.test(t));
  check(`${name}: 실패해도 «가져오지 못했다»고 알려 준다(조용히 실패 금지)`, /가져오지 못했/.test(t));
  check(`${name}: 같은 문장을 두 번 부르지 않는다(화면 캐시)`, /_koCache/.test(t));
}
check('ai-friend: 뜻을 열면 가려진 말풍선도 함께 열린다(뜻 카드가 안 보이는 사고 방지)',
  /toggleMeaning[\s\S]{0,1800}?classList\.add\(\s*['"]sub-shown['"]/.test(aif));
check('warmup: 뜻을 열면 가려진 말풍선도 함께 열린다',
  /toggleMeaning[\s\S]{0,1800}?classList\.add\(\s*['"]sub-shown['"]/.test(wup));
// ⚠️ 새 API 가 아니라 기존 경로를 쓴다 — 그래도 게이트 등록 여부는 확인해야 «본문 없는 404»를 안 만난다
check("index.ts 게이트에 '/api/translate' 가 등록돼 있다", /path === '\/api\/translate'/.test(idx));

// 🗣️ (2026-08-24) 웜업 뜻 보기는 «의역» 모드로 묻는다 — 모드 없는 기본 경로(m2m100)가
//   "Let's warm up before class" 를 «수업 전에 따뜻하게하자» 로 직역한 제보가 출발점.
//   서버 learn 모드(언어모델 의역)와 화면의 mode:'learn' 은 짝이다 — 한쪽만 지우면 직역으로 돌아간다.
const mango = read(P('src', 'api-mango.ts'));
check("warmup: 뜻 보기를 mode:'learn' 으로 묻는다", /mode:\s*['"]learn['"]/.test(wup));
/* 🗣️ (2026-09-01) 고정 인사말의 의역 정본이 «서버» 로 옮겨졌다 — 화면(warmup.html)에도
   같은 정규식이 한 벌 있어서 「같은 판정이 두 곳」이던 것을 한 곳으로 모았다.
   ⛔ 이 검사를 다시 화면 쪽 `curatedMeaning` 으로 되돌리지 말 것. */
check('warmup: 고정 인사말은 손질한 의역을 쓴다 (정본은 서버 learn-phrase-ko.ts)',
  /export function curatedLearnMeaning/.test(read(P('src', 'learn-phrase-ko.ts')))
  && /입을 풀어/.test(read(P('src', 'learn-phrase-ko.ts')))
  && /curatedLearnMeaning\(t\)/.test(mango));
check('warmup: 화면이 «자기가 쓴 한국어» 는 미리 넣어 번역 요청 자체를 없앤다',
  /_koCache\[gEn\] = gKo/.test(wup));
check("서버: /api/translate 가 mode='learn' 을 안다", /b\.mode === 'learn'/.test(mango));
/* 🪤 (2026-09-01) 이 검사는 원래 `/trl1:/` 이었는데, 접두사를 trl2 로 올린 뒤에도
   «옛 접두사를 설명하는 주석» 의 글자에 걸려 계속 초록이었다 — 아무것도 보장하지 않는 상태였다.
   ✅ 주석을 벗겨 낸 «살아 있는 코드» 에서, learn 접두사가 기본(tr:)·chat(trc*) 과 다른지를 본다.
      번호는 앞으로도 올라가므로 숫자를 못 박지 않는다. */
const noComment = (t) => {
  let inBlock = false;
  return t.split('\n').map((l) => {
    let out = '', i = 0;
    while (i < l.length) {
      if (inBlock) { const e = l.indexOf('*/', i); if (e < 0) { i = l.length; } else { inBlock = false; i = e + 2; } continue; }
      const b = l.indexOf('/*', i), ln = l.indexOf('//', i);
      if (ln >= 0 && (b < 0 || ln < b)) { out += l.slice(i, ln); break; }
      if (b >= 0) { out += l.slice(i, b); inBlock = true; i = b + 2; continue; }
      out += l.slice(i); break;
    }
    return out;
  }).join('\n');
};
{
  const live = noComment(mango);
  const m = live.match(/learnMode \? '(tr[a-z]*\d*:)'/);
  check('서버: learn 모드 캐시 접두사가 «살아 있는 코드» 에 있고 기본·chat 과 다르다',
    !!m && m[1] !== 'tr:' && !m[1].startsWith('trc'), m ? `실제: ${m[1]}` : '못 찾음');
}

/* ─────────────────────────────────────────────────────────────
   6. speech-coach — 여긴 자막을 가리면 안 된다
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ⑥ speech-coach 는 «보고 읽는 문장»이라 가리지 않는다 ]');

check('speech-coach: 자막 감춤 규칙이 없다', !/data-sub=/.test(spc));
check('speech-coach: 읽을 문장(.target-text)은 그대로 보인다', /id="target-display"/.test(spc));
check('speech-coach: 문장이 바뀌면 열려 있던 뜻 카드를 닫는다',
  /closeTargetMeaning/.test(spc)
  && /function setTarget\([\s\S]{0,300}?closeTargetMeaning/.test(spc)
  && /oninput="[^"]*closeTargetMeaning/.test(spc));

/* ─────────────────────────────────────────────────────────────
   7. 잔소리 — 폰트·이모지 함정
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ⑦ 폰트·이모지 함정 ]');

for (const [name, t] of [['ai-friend', aif], ['warmup', wup], ['speech-coach', spc]]) {
  // <style> 안의 CJK 홑낫표 「」 하나만 있어도 한자 폰트 983KB 를 부른다
  const deco = (styleOf(t).match(/[「」『』]/g) || []).length;
  check(`${name}: <style> 안에 CJK 홑낫표가 없다`, deco === 0, deco);
  /* 국기 이모지는 Win10 이 못 그려서 알파벳 두 글자로 나온다.
     ⚠️ 파일 전체를 보지 않고 «이번에 넣은 자막/뜻 UI» 줄만 본다 —
        speech-coach 에는 예전부터 있던 국기(Phonics·BTS·SIU·중국어 카드)가 있고,
        그건 이 작업의 범위가 아니다. 여기서 같이 실패시키면 배포 게이트가 남의 코드로 막힌다. */
  const mine = t.split('\n').filter(l => /(mean-btn|sub-veil|sub-btns|ko-chip|data-sub|wu-text|ai-text)/.test(l)).join('\n');
  check(`${name}: 새로 넣은 자막/뜻 UI 에 국기 이모지가 없다`, !/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(mine));
}

/* ─────────────────────────────────────────────────────────────
   8. 역검증 — 기능을 도로 빼면 이 하니스가 «실제로» 실패하는가
        통과만 하는 하니스는 아무것도 지키지 않는다.
        ⚠️ git HEAD 와 비교하지 않는다 — 커밋하는 순간 HEAD 에 기능이 들어가서
           역검증이 스스로 무너진다(실제로 한 번 겪었다). 지금 소스에서 기능 줄을
           «걷어낸 합성본» 을 만들어 검사하면 커밋 여부와 무관하게 영원히 유효하다.
   ───────────────────────────────────────────────────────────── */
console.log('\n[ ⑧ 역검증 — 기능을 도로 빼면 검사가 실패하는가 ]');

// 자막·뜻 기능이 들어간 줄을 전부 걷어낸 «옛 버전» 을 만든다
const strip = (t) => t.split('\n')
  .filter(l => !/(data-sub|data-s="(on|blur|off)"|sub-shown|sub-veil|sub-btns|subVal|setSubMode|mean-btn|ko-chip|_koCache|ai-text|wu-text|toggleMeaning|fetchMeaning|toggleTargetMeaning|closeTargetMeaning|api\/translate)/.test(l))
  .join('\n');

// 이 하니스의 핵심 단언 4개를 함수로 묶어, 현재 소스와 합성 옛 소스 양쪽에 돌린다
const coreChecks = (t, css) => [
  /data-sub="blur"/.test(t) || /data-s="blur"/.test(t),   // 자막 단계가 있다
  /mean-btn/.test(t),                                      // 뜻 보기가 있다
  /\/api\/translate/.test(t),                              // 번역을 실제로 부른다
  /:not\(\.sub-shown\)/.test(css),                         // 되돌아올 길이 있다
];

for (const [name, t] of [['ai-friend', aif], ['warmup', wup]]) {
  const now = coreChecks(t, styleOf(t));
  const before = coreChecks(strip(t), styleOf(strip(t)));
  check(`${name}: 지금은 핵심 4개가 모두 참이다`, now.every(Boolean), now);
  check(`${name}: 기능을 빼면 핵심 4개가 모두 거짓이 된다(하니스가 진짜로 잡는다)`,
    before.every(v => v === false), before);
}
{
  const now = /mean-btn/.test(spc) && /\/api\/translate/.test(spc);
  const before = /mean-btn/.test(strip(spc)) || /\/api\/translate/.test(strip(spc));
  check('speech-coach: 지금은 뜻 보기가 있다', now);
  check('speech-coach: 기능을 빼면 사라진다', before === false);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fail}`);
console.log('─────────────────────────────────────────────');
process.exit(fail ? 1 : 0);
