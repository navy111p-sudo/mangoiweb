// -*- coding: utf-8 -*-
// 📊 통합 대시보드 계약 하네스 (2026-08-08)
//   실행: node test-harness/admin_unified_dashboard_harness.mjs
//
//   왜 만들었나 — 이 병합에서 실제로 사고를 냈다.
//
//   🔴 사고 ① 「카드와 카드 사이에 낀 <script> 를 같이 잘랐다」
//      상단 카드 4개를 한 카드로 합치면서 admin.html 의 줄 범위를 통째로 갈아끼웠는데,
//      하필 카드와 카드 사이에 `window.kpiLoad` 를 정의하는 <script> 가 있었다.
//      마크업(id)은 전부 살아 있어서 **화면은 멀쩡해 보였고**, 정의되지 않은 함수라
//      오류도 안 났다. KPI 8타일이 「📥 로딩 중…」에서 영원히 멈춘 채 배포까지 갔다.
//      → 그래서 이 하네스의 1번은 «전역함수가 살아 있나» 다. 화면이 아니라 계약을 본다.
//
//   🔴 사고 ② 「옛 카드 id 가 <div> 가 되면 열 곳 넘는 진입 경로가 조용히 죽는다」
//      사이드바·통합검색·AI 라우터·jumpToMenu 는 전부 `getElementById(id).open = true`
//      로 카드를 연다. div 에 open 을 넣으면 아무 일도 안 일어난다 —
//      «눌러도 반응이 없는», 제일 알아채기 어려운 고장이다.
//      → open 프로퍼티를 가로채는 shim 이 살아 있는지 본다.
//
//   🎨 사고 ③ 「한쪽만 색 테두리」가 border 가 아니라 ::after/::before 였다
//      마크업에서 인라인 border 를 다 지워도 안 사라졌다. 되살아나지 않게 못 박는다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const core = rd('../cloudflare-deploy/public/js/adm-core.js');
const cssC = rd('../cloudflare-deploy/public/css/admin-inline-c.css');
const r15  = rd('../cloudflare-deploy/public/js/adm-r15.js');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}
const has = (t, s) => t.indexOf(s) >= 0;
const count = (t, re) => (t.match(re) || []).length;

console.log('\n[ ① 🔴 카드 사이에 낀 스크립트가 잘리지 않았나 — 오늘 실제로 낸 사고 ]');
check('window.kpiLoad 가 정의돼 있다 (없으면 KPI 8타일이 「로딩 중…」에서 영원히 멈춘다)',
  /window\.kpiLoad\s*=/.test(html));
check('kpiLoad 를 부르는 곳도 살아 있다 (새로고침 버튼 + 부팅)',
  has(html, 'onclick="kpiLoad()"') && /setTimeout\(kpiLoad/.test(html));
check('브리핑 renderOne / dbLatest 가 살아 있다',
  /function renderOne\(/.test(html) && /window\.dbLatest\s*=/.test(html));

console.log('\n[ ② 통합 카드 구조 ]');
check('카드 하나로 합쳐져 있다 (#card-dashboard)', count(html, /id="card-dashboard"/g) === 1);
check('탭 3개가 있고 각자 data-card 를 가진다 (권한 연동의 열쇠)',
  count(html, /id="dash-tabs"/g) === 1 && count(html, /data-tab="[a-z]+" data-card="card-/g) >= 3);
check('탭 패널 3개', ['today', 'chart', 'ai'].every(t => has(html, `id="dash-pane-${t}"`)));

console.log('\n[ ③ 🔴 옛 카드 id — 지우면 열 곳 넘는 진입 경로가 죽는다 ]');
for (const id of ['card-daily-briefing', 'card-kpi-dashboard', 'card-daily-charts', 'card-ai-insights']) {
  check(`${id} 가 그대로 있다`, count(html, new RegExp(`id="${id}"`, 'g')) === 1);
}
check('open 프로퍼티를 가로채는 shim 이 있다 (getElementById(id).open=true 를 이어 준다)',
  /Object\.defineProperty\(el, 'open'/.test(html));
check('shim 이 카드를 펼치고 탭까지 바꾼다',
  /card\.open = true;[\s\S]{0,120}dashSelectTab/.test(html));
check('권한은 옛 id 의 .ph118-card-hidden 을 «읽어» 반영한다 (권한표 무수정)',
  has(html, 'ph118-card-hidden') && /function syncPerm/.test(html));

console.log('\n[ ④ 경량화 — 접힌 카드를 부팅 때 그리지 않는다 ]');
check('차트 게이트가 있다 (admDashWanted)', /function admDashWanted/.test(core));
check('게이트가 실패해도 «안 그리는 쪽»으로 죽지 않는다 (판단 불가면 그린다)',
  /catch \(e\) \{ return true; \}/.test(core));
check('펼칠 때 다시 그린다 (admDashOnOpen)', /function admDashOnOpen/.test(core));
check('«한 번도 안 그렸으면» 그린다 — 첫 fetch 실패해도 펼치면 재시도',
  /_admDashDrawn/.test(core));
check('🚚 Chart.js 를 우리 서버에서 받는다 (남의 CDN 왕복 제거)',
  has(core, '/vendor/chartjs/chart.umd.min.js'));
check('스파크라인은 Chart.js 없이 SVG 로 그린다', has(core, '<polyline points='));
check('스파크라인이 Chart 인스턴스를 만들지 않는다',
  !/_sparkCharts\[canvasId\] = new Chart/.test(core));
check('5분 자동 갱신은 «펼쳤고 탭이 보일 때만»',
  /kpiCardOpen\(\)/.test(html) && has(html, "visibilityState === 'hidden'"));
check('브리핑은 날짜 열쇠로 하루 캐시', /mangoi_briefing_v1:/.test(html));

console.log('\n[ ⑤ 🎨 「한쪽만 색 테두리」 — border 가 아니라 의사요소였다. 되살리지 말 것 ]');
check('KPI 박스 위쪽 4px 색 띠(::after)가 없다',
  !/#kpi-today \.card::after \{[\s\S]{0,120}height:\s*4px/.test(cssC));
check('죽은 --kpi-bar 변수가 남아 있지 않다', count(cssC, /--kpi-bar/g) === 0);
check('KPI 타일 왼쪽 컬러바(::before)가 없다',
  count(cssC, /\.kpi-tile\.kpi-[a-z]+::before\s*\{\s*background/g) === 0);
check('hover 로 떠오르지 않는다 (관리자 화면 hover 확대·이동 금지 규칙)',
  count(cssC, /#kpi[^\n]*:hover[\s\S]{0,80}translateY\(-/g) === 0);
check('테마를 이기려고 id 2개로 올렸다 (#card-dashboard #card-kpi-dashboard)',
  has(html, '#card-dashboard #card-kpi-dashboard .kpi-tile'));

console.log('\n[ ⑥ 🔊 위임된 클릭이 «남의 항목 이름» 을 읽지 않는다 ]');
check('사람이 실제 누른 클릭만 읽는다 (e.isTrusted)',
  /if \(e\.isTrusted === false\) return;/.test(r15));
check('자주 쓰는 기능은 자기 이름으로 안내한다', /closest\('\.ph161-q'\)/.test(r15));

console.log('\n[ ⑦ 캐시 — 고친 파일이 실제로 내려가야 한다 ]');
const v = (re) => { const m = html.match(re); return m ? parseInt(m[1], 10) : -1; };
check('adm-core.js ?v= 가 52 이상', v(/adm-core\.js\?v=(\d+)/) >= 52);
check('adm-r15.js ?v= 가 2 이상', v(/adm-r15\.js\?v=(\d+)/) >= 2);
check('admin-inline-c.css ?v= 가 13 이상', v(/admin-inline-c\.css\?v=(\d+)/) >= 13);

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  ❌ 실패 항목:'); FAILS.forEach(f => console.log('    - ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
