// -*- coding: utf-8 -*-
// 📐 관리자 화면 가로 넘침 가드 (2026-08-18)
//   실행: node test-harness/admin_layout_overflow_harness.mjs
//
// 무엇을 막는가
//   `.admin-layout` 은 `grid-template-columns: 260px 1fr` 이다. **그리드 칸의 기본값은
//   min-width:auto** 라 «내용보다 작아지지 않는다». 그래서 1fr 칸(#admin-main-scale)이
//   그 안의 넓은 표만큼 부풀어 창 밖으로 나갔다.
//
//   실측(2026-08-18, 헤드리스 1500px): 「학생관리」(컬럼 17개, 표 1,703px)를 열면
//     · 카드가 1,821px 이 되고 문서가 **586px** 가로로 넘쳤다
//     · 페이지 전체에 가로 스크롤바가 생기고 오른쪽 컬럼은 옆으로 밀어야 보였다
//   ⚠️ 표를 담은 상자에는 **이미 overflow-x:auto 가 있었는데도** 안 먹었다 —
//      상자가 «넘칠 일이 없을 만큼» 같이 커져서다. 그래서 그 상자만 봐서는 원인을 못 찾는다.
//
//   min-width:0 한 줄로 고쳤고, 이 하니스는 그 줄이 사라지는 것을 막는다.
//   (지우면 증상이 즉시 돌아오지만 «화면이 조금 넓어 보일 뿐» 이라 눈치채기 어렵다)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const cssA = rd('../cloudflare-deploy/public/css/admin-inline-a.css');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond, extra) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
};

console.log('\n[ 그리드 1fr 칸이 줄어들 수 있는가 ]');
check('.admin-layout 이 여전히 grid 다 (구조가 바뀌면 이 검사의 전제가 깨진다)',
  /\.admin-layout\s*\{[^}]*display:\s*grid/.test(cssA));
check('#admin-main-scale 에 min-width:0 이 있다',
  /#admin-main-scale\s*\{[^}]*min-width:\s*0/.test(cssA),
  '이게 없으면 넓은 표가 있는 카드에서 화면이 통째로 옆으로 밀린다');
check('그 규칙이 .admin-layout 과 같은 파일·같은 미디어 블록에 있다',
  cssA.indexOf('#admin-main-scale') > cssA.indexOf('.admin-layout { display: grid'));

/* 📊 차트 4종(대시보드)도 같은 「그리드 칸이 못 줄어든다」 함정을 밟았다 (2026-08-18).
   `.charts` 가 `1fr 1fr` 이고 `.chart-card` 의 min-width:0 은 @media(max-width:640px) 안에만
   있어서, **641px 위** — 특히 2단인 769px 이상 — 에서 캔버스·범례가 칸을 밀어 부모를 넘쳤다.
   관리자 PC 는 zoom:1.3 이라 1280px 화면의 실효 폭이 ~985px 로 정확히 이 구간이다. */
console.log('\n[ 차트 4종이 창 폭에 맞춰 줄어드는가 ]');
{
  const chartsRule = (cssA.match(/\.charts\s*\{[^}]*\}/) || [''])[0];
  check('.charts 그리드가 폭에 따라 접힌다 (auto-fit + minmax)',
    /auto-fit/.test(chartsRule) && /minmax\(/.test(chartsRule),
    '`1fr 1fr` 고정이면 768px 아래 미디어 규칙만으로는 그 사이 구간이 안 잡힌다');
  const cardRule = (cssA.match(/\.chart-card\s*\{[^}]*\}/) || [''])[0];
  check('.chart-card 에 min-width:0 이 «미디어 밖에서» 상시 적용된다',
    /min-width:\s*0/.test(cardRule),
    '이게 없으면 그리드 칸이 내용보다 작게 줄지 못해 차트가 상자를 벗어난다');
  check('.chart-wrapper 가 높이를 정한 position:relative 다',
    /\.chart-wrapper\s*\{[^}]*position:\s*relative[^}]*height:/.test(cssA),
    'Chart.js maintainAspectRatio:false 는 부모 높이를 그대로 따라간다 — 높이가 없으면 무한히 자란다');
  check('.chart-card canvas 에 max-width 안전망이 있다',
    /\.chart-card\s+canvas\s*\{[^}]*max-width/.test(cssA));
}

/* 📊 정산·매출 > 매출 대시보드(accLoadSalesChart)도 같은 규칙을 지켜야 한다 */
console.log('\n[ 매출 대시보드 차트도 컨테이너 안에 머무는가 ]');
{
  const core = rd('../cloudflare-deploy/public/js/adm-core.js');
  const fn = (core.match(/window\.accLoadSalesChart[\s\S]*?\n  \};/) || [''])[0];
  check('캔버스가 높이를 정한 position:relative 래퍼 안에 있다',
    /position:relative[^"']*height:/.test(fn),
    '높이 없는 부모에 넣으면 캔버스가 부모를 늘리고 그걸 다시 읽어 창 크기마다 넘친다');
  check('차트가 maintainAspectRatio:false + responsive 다', /maintainAspectRatio:\s*false/.test(fn) && /responsive:\s*true/.test(fn));
  check('감싼 그리드가 내용보다 작게 줄 수 있다 (minmax + min-width:0)',
    /minmax\(min\(100%/.test(fn) && /min-width:0/.test(fn));
  check('이전 Chart 인스턴스를 destroy 한다 (옛 리사이즈 감시가 크기를 흔든다)',
    /_accSalesChart[\s\S]{0,120}destroy\(\)/.test(fn));
}

console.log('\n[ 캐시 버전 ]');
const m = html.match(/admin-inline-a\.css\?v=(\d+)/);
check('admin.html 이 admin-inline-a.css 를 ?v= 로 부른다', !!m);
check('버전이 v=11 이상이다 (min-width:0 이 들어간 판)',
  !!m && parseInt(m[1], 10) >= 11, m ? `현재 v=${m[1]}` : '못 찾음');

console.log('\n[ 넓은 표는 자기 상자 안에서 스크롤해야 한다 ]');
// 학생 목록이 대표 사례 — 상자에 overflow-x 가 살아 있는지 (위 min-width:0 과 «짝» 이다)
// ⚠️ `overflow-x:auto` 만 찾으면 못 잡는다 — 실제로는 `overflow:auto` 축약형을 쓴다
//    (인라인 style 과 admin-inline-a.css 두 곳 모두). 축약형도 가로 스크롤을 만든다.
const wrapScrolls = /id="sm-students-wrap"[^>]*overflow\s*:\s*auto/.test(html)
  || /#sm-students-wrap\s*\{[^}]*overflow\s*:\s*auto/.test(cssA);
check('#sm-students-wrap 이 overflow:auto 로 감싸져 있다', wrapScrolls,
  '상자의 overflow 와 칸의 min-width:0 은 «둘 다» 있어야 동작한다');

console.log('\n' + '─'.repeat(58));
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { FAILS.forEach(f => console.log('    - ' + f)); process.exit(1); }
