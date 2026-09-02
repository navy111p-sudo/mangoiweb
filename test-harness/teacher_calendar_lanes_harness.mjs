// -*- coding: utf-8 -*-
// 🗂 강사 스케줄 주간 캘린더 — 겹침 없는 배치 하니스 (의존성 없음)
//   실행:  node test-harness/teacher_calendar_lanes_harness.mjs
//   대상:  cloudflare-deploy/public/js/adm-q6.js (ph54LayoutItems · ph54LaneStyle · ph54FoldGradient · 렌더 배선)
//          cloudflare-deploy/public/css/admin-inline-c.css · admin.html ?v=
//
//   발단(2026-09-02 사장님): 「수업들이 겹치지 않고 한눈에 모두 정확하고 깨끗하게 볼 수 있게」.
//   원인: 카드가 전부 left:3px;right:3px 로 요일 칸 «전체 폭» 에 절대배치돼 같은 시각 카드가 한 자리에 쌓였다.
//   수리: 샘플 B-1(요일 접기 + 강사별 열) + B-3(빈 시간·머리글 부하) — docs/강사캘린더_강사별열_B안_세갈래_2026-09-02.html
//
//   ⚠️ 배치 함수는 문자열로 «있는가» 만 보지 않고 소스에서 오려 내 **실제로 돌린다**(CLAUDE.md 2장).
//      되돌리기(군집 대신 열 전체를 나누기 · 겹침 판정 제거 · 빈틈 문턱 제거)는 아래 [A]·[B] 에서 실제로 FAIL 난다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(resolve(__dir, p), 'utf8');
const Q6  = rd('../cloudflare-deploy/public/js/adm-q6.js');
const CSS = rd('../cloudflare-deploy/public/css/admin-inline-c.css');
const HTML = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}
const fn = (name) => (Q6.match(new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}')) || [''])[0];

console.log('\n[ A. 배치 함수를 실제로 돌린다 ]');
let L;
{
  const src = [fn('ph54LayoutItems'), fn('ph54LaneStyle'), fn('ph54GapHtml'), fn('ph54FoldGradient')].join('\n');
  const gapMin = (Q6.match(/var PH54_GAP_MIN = (\d+);/) || [])[1];
  check('배치 함수 4개를 소스에서 오려 냈다', src.length > 800 && !!gapMin, `len=${src.length} gapMin=${gapMin}`);
  const mk = new Function('PH54_START_H', 'PH54_END_H', 'PH54_HOUR_PX', 'PH54_GAP_MIN', 'ph54T', 'ph54Pad',
    src + '\nreturn { ph54LayoutItems, ph54LaneStyle, ph54GapHtml, ph54FoldGradient };');
  L = mk(6, 24, 50, Number(gapMin), (ko) => ko, (n) => (n < 10 ? '0' + n : '' + n));
  const it = (st, du, k) => ({ st, du, k });

  // ① 안 겹치면 전부 폭 전체
  let r = L.ph54LayoutItems([it(840, 20, 'a'), it(870, 20, 'b'), it(900, 40, 'c')]);
  check('① 안 겹치는 카드는 lanes=1 · dup 없음', r.items.every((x) => x.lanes === 1 && !x.dup));
  check('① lanes=1 이면 인라인 자리 조각이 비어 있다(CSS 기본 left/right)', L.ph54LaneStyle(r.items[0]) === '');

  // ② 같은 강사·같은 시각 둘 — 그 «군집» 만 반으로, 다른 카드는 폭 전체
  r = L.ph54LayoutItems([it(1240, 20, 'x'), it(1240, 30, 'y'), it(1300, 20, 'z')]);
  const x = r.items.find((v) => v.k === 'x'), y = r.items.find((v) => v.k === 'y'), z = r.items.find((v) => v.k === 'z');
  check('② 겹치는 둘은 lanes=2 · 서로 다른 lane', x.lanes === 2 && y.lanes === 2 && x.lane !== y.lane, JSON.stringify([x, y]));
  check('② 둘 다 dup 표시', x.dup && y.dup);
  check('🔴 ② 안 겹치는 세 번째 카드는 폭 전체(군집 단위 — 열 전체를 나누지 않는다)', z.lanes === 1 && !z.dup, `lanes=${z.lanes}`);
  const second = r.items.find((v) => v.lane === 1);   // 긴 카드가 먼저 자리를 잡으므로 «누가» 1번 lane 인지는 길이가 정한다
  const st = L.ph54LaneStyle(second);
  check('② 두 번째 lane 의 자리 조각이 left:calc(50% …)·width:calc(50% …)·right:auto', /left:calc\(50\.000% \+ 2px\)/.test(st) && /width:calc\(50\.000% - 4px\)/.test(st) && /right:auto/.test(st), st);

  // ③ 셋이 겹치면 셋으로
  r = L.ph54LayoutItems([it(1200, 40, 'a'), it(1210, 20, 'b'), it(1220, 20, 'c')]);
  check('③ 셋이 겹치면 lanes=3', r.items.every((v) => v.lanes === 3));
  // ④ 사슬(a-b 겹침, b-c 겹침, a-c 안 겹침) — 군집은 하나(lanes 2 로 충분: a·c 는 같은 lane 을 쓸 수 있다)
  //    ⚠️ 군집은 «앞 카드가 끝나기 전에 시작한 카드» 로만 자라므로 둘 이상인 군집의 구성원은 반드시 겹친다
  //       — 그래서 «군집이면 전부 dup» 과 «짝마다 겹침» 은 같은 답을 낸다(trap-check 지적으로 설명을 바로잡음).
  r = L.ph54LayoutItems([it(1200, 30, 'a'), it(1220, 30, 'b'), it(1240, 20, 'c')]);
  check('④ 사슬 군집 = 한 군집 · lane 은 2 개면 충분(a 와 c 가 같은 lane)', new Set(r.items.map((v) => v.lanes)).size === 1 && r.items[0].lanes === 2, JSON.stringify(r.items.map((v) => [v.k, v.lane, v.lanes])));
  check('④ 사슬 구성원은 전부 dup(각자 누군가와 겹친다)', r.items.every((v) => v.dup === true));

  // ⑤ 빈 자리 — 문턱 이상만
  r = L.ph54LayoutItems([it(840, 20, 'a'), it(870, 20, 'b'), it(930, 20, 'c')]);
  check('⑤ 10분 쉬는 틈은 빈 자리로 안 그린다 · 40분은 그린다', r.gaps.length === 1 && r.gaps[0].st === 890 && r.gaps[0].du === 40, JSON.stringify(r.gaps));
  r = L.ph54LayoutItems([it(840, 20, 'a'), it(840, 40, 'b'), it(920, 20, 'c')]);
  check('⑤ 겹친 뒤의 빈 자리는 «가장 늦게 끝나는 카드» 뒤부터', r.gaps.length === 1 && r.gaps[0].st === 880 && r.gaps[0].du === 40, JSON.stringify(r.gaps));
  check('⑤ 카드 하나뿐이면 빈 자리 없음(앞뒤는 세지 않는다)', L.ph54LayoutItems([it(900, 20)]).gaps.length === 0);
  const gh = L.ph54GapHtml({ st: 890, du: 40 });
  check('⑤ 빈 자리 HTML 은 .ph54-gap · 분 수를 글자로', /class="ph54-gap"/.test(gh) && /빈 40분/.test(gh) && /pointer/.test(CSS.match(/\.ph54-gap \{[^}]*\}/)?.[0] || ''), gh);

  // ⑥ 접힌 요일 밀도 — 그라데이션 «한 장», 모든 칸에 stop
  const g = L.ph54FoldGradient([it(840, 20), it(840, 20), it(1200, 40)]);
  const stops = (g.match(/rgba\(167,139,250,([\d.]+)\)/g) || []).map((m) => Number(m.match(/,([\d.]+)\)/)[1]));
  check('⑥ 20분 칸마다 stop 이 하나씩(사이가 번지지 않는다)', stops.length === (24 - 6) * 3, `stops=${stops.length}`);
  check('🔴 ⑥ 밀도 색의 휘도가 0.16 이상(adm-light-surfaces 가 통째로 옅게 다시 쓰는 문턱) — #a78bfa', /rgba\(167,139,250,/.test(g) && !/rgba\(124,58,237,/.test(g));
  check('⑥ 수업이 없는 칸은 투명(0), 둘이 겹친 칸은 하나보다 진하다',
    stops[0] === 0 && stops[(840 - 360) / 20] > stops[(1200 - 360) / 20] && stops[(1200 - 360) / 20] > 0, JSON.stringify([stops[0], stops[24], stops[42]]));
  check('⑥ div 를 늘리지 않는다(background-image 한 줄)', /^background-image:linear-gradient\(to bottom,/.test(g) && !/<div/.test(g));
}

console.log('\n[ B. 렌더 배선 — 함수가 «있는가» 가 아니라 «그 자리에서 쓰는가» ]');
{
  const render = (Q6.match(/function ph54Render\(\)\{[\s\S]*?\n  \}\n/) || [''])[0];
  check('렌더 함수를 오려 냈다', render.length > 5000);
  check('전체 보기 = 접기(accordion), 강사 필터 = 7열', /var accordion = !filterId;/.test(render) && /if \(!accordion\) colDefs\.push\('minmax\(96px,1fr\)'\)/.test(render));
  check('펼친 요일은 «그날 강사 수» 만큼 열', /repeat\(' \+ byDay\[cd\]\.teachers\.length \+ ',minmax\(58px,1fr\)\)/.test(render));
  check('접힌 요일은 40px 띠', /else if \(cd !== openDay\) colDefs\.push\('40px'\)/.test(render));
  check('🔴 머리글과 본문이 같은 열 폭 문자열(gridCols)을 쓴다',
    /id="ph54-cal-head" style="' \+ gridCols/.test(render) && /id="ph54-cal-track" style="' \+ gridCols/.test(render));
  check('강사 열마다 배치를 «실제로» 계산한다(t.lay = ph54LayoutItems)', /t\.lay = ph54LayoutItems\(t\.items\)/.test(render));
  check('필터 모드도 열 안에서 배치를 계산한다', /colCards\(ph54LayoutItems\(flat\)\)/.test(render));
  check('빈 자리를 카드 «앞에» 그린다(카드 아래 깔림)', /var out = lay\.gaps\.map\(ph54GapHtml\)\.join\(''\);/.test(render));
  check('강사 열에 data-day 와 data-teacher 를 함께 단다(드롭·차단 클릭은 data-day 를 읽는다)',
    /class="ph54-cal-col' \+ \(j === 0 \? ' ph54-daysep' : ''\) \+ tcls \+ '" data-day="' \+ ci2 \+ '" data-teacher="/.test(render));
  check('접힌 띠는 .ph54-cal-fold + data-day + 밀도 그라데이션', /class="ph54-cal-fold' \+ tcls \+ '" data-day="' \+ ci2 \+ '"[^>]*ph54FoldGradient\(allItems\)/.test(render));
  check('펼친 요일 기본 = 오늘 → 수업 있는 첫 요일 → 월', /if \(ph54FmtDate\(d\) === todayStr\) openDay = i;/.test(render) && /if \(byDay\[k\]\.total\)\{ openDay = k; break; \}/.test(render));
  check('강사 머리글에 회수·분·부하 막대(B-3)', /class="ph54-load"><span style="width:' \+ Math\.round\(t\.mins \/ maxMins \* 100\)/.test(render));
  check('겹친 강사 머리글에 ⚠', /\(t\.dup \? ' ph54-dup-head' : ''\)/.test(render) && /\(t\.dup \? ' ⚠' : ''\)/.test(render));
  check('강사 순서는 원부 순(원부에 없는 번호는 뒤)', /var ia = \(a in rosterIdx\) \? rosterIdx\[a\] : 9999/.test(render));
  // 카드 함수
  const ev = fn('ph54EventCard'), c24 = (Q6.match(/function ph54C24Card\(s\)\{[\s\S]*?\n  \}/) || [''])[0];
  check('수업 카드가 자리(lay)를 받아 인라인에 넣는다', /function ph54EventCard\(idx, s, lay\)/.test(Q6) && /ph54LaneStyle\(lay\)/.test(ev) && /lay && lay\.dup \? ' ph54-dup'/.test(ev));
  check('카페24 카드는 시그니처(s) 그대로 — 자리는 s.__lay 로', /var lay\s*=\s*s\.__lay \|\| null;/.test(c24) && /ph54LaneStyle\(lay\)/.test(c24));
  check('카페24 카드에 자리를 «넣고 곧 지운다»(기록에 남지 않게)', /it\.rec\.__lay = it; out \+= ph54C24Card\(it\.rec\); it\.rec\.__lay = null;/.test(render));
  // 상호작용
  check('접힌 띠·머리글 클릭 → 그 요일 펼침', /querySelectorAll\('\.ph54-cal-fold, \.ph54-cal-fold-head'\)/.test(render) && /ph54State\.openDay = parseInt\(el\.getAttribute\('data-day'\), 10\); ph54Render\(\);/.test(render));
  check('강사 머리글 클릭 → 그 강사만', /querySelectorAll\('\.ph54-cal-subhead\[data-teacher\]'\)/.test(render) && /ph54State\.teacherFilter = el\.getAttribute\('data-teacher'\)/.test(render));
  check('키보드(Enter·Space)로도 열린다', (render.match(/e\.key === 'Enter' \|\| e\.key === ' '/g) || []).length >= 2);
  check('다시 그려도 스크롤 위치를 지킨다', /var keepTop = prevBody \? prevBody\.scrollTop : -1;/.test(render) && /if \(keepTop >= 0\) calBody\.scrollTop = keepTop;/.test(render));
  check('드롭 자리에 접힌 띠도 포함(.ph54-cal-col, .ph54-cal-fold)', /var PH54_DROP_SEL = '\.ph54-cal-col, \.ph54-cal-fold';/.test(render) && (render.match(/closest\(PH54_DROP_SEL\)/g) || []).length >= 4);
  check('접힌 띠에 놓으면 그 요일을 펼친다', /if \(col\.classList\.contains\('ph54-cal-fold'\)\) ph54State\.openDay = newCol;/.test(render));
  check('다른 강사 열에 놓아도 강사는 안 바뀐다고 «저장 토스트에 덧붙여» 말한다(따로 띄우면 0ms 뒤 덮인다)',
    /var keepNote = otherTeacher \? ph54T\(' · 강사는 그대로/.test(render) && /'✅ 저장됨: '[^\n]*\+ keepNote\);/.test(render)
    && !/if \(otherTeacher\) ph54Toast\(/.test(render) && /body: JSON\.stringify\(\{ day_of_week: dowKeyByIdx\[newCol\], start_time: newTime \}\)/.test(render));
  check('주를 옮기면 펼친 요일을 다시 정한다(3곳)', (render.match(/ph54State\.openDay = null;/g) || []).length === 3);
  check('안내문이 새 조작(요일 접기·강사 이름)을 한/영으로 말한다', /강사별 열<\/b>로 펼쳐져요/.test(render) && /one column per instructor/.test(render));
  check('범례에 빈 자리·겹침이 있다', /ph54-legend-gap/.test(render) && /ph54-legend-dup/.test(render));
}

console.log('\n[ C. CSS · 캐시 ]');
{
  for (const sel of ['.ph54-cal-fold', '.ph54-cal-subhead', '.ph54-gap', '.ph54-ev.ph54-dup', '.ph54-load span', '.ph54-daysep', '.ph54-cal-dayhead.ph54-open'])
    check(`CSS 에 ${sel} 규칙`, CSS.includes(sel + ' {') || CSS.includes(sel + '{'));
  check('겹침 표시는 outline(lite 모드의 box-shadow:none 에 살아남는다)', /\.ph54-ev\.ph54-dup \{ outline:2px solid/.test(CSS));
  check('빈 자리는 pointer-events:none(클릭·드롭이 열로 통과)', /\.ph54-gap \{[^}]*pointer-events:none/.test(CSS));
  const jsV = Number((HTML.match(/adm-q6\.js\?v=(\d+)/) || [])[1] || 0);
  const cssV = Number((HTML.match(/admin-inline-c\.css\?v=(\d+)/) || [])[1] || 0);
  check('admin.html 의 adm-q6.js ?v= 가 14 이상', jsV >= 14, `v=${jsV}`);
  check('admin.html 의 admin-inline-c.css ?v= 가 67 이상', cssV >= 67, `v=${cssV}`);
}

console.log('\n════════════════════════════════════════');
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
console.log('════════════════════════════════════════\n');
