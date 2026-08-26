// -*- coding: utf-8 -*-
// 🎬 판단력 훈련 — 첫 진입 설정 카드 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/judgment_first_setup_harness.mjs
//   대상:  cloudflare-deploy/public/judgment.html · src/api-judgment.ts · src/api-points.ts
//
//   배경(2026-08-26 사장님 지시) — 「난이도 설정을 처음에 하게 하고 본 수업에 들어가자」.
//   운영 D1 실측으로 «강사가 준 레벨»(students_erp.level 0/29,417행 · level_tests 0행)이
//   현장에 없어 신규 학생이 전원 기본 밴드 3에서 시작하고 있었다.
//   그렇다고 배치테스트 6문항을 첫 관문으로 세우면 «기다림 6번»이 된다 —
//   문항이 LLM 실시간 생성이고(analysis_perf_log 최근 14일 78건: 평균 11.0초·최대 57초)
//   배치 중에는 선(先)생성도 꺼지기 때문이다. 그래서 «LLM 호출 0으로 즉시 뜨는 카드» 한 장으로 갔다.
//
//   이 하니스가 지키는 것:
//     A. 카드에 ①나이대와 ②난이도가 **둘 다** 있다 (사장님 지시 — ①이 핵심)
//     B. 배치테스트는 없애지 않고 «선택지 셋 중 하나»로 남아 있다
//     C. 카드가 떠 있는 동안 첫 문제를 미리 만든다 (이 변경의 이득 자체)
//     D. 카드는 «처음 오는 학생»에게만 뜬다 — 판정은 서버(KV) + 로컬 표시 두 겹
//     E. 판정을 LLM 응답으로 하지 않는다 (첫 화면이 통째로 늦어지는 것 방지)
//     F. 서버: 나이대 저장이 `if (!probing)` **밖**에 있다 — 위치가 곧 버그였다
//     G. 서버: only=band 분기가 무거운 성장 리포트를 건너뛴다
//     H. 화면 문구가 KO/EN/ZH 세 언어 짝을 이룬다
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const __dir = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(resolve(__dir, '../cloudflare-deploy/public/judgment.html'), 'utf8');
const SRVJ = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-judgment.ts'), 'utf8');
const SRVP = readFileSync(resolve(__dir, '../cloudflare-deploy/src/api-points.ts'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
/** 주석을 벗긴 사본 — «이 말이 없어야 한다» 류 검사가 자기 설명 주석을 잡지 않게(CLAUDE.md 2장). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

console.log('\n[ A. 카드에 ①나이대와 ②난이도가 둘 다 있는가 ]');
{
  const card = (HTML.match(/function renderFirstRunSetup\(\)[\s\S]*?\n  \}\n/) || [''])[0];
  check('첫 설정 카드 함수가 있다', card.length > 500, `${card.length}자`);
  // ⚠️ data-g 는 템플릿으로 찍히므로(`data-g="'+g+'"`) 완성된 속성 문자열로 찾으면 없습니다 —
  //    «뜻»(두 갈래가 카드 안에 있고, 그 버튼을 실제로 잡는 선택자가 있다)으로 봅니다.
  check('① 나이대 토글이 카드 안에 있다(학생/성인)',
    /ageBtn\('child'/.test(card) && /ageBtn\('adult'/.test(card) && /su-age/.test(card));
  check('② 난이도 갈래가 카드 안에 있다(AI 자동/직접 고르기)',
    /data-s="auto"/.test(card) && /data-s="manual"/.test(card));
  check('①이 «소재·말투» 축임을 글로 알려 준다(난이도와 헷갈리지 않게)',
    /소재와 말투|소재·말투/.test(card));
  check('«그냥 바로 시작» 탈출구가 있다 — 아무것도 안 고르고 지나갈 수 있어야 한다',
    /data-s="skip"/.test(card));
  // 1-3 «판단력 훈련 UI 의 게임 요소 금지» — 점수·배지·레벨업 연출을 이 카드에 넣지 않는다
  check('카드에 게임 연출(콘페티·XP)을 넣지 않았다', !/confetti\(|xpPop\(/.test(card));
}

console.log('\n[ B. 배치테스트를 없애지 않고 선택지로 남겼는가 ]');
{
  const card = (HTML.match(/function renderFirstRunSetup\(\)[\s\S]*?\n  \}\n/) || [''])[0];
  check('카드에 «레벨 찾기» 갈래가 있다', /data-s="placement"/.test(card));
  check('그 갈래가 startPlacement 를 부른다', /data-s="placement"|startPlacement\(\)/.test(HTML) && /startPlacement\(\);/.test(HTML));
  check('문제 화면의 «레벨 다시 재기» 상시 입구가 그대로 살아 있다(2026-08-24 검수 대응)',
    /data-pl="1"/.test(HTML));
  check('전체메뉴 ?placement=1 진입도 그대로 살아 있다',
    /get\('placement'\)==='1'/.test(HTML));
  // 실측(문항당 평균 11초)에 맞춘 안내. 더 짧게 적으면 «금방 끝난다»는 거짓 약속이 된다.
  check('소요 시간을 2~3분으로 안내한다', /2~3분/.test(HTML) && /2–3 min/.test(HTML));
}

console.log('\n[ C. 카드가 떠 있는 동안 첫 문제를 미리 만드는가 ]');
{
  const card = (HTML.match(/function renderFirstRunSetup\(\)[\s\S]*?\n  \}\n/) || [''])[0];
  check('카드를 그릴 때 prefetch 를 건다', /if\(!prefetch\) prefetchNext\(/.test(card));
  check('prefetchNext 가 나이대를 받을 수 있다', /function prefetchNext\(ageGroup\)/.test(HTML));
  check('나이대를 바꾸면 미리 받아 둔 문제를 버린다(옛 나이대 문제 방지)',
    /prefetch = null; prefetchDone = false;\s*\n\s*prefetchNext\(g\);/.test(card));
  // ⚠️ mode 를 붙여 보내면 loadScenario 가 미리 받아 둔 문제를 버리고 새로 만든다(평균 11초).
  //    이미 auto 인 신규 학생에게 붙일 이유가 없다 — 이 조건이 사라지면 «기다림 0» 이 그대로 깨진다.
  check('«AI가 맞춰줄게요»는 이미 auto 면 mode 를 안 붙인다(프리페치 폐기 방지)',
    /CUR_MODE==='manual' \? 'auto' : null/.test(card));
}

console.log('\n[ D·E. 카드는 처음 오는 학생에게만 — 판정을 LLM 응답으로 하지 않는가 ]');
{
  const boot = (HTML.match(/async function boot\(\)[\s\S]*?\n  \}\n/) || [''])[0];
  check('boot() 가 있다', boot.length > 200, `${boot.length}자`);
  check('로컬 표시가 있으면 카드를 건너뛴다', /if\(setupDone\(\)\)\{ loadScenario\(\); return; \}/.test(boot));
  check('서버에 «난이도를 정한 적 있나»를 물어본다(only=band)', /only=band/.test(boot));
  check('서버가 «있다»고 하면 다시 묻지 않는다(기기를 바꿔도)', /d\.has_band/.test(boot) && /markSetupDone\(\); loadScenario\(\); return;/.test(boot));
  check('그 요청이 실패해도 화면은 뜬다(카드로 폴백)', /catch\(e\)\{ d = null; \}/.test(boot) && /renderFirstRunSetup\(\);/.test(boot));
  check('?placement=1 진입은 카드를 건너뛴다', /placement'\)==='1'\)\{\s*\n?\s*markSetupDone\(\); startPlacement\(\); return;/.test(boot));
  // 🔴 이 검사가 이 하니스의 핵심입니다 — 판정을 시나리오(LLM) 응답으로 하면
  //    첫 화면이 평균 11초 늦어집니다. «판정용으로 시나리오를 부르지 않는다»를 못 박습니다.
  check('판정에 시나리오 생성(LLM)을 쓰지 않는다', !/requestScenario\(/.test(strip(boot)));
  check('언어를 바꾸면 카드도 다시 그린다(첫 언어로 굳지 않게)',
    /view==='setup'\) renderFirstRunSetup\(\)/.test(HTML));
  check('localStorage 접근 실패를 견딘다(사파리 프라이빗)',
    /function setupDone\(\)\{ try\{[\s\S]*?catch\(e\)\{ return false; \} \}/.test(HTML));
}

console.log('\n[ F. 서버 — 나이대 저장이 probing 밖에 있는가 (위치가 곧 버그였다) ]');
{
  // ⚠️ «그 줄이 있는가»가 아니라 «어디에 있는가»를 봅니다. 문자열로 존재만 확인하면
  //    if (!probing) 안에 들어가 있어도 통과합니다 — 그게 정확히 고친 버그의 모양입니다.
  //    (첫 카드에서 «성인 + 레벨 찾기»를 고르면 배치 6문항이 전부 아이 소재로 나갔음)
  const src = strip(SRVJ);
  const iAge = src.indexOf('if (wantAgeGroup) bandState = { ...bandState, ageGroup: wantAgeGroup');
  const iProbing = src.indexOf('if (!probing) {');
  const iAsk = src.indexOf('const askBand = probing ?');
  check('나이대 저장 줄이 있다', iAge > 0, String(iAge));
  check('probing 분기가 있다', iProbing > 0, String(iProbing));
  check('나이대 저장이 `if (!probing)` **앞**에 온다', iAge > 0 && iProbing > 0 && iAge < iProbing,
    `age=${iAge} / probing=${iProbing}`);
  check('그래도 밴드 확정(askBand)보다는 먼저다', iAge > 0 && iAsk > 0 && iAge < iAsk);
  check('`if (!probing)` 안에는 나이대 저장이 남아 있지 않다(두 번 쓰기 방지)', (() => {
    if (iProbing < 0 || iAsk < 0) return false;
    return !/ageGroup: wantAgeGroup/.test(src.slice(iProbing, iAsk));
  })());
  check('배치 중 나이대가 바뀌면 그때만 저장한다', /\} else if \(ageGroupChanged\) \{\s*\n[\s\S]{0,400}?await writeBandState\(env, studentUid, bandState\);/.test(src));
  // 배치 중 저장에 탐색 밴드가 새어 들어가면 «레벨을 찾는 중에 밴드가 바뀌는» 오염이 된다
  check('배치 중 저장에 탐색 밴드(probeRaw)를 쓰지 않는다', (() => {
    const m = src.match(/\} else if \(ageGroupChanged\) \{[\s\S]*?\n  \}/);
    return !!m && !/probeRaw/.test(m[0]);
  })());
}

console.log('\n[ G. 서버 — only=band 가 무거운 리포트를 건너뛰는가 ]');
{
  const src = strip(SRVP);
  check('only=band 분기가 있다', /\(url\.searchParams\.get\('only'\) \|\| ''\) === 'band'/.test(src));
  const branch = (src.match(/=== 'band'\)\s*\{[\s\S]*?\n      \}/) || [''])[0];
  check('그 분기는 getGrowthReport 를 부르지 않는다', branch.length > 50 && !/getGrowthReport/.test(branch), `${branch.length}자`);
  check('has_band 로 «정한 적 있나»를 답한다', /has_band: !!b/.test(branch));
  check('난이도 목록도 함께 준다(화면에 하드코딩하지 않게)', /band_catalog: bandCatalog\(\)/.test(branch));
  check('없는 값을 기본값으로 채워 내려보내지 않는다', /\.\.\.\(b \? \{/.test(branch));
  check('나이대도 함께 준다', /age_group: b\.age_group/.test(branch));
  check('getReadingBandFor 가 age_group 을 함께 돌려준다',
    /age_group: AgeGroup;[\s\S]{0,400}?age_group: st\.ageGroup/.test(SRVJ));
  // 새 경로를 만들지 않았는지 — src/index.ts 는 공동 금지구역(CLAUDE.md 4-2)
  check('새 API 경로를 만들지 않고 이미 열린 GET 에 얹었다',
    /path === '\/api\/judgment\/growth'/.test(src) && !/path === '\/api\/judgment\/setup'/.test(src));
}

console.log('\n[ H. 화면 문구가 세 언어 짝을 이루는가 ]');
{
  const card = (HTML.match(/function renderFirstRunSetup\(\)[\s\S]*?\n  \}\n/) || [''])[0];
  // T('ko','en','zh') 세 인자 형태가 카드 안에서 유지되는지 — 한/영만 있으면 중국어 화면이 영어로 굳는다
  const calls = card.match(/T\(/g) || [];
  check('카드에 번역 호출이 충분히 있다', calls.length >= 15, `${calls.length}개`);
  check('중국어 문구가 실제로 들어 있다', /开始前先定两件事|谁在做题/.test(card));
  check('영어 문구가 실제로 들어 있다', /Two quick things before we start/.test(card));
  check('한국어 문구가 실제로 들어 있다', /시작하기 전에 두 가지만 정할게요/.test(card));
}

console.log('\n' + '═'.repeat(40));
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
for (const f of FAILS) console.log('   ❌ ' + f);
console.log('═'.repeat(40) + '\n');
process.exit(FAIL ? 1 : 0);
