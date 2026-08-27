// -*- coding: utf-8 -*-
// 🔀 녹화 «복합 필터» 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/recording_multi_filter_harness.mjs
//
//   [무엇을 지키나]
//   녹화 관리 화면의 필터는 세 축(스토리지·상태·참여도)을 «동시에» 건다.
//   축 «안» 은 OR · 축 «끼리» 는 AND. 여기에 검색어·날짜(서버)까지 AND 로 붙는다.
//
//   ⚠️ 이 검사들은 «그 줄이 있는가» 로 쓰지 않는다 — 소스에서 판정부를 오려 내
//      **실제로 돌려서** 결과를 본다. 2026-08-27 에 고친 사고들이 전부
//      「함수도 값도 다 있는데 결과만 틀린」 모양이었기 때문이다:
//        · 화면 드롭다운은 status=ended 를 보냈는데 DB 에 그런 행은 0건 → 늘 빈 표
//        · upload_failed(운영 76건)는 고를 방법이 아예 없었음
//        · 고아(R2 전용) 행은 서버 상태 필터를 안 거쳐 그대로 섞여 나왔음
//
//   A. 서버 상태 파싱 — 콤마 목록·허용목록·'all'
//   B. 목록 API 와 CSV 가 «같은 규칙» 인가 (한쪽만 고치면 화면과 파일이 갈린다)
//   C. 화면 상태 칩 값이 전부 서버 허용목록 안에 있는가 (옛 'ended' 사고 재발 방지)
//   D. 화면 복합 필터 판정 — 실제로 돌려서 AND/OR·고아·참여도 경계
//   E. 정본이 한 벌인가 (죽은 <select> 잔재 없음 · 참여도 계산 두 벌 없음)
//   F. 칩 색이 화면에 «실제로» 나오게 하는 장치가 살아 있는가
//      (전역 `details.menu-card button{…!important}` 를 이기는 특이성 꼬리 + 페인터 예외)

import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dir, '..');
const SRC   = join(ROOT, 'cloudflare-deploy/src');
const PUB   = join(ROOT, 'cloudflare-deploy/public');

const api    = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
const core   = readFileSync(join(PUB, 'js/adm-core.js'), 'utf8');
const html   = readFileSync(join(PUB, 'admin.html'), 'utf8');
const css    = readFileSync(join(PUB, 'css/admin-inline-c.css'), 'utf8');
const painter= readFileSync(join(PUB, 'js/adm-light-surfaces.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
// 주석을 벗긴 사본 — 부정 검사는 반드시 이걸로 한다(CLAUDE.md 2장: 자기 주석을 잡는 사고)
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** 소스에서 «허용목록 + 파싱식» 을 오려 내 실제로 돌린다.
 *  ⚠️ 파싱식은 «그 목록 이름을 쓰는» 필터로 찾는다 — 위치(앞뒤)로 찾으면
 *     CSV 자리에서 목록 API 의 식을 집어 오는 사고가 난다(이 하니스를 쓰다 실제로 밟았다). */
function makeParser(body, listName) {
  /* ⚠️ 이름을 «부분문자열» 로 찾으면 REC_STATUSES 가 CSV_REC_STATUSES 안에서도 걸린다
        (파일에서 CSV 쪽이 먼저 나와서, 목록 API 를 찾는데 CSV 식을 집어 왔다 — 실제로 밟았다).
        앞에 식별자 글자가 오면 다른 이름이므로 lookbehind 로 끊는다. */
  const NB = '(?<![A-Za-z0-9_])';
  const mList = new RegExp(NB + 'const ' + listName + '\\s*=\\s*(\\[[^\\]]*\\])').exec(body);
  if (!mList) return null;
  const mFilter = new RegExp(
    '\\.filter\\((s => [^;]*?' + NB + listName + '\\.indexOf\\(s\\) >= 0)\\)').exec(body);
  if (!mFilter) return null;
  const dedupe = new RegExp('Array\\.from\\(new Set\\([\\s\\S]{0,400}?' + NB + listName).test(body);
  const filterBody = mFilter[1].replace(new RegExp(NB + listName, 'g'), 'LIST');
  // eslint-disable-next-line no-new-func
  const fn = new Function('raw', `
    const LIST = ${mList[1]};
    const picked = String(raw || '').split(',').map(s => s.trim()).filter(${filterBody});
    return ${dedupe ? 'Array.from(new Set(picked))' : 'picked'};`);
  return { fn, list: JSON.parse(mList[1].replace(/'/g, '"')), dedupe };
}

console.log('\nA. 서버 상태 파싱 — 콤마 목록·허용목록·all');
const listP = makeParser(api, 'REC_STATUSES');
check('GET /api/recordings 의 상태 파싱을 오려 낼 수 있다', !!listP,
  '모양이 바뀌었으면 이 하니스도 함께 고칠 것');
if (listP) {
  const f = listP.fn;
  check("빈 값 → 조건 없음", f('').length === 0 && f(null).length === 0);
  check("'all' → 조건 없음", f('all').length === 0);
  check("한 개 → 그대로", JSON.stringify(f('completed')) === '["completed"]');
  check("두 개(복합) → 둘 다", JSON.stringify(f('completed,upload_failed')) === '["completed","upload_failed"]');
  check('공백이 섞여도 잘라 낸다', JSON.stringify(f(' completed , deleted ')) === '["completed","deleted"]');
  check('모르는 값은 버린다(넓히지 않는다)', JSON.stringify(f('completed,drop table,../x')) === '["completed"]');
  check('전부 모르는 값이면 조건 없음', f('nope,zzz').length === 0);
  // 운영 D1 실측(2026-08-27)에 있는 다섯 가지는 반드시 고를 수 있어야 한다
  for (const s of ['completed', 'recording', 'upload_failed', 'aborted', 'deleted']) {
    check(`운영에 실재하는 상태를 고를 수 있다: ${s}`, f(s).length === 1);
  }
  /* 바인드 상한 — 이 API 는 URL 로 부르므로 ?status=completed,completed,…×500 을
     그대로 받으면 바인드가 500개가 되어 D1 100개 한도를 넘는다(에러는 대개 삼켜져 «빈 표» 로 보인다).
     중복을 접으면 바인드는 허용목록 크기를 넘을 수 없다. */
  check('중복을 접는다 (Array.from(new Set(...)))', listP.dedupe === true);
  check('바인드는 허용목록 크기를 넘을 수 없다',
    f(new Array(500).fill('completed').join(',')).length <= listP.list.length,
    'D1 바인드 100개 한도 근거 — 실제: ' + f(new Array(500).fill('completed').join(',')).length);
}

console.log('\nB. 목록 API 와 CSV 가 같은 규칙인가');
const csvP = makeParser(api.slice(api.indexOf('/api/admin/export/recordings.csv')), 'CSV_REC_STATUSES');
check('CSV 쪽 상태 파싱도 오려 낼 수 있다', !!csvP);
if (listP && csvP) {
  check('두 허용목록이 «같은 말» 을 한다',
    JSON.stringify(listP.list.slice().sort()) === JSON.stringify(csvP.list.slice().sort()),
    'list=' + listP.list + ' / csv=' + csvP.list);
  const same = ['', 'all', 'completed', 'completed,deleted', 'zzz,completed']
    .every(v => JSON.stringify(listP.fn(v)) === JSON.stringify(csvP.fn(v)));
  check('같은 입력에 같은 결과 (화면과 CSV 가 갈리지 않는다)', same);
}
// 서버가 IN 절로 받는가 — '=' 하나로 되돌아가면 두 개를 고를 수 없다
// 검사 범위는 «길이» 가 아니라 그 핸들러 블록으로 자른다(엉뚱한 조각을 잡지 않게)
const listHandler = strip(api).slice(strip(api).indexOf("path === '/api/recordings' && method === 'GET'"));
check('목록 SQL 이 IN (...) 으로 받는다', /r\.status IN \('/.test(listHandler.slice(0, 4000)),
  "'= ?' 로 되돌아가면 두 개를 동시에 고를 수 없다");
check('CSV SQL 도 IN (...) 으로 받는다',
  (strip(api).match(/r\.status IN \('/g) || []).length >= 2);
// 0초 aborted 감추기는 «조건이 하나도 없을 때만» 이어야 한다(중단 칩을 켜면 보여야 함)
check("0초 aborted 감추기가 «조건 없을 때만» 걸린다", /if \(!statusList\.length\) \{[\s\S]{0,200}?aborted/.test(strip(api)));

console.log('\nC. 화면 상태 칩 값이 서버 허용목록 안에 있는가');
const chipStatuses = [...html.matchAll(/data-status="([^"]+)"/g)].map(m => m[1]);
check('상태 칩이 다섯 개 있다', chipStatuses.length === 5, '실제: ' + chipStatuses.join(','));
if (listP) {
  const bad = chipStatuses.filter(s => listP.list.indexOf(s) < 0);
  check('모든 상태 칩을 서버가 안다', bad.length === 0,
    bad.length ? '서버가 모르는 값: ' + bad.join(',') + ' → 고르면 조용히 무시된다' : '');
}
/* 🔴 옛 사고 그대로 — 화면이 'ended' 를 보냈는데 그런 행은 D1 에 0건이었다.
      운영에 실재하는 upload_failed 는 고를 수조차 없었다. 둘 다 다시 나오면 안 된다. */
check("«종료(ended)» 칩이 되살아나지 않았다", chipStatuses.indexOf('ended') < 0,
  'D1 실측 0건이라 고르면 언제나 빈 표가 된다');
check('«저장 실패(upload_failed)» 칩이 있다', chipStatuses.indexOf('upload_failed') >= 0,
  '운영 76건이 화면에 보이는데 고를 수 없으면 안 된다');

console.log('\nD. 화면 복합 필터 판정 — 실제로 돌린다');
function cut(body, startRe) {
  const m = startRe.exec(body); if (!m) return null;
  let i = body.indexOf('{', m.index), d = 0;
  for (let j = i; j < body.length; j++) {
    if (body[j] === '{') d++;
    else if (body[j] === '}') { d--; if (!d) return body.slice(m.index, j + 1); }
  }
  return null;
}
const partFn  = cut(core, /function _recParticipation\(/);
const bandFn  = cut(core, /function _recPartBand\(/);
const applyFn = cut(core, /function _recApplyClientFilters\(/);
check('세 판정 함수를 모두 오려 낼 수 있다', !!(partFn && bandFn && applyFn));
if (partFn && bandFn && applyFn) {
  // eslint-disable-next-line no-new-func
  const mk = new Function(`
    let _recSourceSel = [], _recPartSel = [], _recQuery = { status: [] };
    ${partFn} ${bandFn} ${applyFn}
    return function (src, part, status, rows) {
      _recSourceSel = src; _recPartSel = part; _recQuery = { status };
      return _recApplyClientFilters(rows);
    };`)();
  const R = (id, source, g, s) => ({ id, source, gaze_score: g, speaking_score: s });
  const rows = [
    R('a', 'both',   95, 90),   // 92.5 → high
    R('b', 'both',   60, 55),   // 57.5 → mid
    R('c', 'd1only', 20, 15),   // 17.5 → low
    R('d', 'd1only', null, null), // na
    R('e', 'orphan', null, null), // na · 고아
    R('f', 'both',   80, 80),   // 80.0 → high (경계 포함)
    R('g', 'both',   50, 50),   // 50.0 → mid  (경계 포함)
    R('h', 'both',   90, null), // 한쪽만 → 90 → high
  ];
  const ids = rs => rs.map(r => r.id).join('');

  check('조건 없음 → 그대로 전부', ids(mk([], [], [], rows)) === 'abcdefgh');
  check('스토리지 한 개 (OR 안에 하나)', ids(mk(['both'], [], [], rows)) === 'abfgh');
  check('스토리지 두 개 = OR', ids(mk(['both', 'orphan'], [], [], rows)) === 'abefgh');
  check('참여도 high (80 포함)', ids(mk([], ['high'], [], rows)) === 'afh');
  check('참여도 mid (50 포함, 80 미만)', ids(mk([], ['mid'], [], rows)) === 'bg');
  check('참여도 low', ids(mk([], ['low'], [], rows)) === 'c');
  check('참여도 미집계 = 두 점수가 모두 없을 때만', ids(mk([], ['na'], [], rows)) === 'de');
  check('참여도 두 개 = OR', ids(mk([], ['low', 'na'], [], rows)) === 'cde');
  check('한쪽 점수만 있으면 그 값으로 판정', ids(mk([], ['high'], [], [R('h', 'both', 90, null)])) === 'h');

  // ★ 이 하니스의 핵심 — 축 «끼리» 는 AND
  check('스토리지 ∧ 참여도 = AND', ids(mk(['both'], ['high'], [], rows)) === 'afh');
  check('AND 라서 교집합이 없으면 0건', ids(mk(['orphan'], ['high'], [], rows)) === '');
  check('세 축 동시 (상태까지)', ids(mk(['both'], ['high'], ['completed'], rows)) === 'afh');

  /* 🧭 고아(R2 전용)는 D1 기록이 없어 «상태» 자체가 없다.
        상태를 고른 사람에게 상태 없는 행을 섞어 주면 필터가 고장난 것으로 보인다.
        (2026-08-27 실측: 고치기 전에는 13건 중 5건이 고아였다.) */
  check('상태를 고르면 고아 행은 빠진다', ids(mk([], [], ['completed'], rows)).indexOf('e') < 0);
  check('상태를 안 고르면 고아 행은 그대로 보인다', ids(mk([], [], [], rows)).indexOf('e') >= 0);
  check('«기록 없음» 칩으로는 여전히 고아를 찾을 수 있다', ids(mk(['orphan'], [], [], rows)) === 'e');
}

console.log('\nE. 정본이 한 벌인가');
const coreS = strip(core);
check('죽은 <select id="rec-status-2"> 가 화면에 없다', !/id="rec-status-2"/.test(html),
  '두 벌이면 어느 쪽이 정본인지 갈린다');
check('adm-core 가 rec-status-2 를 더는 읽지 않는다', !/getElementById\('rec-status-2'\)/.test(coreS));
check('참여도 계산이 한 곳뿐이다 (_recParticipation)',
  (coreS.match(/function _recParticipation\(/g) || []).length === 1
  && !/function calcParticipation\(/.test(coreS),
  '표 셀과 필터가 다른 값을 보면 「80으로 걸렀는데 79.9가 보인다」가 된다');
check('status 는 배열로 다룬다 (문자열 비교 잔재 없음)',
  !/_recQuery\.status !== 'all'/.test(coreS) && /_recQuery\.status\.join\(','\)/.test(coreS));
check('CSV 도 같은 status 를 보낸다',
  (coreS.match(/_recQuery\.status\.join\(','\)/g) || []).length >= 2);
check('요약줄이 «어디까지 걸렀는지» 를 말한다',
  /현재 페이지/.test(core) && /on this page/.test(core),
  '건수만 적으면 다음 페이지에 더 있는 것을 «없다» 로 읽는다');

console.log('\nF. 칩 색이 화면에 «실제로» 나오는가');
/* 전역 `details.menu-card button{background:인디고!important; padding:9px 18px!important}` 가
   인라인 style 을 이긴다. 그래서 옛 알약 넷은 화면에서 전부 같은 파란 알약이었다 —
   무엇이 켜져 있는지 눈으로 가릴 수 없었다. 아래 두 장치가 그것을 이긴다. */
const tail = /button\.rec-fchip(?:\.rec-on)?(?:\[data-tone="[a-z]+"\])?(?::not\([^)]+\)){4,}/;
check('칩 CSS 가 특이성 꼬리를 갖고 있다', tail.test(css),
  ':not() 꼬리를 지우면 전역 !important 에 져서 전부 같은 파란 알약이 된다');
check('꺼짐/켜짐 두 상태가 정의돼 있다',
  /button\.rec-fchip\.rec-on/.test(css) && /button\.rec-fchip\[data-tone="ok"\]/.test(css));
check('배경 그라데이션을 끈다', /background-image:\s*none\s*!important/.test(
  css.slice(css.indexOf('button.rec-fchip'))));
check('페인터 예외(SKIP_SEL)에 칩이 올라가 있다', /'\.rec-fchip'/.test(painter),
  '없으면 페인터가 밝게 눌러 켜진 칩과 꺼진 칩이 똑같아진다');
check('클래스 이름이 «-btn» 으로 끝나지 않는다', !/rec-f[a-z]*-btn/.test(css),
  '[class$="-btn"] 규칙(3894·9012행)에 다시 걸린다');
/* 아이콘이 아니라 «글자» 버튼이므로 data-ko/data-en 이 맞다.
   ⚠️ 아이콘 버튼이었다면 그 둘은 textContent 를 통째로 갈아끼워 상자를 넘친다(CLAUDE.md 2장). */
const chipBlock = html.slice(html.indexOf('<div id="rec-filters"'), html.indexOf('/#rec-filters'));
const chipTags = chipBlock.match(/<button[^>]*class="[^"]*rec-fchip[^"]*"[^>]*>/g) || [];
check('칩이 14개다', chipTags.length === 14, '실제: ' + chipTags.length);
check('모든 칩에 data-ko/data-en 이 있다 (🌐 를 눌러도 따라온다)',
  chipTags.every(t => /data-ko="/.test(t) && /data-en="/.test(t)));
check('모든 칩에 색조(data-tone)가 있다', chipTags.every(t => /data-tone="/.test(t)));
check('칩에 인라인 배경색이 없다', !chipTags.some(t => /style="[^"]*background/.test(t)),
  '인라인은 전역 !important 에 먹혀 화면엔 안 나오는데 코드만 보면 나오는 줄 안다');

console.log('\nG. hover·글자색이 전역 규칙에 안 먹히는가 (2026-08-27 실측으로 밟은 것들)');
/* 🔴 진짜 상대는 «평상시» 규칙이 아니라 3329행의 **hover** 규칙이다.
   `details.table-card.menu-card button:not()×3:hover` = (0,6,2).
   :not() 다섯 개짜리 (0,6,1) 로는 진다 — 실측: 꺼진 칩에 마우스를 올리면
   파란 인디고 그라데이션이 되는데 글자는 초록 그대로라 대비 약 1.2:1 이었고,
   `transform: translateY(-1px)` 까지 걸려 CLAUDE.md 1-3(hover translate 금지)을 어겼다. */
/* ⚠️ 주석을 먼저 벗긴다 — 이 블록의 «설명 주석» 이 `button.rec-fchip` 과 `:not()` 을
      글자로 적고 있어서, 안 벗기면 검사가 자기 주석을 규칙으로 세어 거짓 FAIL 을 낸다
      (CLAUDE.md 2장 「부정 검사가 자기 주석을 잡는다」의 CSS 판 — 실제로 밟았다).
      CSS 에는 `//` 주석이 없고 URL 의 `//` 를 지우면 안 되므로 블록주석만 벗긴다. */
const cssNoCmt = css.replace(/\/\*[\s\S]*?\*\//g, '');
const chipRules = cssNoCmt.slice(cssNoCmt.indexOf('button.rec-fchip'));
const notCounts = [...chipRules.matchAll(/button\.rec-fchip[^{]*\{/g)]
  .map(m => (m[0].match(/:not\(/g) || []).length);
check('모든 칩 규칙이 :not() 을 여섯 개 이상 쓴다 ((0,7,1) — hover (0,6,2) 를 이긴다)',
  notCounts.length > 0 && notCounts.every(n => n >= 6),
  '실제: ' + notCounts.join(',') + ' → 다섯 개면 hover 에서 파란 알약 + translateY 로 되돌아간다');
check('hover 규칙이 있고 «켜진 칩» 은 비켜 간다',
  /button\.rec-fchip:not\(\.rec-on\)[^{]*:hover\s*\{/.test(chipRules),
  '켜짐 색이 곧 상태 정보다 — hover 가 덮으면 안 된다');
check('hover 에서도 transform·box-shadow 를 끈다',
  /:hover\s*\{[^}]*transform:\s*none\s*!important[^}]*box-shadow:\s*none\s*!important/.test(chipRules)
  || /:hover\s*\{[^}]*box-shadow:\s*none\s*!important[^}]*transform:\s*none\s*!important/.test(chipRules),
  'CLAUDE.md 1-3 — hover 강조는 색만, 크기·위치는 고정');
/* 🔴 8798행 `html[…ivory][…slate] [id^="card-"] :is(p,span,div,…):not(…)` 가 #101828 !important.
   `.rec-flabel`·`#rec-cond-summary` 는 그 :not() 목록(btn·chip·pill·tag)에 안 걸려 그대로 잡힌다.
   인라인도 el.style.color 도 진다 — 조상 id 로만 이긴다(실측 전: 둘 다 rgb(16,24,40)). */
check('라벨 색을 조상 id 로 못 박았다', /#card-recording-storage \.rec-flabel\s*\{[^}]*color:[^}]*!important/.test(cssNoCmt));
check('요약줄 색도 조상 id 로 못 박았다', /#card-recording-storage #rec-cond-summary\s*\{[^}]*color:[^}]*!important/.test(cssNoCmt));
check('요약줄 «조건 걸림» 색이 따로 있다', /#rec-cond-summary\.rec-cond-on\s*\{[^}]*color:[^}]*!important/.test(cssNoCmt));
check('JS 가 요약줄 색을 직접 칠하지 않는다 (클래스만 붙인다)',
  !/rec-cond-summary[\s\S]{0,400}?style\.color/.test(coreS) && /classList\.(add|remove)\('rec-cond-on'\)/.test(coreS),
  'el.style.color 는 #101828 !important 에 져서 «코드엔 있는데 화면엔 없는» 줄이 된다');
/* 🌐 이 표와 요약줄은 textContent 로 그려서 data-ko/data-en 루프가 못 고친다.
   놔두면 «칩만 영어, 그 밑 요약·상태 배지는 한국어» 인 반쪽이 남는다. */
check('언어 토글에 표를 다시 그린다', /mangoi:lang-changed[\s\S]{0,600}?renderRecordingsTable\(\)/.test(coreS));
check('언어 토글이 서버를 다시 부르지는 않는다',
  !/mangoi:lang-changed[\s\S]{0,600}?loadRecordings\(\)/.test(coreS),
  '언어는 «축» 이 아니다 — 다시 부르면 페이지가 첫 장으로 튄다');

console.log('\n' + '─'.repeat(56));
console.log(`  ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach(x => console.log('   - ' + x)); }
process.exit(FAIL ? 1 : 0);
