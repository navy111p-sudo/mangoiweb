// -*- coding: utf-8 -*-
// 🧑‍🎓 수업 전 AI 웜업 — «연령대 · 대화 수준» 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/warmup_age_level_harness.mjs
//   대상:  cloudflare-deploy/src/warmup-audience.ts   (순수 모듈 — 직접 import 해서 돌린다)
//          cloudflare-deploy/src/index.ts             (배선 대조)
//          cloudflare-deploy/src/judgment-level.ts    (같은 말을 쓰는지 대조)
//          cloudflare-deploy/public/warmup.html       (화면 목록 · 시작 순서)
//
//   발단(2026-08-26 사장님 지시): 「웜업도 판단력 훈련처럼 연령·수준에 맞춰 대화하게,
//   그리고 난이도 설정이 «처음에» 나와서 먼저 고르고 시작하게」.
//   웜업은 페이지를 열자마자 AI 가 첫 질문을 던지는 구조라, 고르기 «전에» 대화가 시작되면
//   이미 엉뚱한 눈높이로 나간 첫 질문을 되돌릴 수 없다. 이 하니스가 지키는 것:
//     A. 연령대 축이 실제로 프롬프트를 바꾸는가(모듈을 돌려서 확인)
//     B. 화면 목록과 서버가 아는 값이 «짝» 인가
//        (CLAUDE.md 2장 「화면에서 골랐는데 그 값만 저장이 안 됨」 — 화면에만 늘리면 조용히 무시된다)
//     C. 두 화면(웜업·판단력)이 같은 Lv 을 같은 이름으로 부르는가
//     D. 설정 화면을 닫기 «전에» 첫 인사가 나가지 않는가
//     E. 수준 찾기가 서버를 부르지 않는가(첫 화면 지연 방지)
//   ⚠️ 문자열만 보는 검사로는 «순서»를 못 잡는다 — 그래서 A 는 모듈을 실제로 돌린다.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const P = (...a) => resolve(__dir, '../cloudflare-deploy', ...a);
const W = await import('file://' + P('src/warmup-audience.ts').replace(/\\/g, '/'));
const L = await import('file://' + P('src/judgment-level.ts').replace(/\\/g, '/'));
const IDX = readFileSync(P('src/index.ts'), 'utf8');
const HTML = readFileSync(P('public/warmup.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

console.log('\n[ A. 연령대 축 — 실제로 돌려서 확인 ]');
{
  check('연령대가 4종이다(유아·초등고학년/중·고등·성인)', W.WARMUP_AGE_IDS.length === 4);
  check('기본값은 초등 고학년·중학생(child)', W.DEFAULT_WARMUP_AGE === 'child');
  // ⚠️ 모르는 값을 «가장 어린 쪽»으로 떨어뜨리면 성인 수강생이 유아 취급을 받는다
  check('모르는 값·빈 값은 기본값으로 떨어진다(가장 어린 쪽 아님)',
    ['', null, undefined, 'grown-up', 0, true].every((v) => W.normalizeWarmupAge(v) === 'child'));
  check('대소문자·공백을 흘려 보내지 않는다', W.normalizeWarmupAge('  ADULT ') === 'adult');
  const lines = W.WARMUP_AGE_IDS.map((id) => W.warmupAgeLine(id));
  check('연령대마다 «서로 다른» 지시가 나온다', new Set(lines).size === 4);
  check('모든 지시가 [연령대] 표지로 시작한다', lines.every((l) => l.startsWith('[연령대]')));
  // 실제로 겪은 어긋남: 성인에게 학교·선생님 이야기, 유아에게 진로·시험 이야기
  check('성인에게는 아동용 소재를 금지한다', /학교 숙제|선생님/.test(W.warmupAgeLine('adult')));
  check('유아에게는 시험·진로·직장을 금지한다', /시험|진로|직장/.test(W.warmupAgeLine('kid')));
  check('고등학생은 유치한 소재를 피하라고 적혀 있다', /유치한/.test(W.warmupAgeLine('teen')));
}

console.log('\n[ B. 화면 목록 ↔ 서버가 아는 값 — 「짝」 이어야 한다 ]');
// 화면(warmup.html)의 AGE_CATALOG id 를 그대로 뽑아 서버 목록과 «순서까지» 맞춘다
const ageBlock = (HTML.match(/var AGE_CATALOG\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
const htmlAges = [...ageBlock.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
check('화면 연령대 목록을 읽었다', htmlAges.length === 4, `읽은 값: ${htmlAges.join(',')}`);
check('화면 목록 == 서버 WARMUP_AGE_IDS (순서 포함)',
  htmlAges.join(',') === W.WARMUP_AGE_IDS.join(','), `${htmlAges.join(',')} vs ${W.WARMUP_AGE_IDS.join(',')}`);
// 대화 수준 1~8 — 화면 목록과 서버 WARMUP_LEVELS 키가 같아야 한다
const lvBlock = (HTML.match(/var LEVEL_CATALOG\s*=\s*\[([\s\S]*?)\n\];/) || [])[1] || '';
const htmlLevels = [...lvBlock.matchAll(/\{n:\s*(\d)/g)].map((m) => Number(m[1]));
const srvBlock = (IDX.match(/const WARMUP_LEVELS: Record<number, string> = \{([\s\S]*?)\n\};/) || [])[1] || '';
const srvLevels = [...srvBlock.matchAll(/^\s*(\d):\s*"/gm)].map((m) => Number(m[1]));
check('화면 수준 목록을 읽었다', htmlLevels.length === 8, `읽은 값: ${htmlLevels.join(',')}`);
check('서버 WARMUP_LEVELS 를 읽었다', srvLevels.length === 8, `읽은 값: ${srvLevels.join(',')}`);
check('화면 수준(1~8) == 서버가 아는 수준(1~8)',
  htmlLevels.join(',') === srvLevels.join(','), `${htmlLevels.join(',')} vs ${srvLevels.join(',')}`);

console.log('\n[ C. 웜업과 판단력 훈련이 같은 Lv 을 같은 이름으로 부르는가 ]');
{
  const norm = (s) => String(s).replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
  const names = [...lvBlock.matchAll(/ko:\s*'([^']+)'/g)].map((m) => m[1]);
  const lvs = [...lvBlock.matchAll(/lv:\s*'([^']+)'/g)].map((m) => m[1]);
  check('화면 수준 이름 8개를 읽었다', names.length === 8);
  check('이름이 판단력 훈련(BAND_SPECS)과 같다',
    names.join(',') === L.BAND_SPECS.map((b) => b.nameKo).join(','),
    `${names.join(',')} vs ${L.BAND_SPECS.map((b) => b.nameKo).join(',')}`);
  check('교재 Lv 구간이 판단력 훈련과 같다',
    lvs.map(norm).join(',') === L.BAND_SPECS.map((b) => norm(L.bandLabel(b.band))).join(','),
    `${lvs.map(norm).join(',')} vs ${L.BAND_SPECS.map((b) => norm(L.bandLabel(b.band))).join(',')}`);
}

console.log('\n[ D. 서버 배선 — 받은 연령대가 프롬프트까지 가는가 ]');
{
  check('index.ts 가 warmup-audience 를 불러온다', /from '\.\/warmup-audience'/.test(IDX));
  const chat = (IDX.match(/async function handleWarmupChat[\s\S]*?\n\}\n/) || [''])[0];
  check('대화(handleWarmupChat)가 age_group 을 읽는다', /normalizeWarmupAge\(body && body\.age_group\)/.test(chat));
  check('대화 프롬프트에 연령대 줄이 들어간다', /sys \+= ' ' \+ warmupAgeLine\(/.test(chat));
  const qs = (IDX.match(/async function handleWarmupQuestions[\s\S]*?\n\}\n/) || [''])[0];
  check('추가질문(handleWarmupQuestions)도 age_group 을 읽는다', /normalizeWarmupAge\(body\.age_group\)/.test(qs));
  check('추가질문 프롬프트에도 연령대 줄이 들어간다', /warmupAgeLine\(ageGroup\)/.test(qs));
  // 난이도와 «독립» 인 축이어야 한다 — 하나로 묶으면 「성인인데 유아 문장」이 생긴다
  check('연령대가 난이도(WARMUP_LEVELS)를 덮어쓰지 않는다',
    /if \(ctxDifficulty\) sys \+= ` \[난이도\] \$\{WARMUP_LEVELS\[ctxDifficulty\]\}`/.test(chat));
}

console.log('\n[ E. 화면 — 고르기 전에는 대화가 시작되지 않는가 ]');
{
  // 🔴 이 검사가 이 하니스의 핵심이다. 예전에는 즉시실행(IIFE)이라 페이지를 여는 순간 첫 질문이 나갔다.
  check('첫 인사가 즉시실행(IIFE)이 아니다', !/\(async function initGreeting\(\)\{/.test(HTML.replace(/\s/g, '')) );
  check('첫 인사는 이름 있는 함수다', /async function initGreeting\(\)\s*\{/.test(HTML));
  check('시작 버튼(startWarmup)만 첫 인사를 부른다',
    /function startWarmup\(\)\{[\s\S]{0,600}initGreeting\(\)/.test(HTML.replace(/\n/g, '')));
  check('부팅이 설정 화면을 먼저 연다', /function bootWarmup\(\)[\s\S]{0,300}openSetup\(false\)/.test(HTML));
  check('?setup=0 으로 건너뛸 수 있다', /Q\.get\('setup'\)[\s\S]{0,60}startWarmup\(\)/.test(HTML));
  check('설정 화면 · 시작 버튼이 있다', /id="wuSetup"/.test(HTML) && /id="wusStart"/.test(HTML));
  check('연령·수준 목록 자리가 있다', /id="wusAges"/.test(HTML) && /id="wusLevels"/.test(HTML));
  // ⚠️ 작성자 CSS 가 display 를 정하면 브라우저 기본 [hidden]{display:none} 을 이긴다(CLAUDE.md 2장)
  check('[hidden] 이 이기도록 못 박아 두었다', /\.wu-setup\[hidden\]\{display:none !important\}/.test(HTML));
  check('매 요청에 연령대와 난이도를 함께 보낸다',
    /body\.difficulty = _warmLevel/.test(HTML) && /body\.age_group = _warmAge/.test(HTML));
  check('⋮ 메뉴에서 언제든 다시 고를 수 있다', /openSetup\(true\)/.test(HTML) && /id="ageBtns"/.test(HTML));
  check('연령대를 골라 두면 다음에도 그대로다', /localStorage\.setItem\('mangoi_warmup_age'/.test(HTML));
}

console.log('\n[ F. 🎯 수준 찾기 — 서버를 부르지 않고 3문항으로 끝나는가 ]');
{
  const probe = (HTML.match(/function startProbe\(\)[\s\S]*?function finishProbe\(\)[\s\S]*?\n\}/) || [''])[0];
  check('수준 찾기 코드를 읽었다', probe.length > 200);
  // 첫 화면부터 AI 호출인 화면이라, 고르는 단계에서 또 부르면 시작이 그만큼 늦어진다
  check('수준 찾기가 서버를 부르지 않는다(fetch 없음)', !/fetch\s*\(/.test(probe));
  check('3문항으로 끝난다', /var PROBE_ITEMS = 3/.test(HTML));
  check('가운데(4)에서 시작해 보폭을 줄인다(판단력 배치와 같은 규칙)',
    /_pbBand = 4, _pbStep = 2/.test(HTML) && /_pbStep = Math\.max\(1, _pbStep - 1\)/.test(HTML));
  check('찾은 값이 1~8 밖으로 나가지 않는다', /_pbBand = Math\.max\(1, Math\.min\(8, _pbBand\)\)/.test(HTML));
  check('찾은 결과가 실제로 대화 수준으로 저장된다', /function finishProbe\(\)\{?[\s\S]{0,120}setLevel\(_pbBand/.test(HTML));
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`웜업 연령·수준 하니스: ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('\n실패 항목:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
