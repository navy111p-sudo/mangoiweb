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
  const labMin = (Q6.match(/var PH54_GAP_LABEL_MIN = (\d+);/) || [])[1];
  check('«빈 N분» 글자 자리 최소 분(PH54_GAP_LABEL_MIN)을 소스에서 읽었다', !!labMin, `labMin=${labMin}`);
  const mk = new Function('PH54_START_H', 'PH54_END_H', 'PH54_HOUR_PX', 'PH54_GAP_MIN', 'PH54_GAP_LABEL_MIN', 'ph54T', 'ph54Pad',
    src + '\nreturn { ph54LayoutItems, ph54LaneStyle, ph54GapHtml, ph54FoldGradient };');
  L = mk(6, 24, 50, Number(gapMin), Number(labMin), (ko) => ko, (n) => (n < 10 ? '0' + n : '' + n));
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
  // 2026-11-04: 직접 대입(calBody.scrollTop = keepTop)은 렌더 생략된 카드에서 무시될 때가 있어 ph54SetScrollTop 으로 — [E] 에서 실제로 돌린다
  check('다시 그려도 스크롤 위치를 지킨다(이전 값을 읽어 ph54SetScrollTop 으로 넣는다)', /var keepTop = prevBody \? prevBody\.scrollTop : -1;/.test(render) && /if \(keepTop >= 0\) ph54SetScrollTop\(calBody, keepTop\);/.test(render));
  check('처음 그릴 때(첫 수업 한 시간 위)도 같은 도우미로 넣는다', /if \(firstSt >= 0\) ph54SetScrollTop\(calBody, /.test(render));
  check('렌더 안에서 calBody.scrollTop 에 «직접» 대입하는 줄이 없다', !/calBody\.scrollTop\s*=(?!=)/.test(render));
  check('드롭 자리에 접힌 띠도 포함(.ph54-cal-col, .ph54-cal-fold)', /var PH54_DROP_SEL = '\.ph54-cal-col, \.ph54-cal-fold';/.test(render) && (render.match(/closest\(PH54_DROP_SEL\)/g) || []).length >= 4);
  check('접힌 띠에 놓으면 그 요일을 펼친다', /if \(col\.classList\.contains\('ph54-cal-fold'\)\) ph54State\.openDay = newCol;/.test(render));
  // 2026-10-10: 드롭이 옛 단건 PATCH(day_of_week 만 보냄 → 날짜 지정 수업은 날짜가 안 바뀌던 버그)에서
  //   원자 이동 API(/class-schedules/move)로 바뀌었다. «강사는 그대로» 안내는 저장 «전» 확인창에 실린다.
  //   (옛 검사는 그 버그 body 를 글자 그대로 못 박고 있었다 — 뜻으로 옮겨 적음. 세부는 ph54_drag_move_harness)
  check('다른 강사 열에 놓아도 강사는 안 바뀐다고 확인창에서 말하고, 따로 토스트를 띄우지 않는다',
    /(?<!!)otherTeacher \? ph54T\('\\nℹ️ 강사는 그대로/.test(render) && !/if \(otherTeacher\) ph54Toast\(/.test(render)
    && !/day_of_week: dowKeyByIdx\[newCol\]/.test(render) && /ph54SaveMove\(plan,/.test(render));
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

/* ─────────────────────────────────────────────────────────────────────────────
   [D] 🧾 (2026-11-03 사장님 «주간 시간표도 똑같이») 취소·연기 회차를 «지우지 않고» 남긴다.
       서버 /api/admin/schedules 의 off_items(PR #2000) 를 이 캘린더도 읽는다 — 보기 전용 카드.
       함수를 오려 내 **실제로 돌린다**. 화면 확인은 test-harness/manual/teacher-calendar-cancelled-browser.mjs.
   ───────────────────────────────────────────────────────────────────────────── */
console.log('\n[ D. 취소·연기 카드 — 실제로 돌린다 ]');
{
  const it = (st, du, k, kind) => ({ st, du, k, kind });
  // D-1 배치: 취소 칸은 «겹침» 이 아니다 — 그래도 자리는 나눈다(포개지지 않게)
  let r = L.ph54LayoutItems([it(840, 20, 'live', 'rec'), it(840, 20, 'gone', 'off')]);
  const lv = r.items.find((v) => v.k === 'live'), gn = r.items.find((v) => v.k === 'gone');
  check('🔴 D-1 취소한 자리에 넣은 새 수업은 dup 가 아니다', !lv.dup && !gn.dup, JSON.stringify(r.items));
  check('D-1 그래도 두 카드는 자리를 나눈다(lanes=2 · 서로 다른 lane)', lv.lanes === 2 && gn.lanes === 2 && lv.lane !== gn.lane, JSON.stringify(r.items));
  r = L.ph54LayoutItems([it(840, 20, 'a', 'rec'), it(840, 20, 'b', 'rec'), it(840, 20, 'c', 'off')]);
  check('D-1 진짜 수업 둘이 겹치면 여전히 dup(취소 칸이 끼어도)', r.items.filter((v) => v.kind === 'rec').every((v) => v.dup) && !r.items.find((v) => v.kind === 'off').dup, JSON.stringify(r.items));

  // D-2 묶기: 그룹(학생마다 한 행) 합치기 · 모양이 이상한 줄은 버림
  const mergeSrc = fn('ph54MergeOff');
  check('D-2 ph54MergeOff 를 소스에서 오려 냈다', mergeSrc.length > 300, `len=${mergeSrc.length}`);
  let M = null;
  try { M = new Function(mergeSrc + '\nreturn ph54MergeOff;')(); } catch (e) { check('D-2 묶기 함수 실행 준비', false, String(e)); }
  if (M) {
    const out = M([
      { off: 'cancelled', teacher_id: 24, date: '2026-11-03', start_time: '18:00', duration_min: 40, students: [{ name: 'A', uid: 'a' }] },
      { off: 'cancelled', teacher_id: 24, date: '2026-11-03', start_time: '18:00', duration_min: 40, students: [{ name: 'B', uid: 'b' }] },
      { off: 'cancelled', teacher_id: 24, date: '2026-11-03', start_time: '18:00', duration_min: 40, students: [{ name: 'A', uid: 'a' }] },
      { off: 'postponed', teacher_id: 24, date: '2026-11-03', start_time: '18:00', duration_min: 40, students: [{ name: 'P', uid: 'p' }] },
      { off: 'cancelled', teacher_id: null, date: '2026-11-03', start_time: '19:00' },
      { off: 'cancelled', teacher_id: 24, start_time: '19:00' },
      null,
    ]);
    check('D-2 같은 강사·날짜·시각·상태는 한 장(학생 A·B, 중복 A 는 한 번)', out.length === 2 && out[0].students.map((s) => s.name).join(',') === 'A,B', JSON.stringify(out));
    check('D-2 상태가 다르면(취소 vs 연기) 따로', out.some((o) => o.off === 'postponed'), JSON.stringify(out));
    check('D-2 강사·날짜 없는 줄·null 은 버린다(아무 칸에나 놓지 않는다)', out.every((o) => o.teacher_id != null && o.date), JSON.stringify(out));
    check('D-2 모르는 상태는 «취소» 로, 길이 없으면 20분', M([{ off: 'zz', teacher_id: 1, date: '2026-11-03' }])[0].off === 'cancelled' && M([{ teacher_id: 1, date: '2026-11-03' }])[0].duration_min === 20);
    check('D-2 배열이 아니면 빈 목록(옛 서버)', M(undefined).length === 0 && M({}).length === 0);
  }

  // D-3 카드: 보기 전용 — draggable·data-idx·data-block 없음, 글자는 서버 것
  const cardSrc = fn('ph54OffCard');
  check('D-3 ph54OffCard 를 소스에서 오려 냈다', cardSrc.length > 600, `len=${cardSrc.length}`);
  let C = null;
  try {
    C = new Function('PH54_START_H', 'PH54_HOUR_PX', 'PH54_TYPE_LABEL', 'ph54MinOf', 'ph54FmtMin', 'ph54T', 'ph54En', 'ph54Esc', 'ph54LaneStyle',
      cardSrc + '\nreturn ph54OffCard;')(6, 50, { '1on1': '정규' },
      (s) => { const m = String(s.start_time).match(/(\d+):(\d+)/); return (+m[1]) * 60 + (+m[2]); },
      (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'),
      (ko) => ko, () => false, (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
      L.ph54LaneStyle);
  } catch (e) { check('D-3 카드 함수 실행 준비', false, String(e)); }
  if (C) {
    const cx = C({ off: 'cancelled', start_time: '14:00', duration_min: 20, type: '1on1', students: [{ name: 'lby' }],
      change: { label_ko: '✕ 취소됨', label_en: '✕ Cancelled', by: 'Maimai', at_kst: '11/02 14:22', reason: '학생 요청' } }, null);
    const pp = C({ off: 'postponed', start_time: '16:00', duration_min: 20, type: '1on1', students: [],
      change: { label_ko: '⏸ 연기됨 — 새 날짜 미정', label_en: '⏸ Postponed — no new date', by: null, at_kst: null, reason: null } }, null);
    check('🔴 D-3 draggable 이 없다', !/draggable/.test(cx) && !/draggable/.test(pp));
    check('🔴 D-3 data-idx·data-block 이 없다(드래그·차단 삭제가 그 둘로 돈다)', !/data-idx|data-block/.test(cx + pp));
    check('D-3 .ph54-ev .ph54-off .ph54-locked + data-off', /class="ph54-ev ph54-off ph54-locked"/.test(cx) && /data-off="cancelled"/.test(cx) && /data-off="postponed"/.test(pp));
    check('D-3 글자는 서버 것(✕ 취소됨 / ⏸ 연기됨 — 새 날짜 미정)', />✕ 취소됨</.test(cx) && />⏸ 연기됨 — 새 날짜 미정</.test(pp));
    check('D-3 툴팁에 처리·사유(서버가 실었을 때만)', /처리: Maimai · 11\/02 14:22/.test(cx) && /사유: 학생 요청/.test(cx) && !/처리:/.test(pp) && !/사유:/.test(pp));
    check('D-3 취소는 시각에 취소선, 연기는 점선 테두리', /line-through/.test(cx) && !/line-through/.test(pp) && /dashed/.test(pp));
    check('D-3 학생이 없으면 유형 이름으로(빈 카드 금지)', />정규</.test(pp));
    check('D-3 색은 밝은 회색만(어두운 그라데이션이면 페인터가 덮는다)', !/rgba\(15,23,42/.test(cx + pp) && /#f1f5f9/.test(cx));
  }

  // D-4 배선 — 그 자리에서 쓰는가
  const render = (Q6.match(/function ph54Render\(\)\{[\s\S]*?\n  \}\n/) || [''])[0];
  const loader = (Q6.match(/async function ph54LoadSchedules\(\)\{[\s\S]*?\n  \}/) || [''])[0];
  check('D-4 불러올 때 off_items 를 묶어 둔다', /ph54State\.off = ph54MergeOff\(j && j\.off_items\);/.test(loader));
  check('🔴 D-4 «다 읽었다» 는 서버가 off_complete === true 라고 말할 때만', /ph54State\.offComplete = !!\(j && j\.off_complete === true\);/.test(loader));
  check('D-4 못 읽으면 비우고 «모름»', /ph54State\.off = \[\]; ph54State\.offComplete = false;/.test(loader));
  check('D-4 그 주·그 강사(필터)만', /\(ph54State\.off \|\| \[\]\)\.forEach\(function\(r\)\{\s*if \(!r \|\| !\(r\.date in dateToCol\)\) return;\s*if \(filterId && String\(r\.teacher_id\) !== String\(filterId\)\) return;\s*offEvents\.push/.test(render));
  check('D-4 강사 열에 kind:off 로 넣고 따로 센다(offn)', /b\.items\.push\(\{ kind: 'off'/.test(render) && /b\.offn\+\+/.test(render));
  check('🔴 D-4 수업 수·분에는 안 센다(n·mins 는 rec 에서만)', !/kind: 'off'[^\n]*b\.n\+\+/.test(render));
  check('D-4 카드 그리기가 off 를 ph54OffCard 로', /else if \(it\.kind === 'off'\) out \+= ph54OffCard\(it\.rec, it\);/.test(render));
  check('D-4 접힌 띠 밀도에서 off 를 뺀다', /t\.items\.filter\(function\(it\)\{ return it\.kind !== 'off'; \}\)/.test(render));
  check('D-4 범례가 «모름» 을 «?» 로(0 이라고 단정하지 않는다)', /\(!ph54State\.offComplete && !offEvents\.length\) \? '\?'/.test(render));
  check('D-4 범례 한/영(✕ 취소 · ⏸ 연기 / ✕ Cancelled · ⏸ Postponed)', /✕ 취소 · ⏸ 연기/.test(render) && /✕ Cancelled · ⏸ Postponed/.test(render));
  const jsV2 = Number((HTML.match(/adm-q6\.js\?v=(\d+)/) || [])[1] || 0);
  check('D-4 admin.html 의 adm-q6.js ?v= 가 22 이상', jsV2 >= 22, `v=${jsV2}`);

  // D-7 (2026-11-04 사장님 「빈 N분 점선 상자도 같이 보이게 해줘」) 취소·연기 칸은 빈 자리를 «점유» 하지 않는다 — 실제로 돌린다
  {
    const R = (st, du) => ({ kind: 'rec', st, du }), O = (st, du) => ({ kind: 'off', st, du });
    let r = L.ph54LayoutItems([R(780, 20), O(820, 40), R(900, 20)]);   // 13:00 수업 · 13:40~14:20 취소 · 15:00 수업
    check('🔴 D-7 취소 칸이 있어도 수업 사이 빈 자리를 그린다(13:20~15:00 = 100분)', r.gaps.length === 1 && r.gaps[0].st === 800 && r.gaps[0].du === 100, JSON.stringify(r.gaps));
    check('D-7 그 취소 칸은 «빈 자리 안» 표시(inGap)', r.items.find((x) => x.kind === 'off').inGap === true);
    check('🔴 D-7 글자는 카드에 안 덮인 가장 긴 구간(14:20~15:00, 40분)에', r.gaps[0].lst === 860 && r.gaps[0].ldu === 40 && !r.gaps[0].tag, JSON.stringify(r.gaps[0]));
    r = L.ph54LayoutItems([R(780, 20), O(800, 40), R(840, 20)]);   // 취소 카드가 빈 자리를 꽉 채움
    check('🔴 D-7 카드가 빈 자리를 꽉 채우면 꼬리표(tag)로 — 글자가 카드 밑에 묻히지 않게', r.gaps.length === 1 && r.gaps[0].du === 40 && r.gaps[0].tag === true, JSON.stringify(r.gaps));
    r = L.ph54LayoutItems([R(780, 20), O(800, 30), R(840, 20)]);   // 덮이지 않은 구간 10분(< 글자 최소)
    check('D-7 덮이지 않은 구간이 짧으면(10분) 꼬리표', r.gaps[0] && r.gaps[0].tag === true, JSON.stringify(r.gaps));
    r = L.ph54LayoutItems([R(780, 20), R(840, 20)]);
    check('D-7 취소 칸이 없으면 예전 그대로(가운데 글자 — lst·tag 없음)', r.gaps.length === 1 && r.gaps[0].lst == null && !r.gaps[0].tag, JSON.stringify(r.gaps));
    r = L.ph54LayoutItems([R(780, 40), O(790, 20), R(900, 20)]);   // 수업 시간과 겹친 취소 칸은 빈 자리 밖
    check('D-7 수업과 같은 시간의 취소 칸은 «빈 자리 안» 이 아니다', r.items.find((x) => x.kind === 'off').inGap === false && r.gaps.length === 1 && r.gaps[0].st === 820, JSON.stringify(r));
    r = L.ph54LayoutItems([O(800, 40)]);
    check('D-7 취소 칸만 있으면 빈 자리 없음(앞뒤는 세지 않는다)', r.gaps.length === 0);
    const again = [R(780, 20), O(800, 40), R(840, 20), R(900, 20)];
    const first = L.ph54LayoutItems(again).items.find((x) => x.kind === 'off').inGap;
    again[1].st = 845; again[1].du = 10;   // 같은 객체를 수업(840~860) 안으로 옮겨 다시 배치
    const r2 = L.ph54LayoutItems(again);
    check('D-7 다시 배치하면 inGap 을 지운다(같은 객체를 두 번 배치하는 강사 필터 경로)', first === true && r2.items.find((x) => x.kind === 'off').inGap === false, JSON.stringify(r2.items));
    const tagH = L.ph54GapHtml({ st: 800, du: 40, tag: true }), labH = L.ph54GapHtml({ st: 800, du: 100, lst: 860, ldu: 40 });
    check('D-7 꼬리표 HTML — .ph54-gap-tag · 카드 위(z-index) · «빈 40분»', /class="ph54-gap-tag"/.test(tagH) && /z-index:3/.test(tagH) && /빈 40분/.test(tagH), tagH);
    check('D-7 구간 글자 HTML — .ph54-gap-lab 이 덮이지 않은 구간 위치(48px)에', /class="ph54-gap-lab"/.test(labH) && /top:48\.0px/.test(labH) && /빈 100분/.test(labH), labH);
  }
  if (C) {
    const inG = C({ off: 'cancelled', start_time: '14:00', duration_min: 40, type: '1on1', students: [{ name: 'x' }], change: {} }, { inGap: true, lanes: 1 });
    const inG2 = C({ off: 'cancelled', start_time: '14:00', duration_min: 40, type: '1on1', students: [{ name: 'x' }], change: {} }, { inGap: true, lanes: 2, lane: 0 });
    const outG = C({ off: 'cancelled', start_time: '14:00', duration_min: 40, type: '1on1', students: [{ name: 'x' }], change: {} }, { inGap: false, lanes: 1 });
    check('D-7 빈 자리 안의 혼자인 취소 카드는 안쪽으로(점선이 양옆에 보이게)', /left:7px;right:7px;/.test(inG) && !/left:7px/.test(outG));
    check('D-7 자리를 나눈 카드는 안쪽으로 안 민다(lane 폭을 깨지 않게)', !/left:7px/.test(inG2));
  }

  // D-6 (2026-11-04 사장님 「강사 열 빼는 것도 해줘」) 전체 보기에서 «취소·연기만» 있는 강사는 열이 없다 — 판정을 실제로 돌린다
  const laneSrc = fn('ph54ShowsLane');
  check('D-6 ph54ShowsLane 을 소스에서 오려 냈다', laneSrc.length > 40, `len=${laneSrc.length}`);
  let SL = null;
  try { SL = new Function(laneSrc + '\nreturn ph54ShowsLane;')(); } catch (e) { check('D-6 판정 실행 준비', false, String(e)); }
  if (SL) {
    const T = (...kinds) => ({ items: kinds.map((k) => ({ kind: k })) });
    check('🔴 D-6 취소·연기만 있으면 열을 안 준다', SL(T('off')) === false && SL(T('off', 'off')) === false);
    check('🔴 D-6 수업이 하나라도 있으면 열을 준다(짝 — «전부 빼기» 를 막는다)', SL(T('off', 'rec')) === true && SL(T('rec')) === true);
    check('D-6 카페24 겹쳐보기만 있어도 열을 준다', SL(T('c24', 'off')) === true);
    check('D-6 빈 묶음·이상한 값은 열을 안 준다(던지지 않는다)', SL(T()) === false && SL(null) === false && SL({}) === false);
  }
  check('🔴 D-6 열을 빼는 것은 «전체 보기» 에서만(강사 필터에서는 그 강사의 취소 카드를 볼 유일한 자리)', /var tlist = accordion \? tall\.filter\(ph54ShowsLane\) : tall;/.test(render));
  check('🔴 D-6 취소·연기 건수는 뺀 강사까지 센다(머리글이 사실을 말한다)', /offn: tall\.reduce\(/.test(render) && /hidOffn: thid\.reduce\(/.test(render));
  check('D-6 펼친 요일 머리글이 «열 없음 N» 을 말한다(한/영)', /그중 ' \+ bd\.hidOffn \+ '개는 열 없음/.test(render) && /without a column/.test(render));
  check('D-6 «펼친 요일» 고르기는 열이 있는 것만 센다(total 은 보이는 강사 기준)', /total: tlist\.reduce\(/.test(render));

  // D-5 (2026-11-03 후속) 함정 대조가 찾은 셋 — 클릭 길 · «N개 이상» 문구 · 수업 수에 안 섞이는가(«위치» 가 아니라 «몸통» 으로)
  const blkSrc = fn('ph54CardBlocksClick');
  check('D-5 ph54CardBlocksClick 을 소스에서 오려 냈다', blkSrc.length > 60, `len=${blkSrc.length}`);
  let B = null;
  try { B = new Function(blkSrc + '\nreturn ph54CardBlocksClick;')(); } catch (e) { check('D-5 클릭 판정 실행 준비', false, String(e)); }
  if (B) {
    const el = (cls) => { const c = { classList: { contains: (k) => cls.split(' ').includes(k) } }; return { closest: (sel) => (sel === '.ph54-ev' && cls ? c : null) }; };
    check('🔴 D-5 진짜 수업 카드 위 클릭은 막는다(드래그·상세와 안 겹치게)', B(el('ph54-ev')) === true);
    check('🔴 D-5 취소·연기 카드 위 클릭은 통과(그 시간은 비어 있다 — 차단할 수 있어야)', B(el('ph54-ev ph54-off ph54-locked')) === false);
    check('D-5 카드 밖 클릭은 통과', B(el('')) === false && B(null) === false);
  }
  const blkCalls = (Q6.match(/if \(ph54CardBlocksClick\(ev\.target\)\) return;/g) || []).length;
  check('D-5 빈 칸 클릭 두 곳(차단 창·안내)이 그 판정을 쓴다', blkCalls === 2, `calls=${blkCalls}`);
  check('D-5 옛 «카드면 무조건 무시» 가 그 두 곳에 남아 있지 않다', !/ev\.target\.closest\('\.ph54-ev'\)\) return;/.test(Q6));
  const fe = render.indexOf("offEvents.forEach(function(e){");
  let feBody = '';
  if (fe >= 0) { let d = 0, i = render.indexOf('{', fe); const st = i; for (; i < render.length; i++) { if (render[i] === '{') d++; else if (render[i] === '}') { d--; if (!d) break; } } feBody = render.slice(st, i + 1); }
  check('D-5 취소 칸을 강사 열에 넣는 몸통을 잘라 냈다', /kind: 'off'/.test(feBody), `len=${feBody.length}`);
  check('🔴 D-5 그 몸통은 수업 수·분(b.n·b.mins)을 안 건드린다', feBody && !/\bb\.n\b|\bb\.mins\b/.test(feBody), feBody.slice(0, 200));
  const cntExpr = (render.match(/\(\(!ph54State\.offComplete && !offEvents\.length\) \? '\?' : \(offEvents\.length \+ ph54T\('개',''\)\)\)/) || [''])[0];
  check('D-5 범례 건수 식을 오려 냈다', cntExpr.length > 40, cntExpr);
  if (cntExpr) {
    const run = (complete, n) => { try { return new Function('ph54State', 'offEvents', 'ph54T', 'return ' + cntExpr + ';')({ offComplete: complete }, new Array(n), (ko) => ko); } catch (e) { return 'ERR ' + e; } };
    check('🔴 D-5 모름 + 0줄 → «?»(0 이라고 단정 안 함)', run(false, 0) === '?', run(false, 0));
    check('D-5 다 읽음 + 0줄 → «0개»', run(true, 0) === '0개', run(true, 0));
    check('🔴 D-5 일부만(누가·사유) + 3줄 → «3개»(줄은 다 왔으니 건수는 정확 — «이상» 이라 하지 않는다)', run(false, 3) === '3개', run(false, 3));
    check('D-5 다 읽음 + 3줄 → «3개»', run(true, 3) === '3개', run(true, 3));
  }
  check('D-5 일부만일 때 설명이 «누가·사유 일부 + 건수는 정확» 을 말한다', /누가·언제·사유를 일부 불러오지 못했습니다 \(건수는 정확합니다\)/.test(render) && /the count is exact/.test(render));
  check('D-5 EN 카드는 유형 이름도 영어(학생이 없을 때)', /typeEn\[s\.type\]/.test(cardSrc));
}

console.log('\n[ E. 스크롤 위치 넣기 도우미 — 실제로 돌린다 ]');
{
  /* 2026-11-04 사장님 「스크롤 위치 유지 실패도 고쳐줘」. 카드가 content-visibility:auto 로 렌더 생략된 상태에서
     포커스 요소(접힌 요일 머리글)를 지운 직후엔 scrollTop 대입이 무시된다 — 배치(scrollHeight)를 «먼저» 읽으면 들어간다(실측).
     가짜 요소: scrollHeight 를 읽기 «전» 의 대입은 무시한다(그 상태를 흉내). */
  const src = fn('ph54SetScrollTop');
  check('E ph54SetScrollTop 을 소스에서 오려 냈다', src.length > 80, `len=${src.length}`);
  let S = null, rafQ = [];
  try { S = new Function('window', 'requestAnimationFrame', src + '\nreturn ph54SetScrollTop;')({ requestAnimationFrame: 1 }, (cb) => rafQ.push(cb)); }
  catch (e) { check('E 도우미 실행 준비', false, String(e)); }
  const mkEl = (opt = {}) => ({ _st: 0, _laid: !!opt.laid, _stuck: !!opt.stuck, isConnected: true, clientHeight: 560,
    get scrollHeight(){ this._laid = true; return 999; },
    get scrollTop(){ return this._st; },
    set scrollTop(v){ if (this._laid && !this._stuck) this._st = Math.max(0, Math.min(v, 999 - 560)); } });
  if (S) {
    let e = mkEl(); rafQ = [];
    try { S(e, 250); } catch (er) { check('E 도우미가 던지지 않는다', false, String(er)); }
    check('🔴 E 배치가 늦은 칸에도 «그 자리에서» 들어간다(250)', e.scrollTop === 250, String(e.scrollTop));
    check('E 들어갔으면 다음 화면 갱신 때 다시 넣지 않는다', rafQ.length === 0, String(rafQ.length));
    e = mkEl({ laid: true }); rafQ = []; S(e, 300);
    check('E 평소(배치가 된 칸)도 그대로 들어간다(300)', e.scrollTop === 300 && rafQ.length === 0, JSON.stringify([e.scrollTop, rafQ.length]));
    e = mkEl({ stuck: true }); rafQ = []; S(e, 200);
    check('E 그래도 안 들어갔으면 다음 화면 갱신 때 한 번 더 넣는다(대기 1건)', e.scrollTop === 0 && rafQ.length === 1, JSON.stringify([e.scrollTop, rafQ.length]));
    e._stuck = false; rafQ.forEach((cb) => cb());
    check('E 그 한 번 더에서 들어간다(200)', e.scrollTop === 200, String(e.scrollTop));
    e = mkEl({ stuck: true }); rafQ = []; S(e, 200); e.isConnected = false; e._stuck = false; rafQ.forEach((cb) => cb());
    check('E 그 사이 다시 그려져 떨어진 칸에는 안 넣는다', e.scrollTop === 0, String(e.scrollTop));
    e = mkEl({ stuck: true }); rafQ = []; S(e, 5000);
    check('E 스크롤 끝보다 큰 값은 다시 시도하지 않는다(끝까지 간 것이 정상)', rafQ.length === 0, String(rafQ.length));
    e = mkEl({ laid: true }); e._st = 120; rafQ = []; S(e, -1); S(e, null); S(null, 100);
    check('E 값이 없거나(-1·null) 칸이 없으면 아무것도 안 한다', e.scrollTop === 120 && rafQ.length === 0, JSON.stringify([e.scrollTop, rafQ.length]));
    e = mkEl({ laid: true }); e._st = 120; rafQ = []; S(e, 0);
    check('E 0 은 정당한 값 — 맨 위로 넣는다', e.scrollTop === 0, String(e.scrollTop));
  }

  /* E-2 렌더 배선 — 위는 «도우미» 만 돌린다. ph54Render 가 그 값을 «실제로 넘기는가» 는 이 절이 돌린다
     (함정 대조 2026-11-04: `if (false && calBody)` · `keepTop = -1` 덧붙이기가 글자 검사만으로는 둘 다 통과했다).
     이전 칸을 읽는 줄부터 `if (calBody){…}` 블록 끝까지를 중괄호 짝으로 오려 가짜 document·도우미로 실행한다. */
  const render = (Q6.match(/function ph54Render\(\)\{[\s\S]*?\n  \}\n/) || [''])[0];
  const st0 = render.indexOf("var prevBody = document.getElementById('ph54-cal-body');");
  const ifAt = st0 >= 0 ? render.indexOf('if (calBody){', st0) : -1;
  let wireSrc = '';
  if (ifAt >= 0) {
    let d = 0, i = render.indexOf('{', ifAt);
    for (; i < render.length; i++) { if (render[i] === '{') d++; else if (render[i] === '}') { d--; if (d === 0) break; } }
    wireSrc = render.slice(st0, i + 1);
  }
  check('E-2 전제: 렌더의 스크롤 배선 블록을 오려 냈다', wireSrc.length > 200 && /ph54SetScrollTop\(calBody, keepTop\)/.test(wireSrc), `len=${wireSrc.length}`);
  const runWire = (prev, items) => {
    const calls = [], nb = { id: 'new' };
    const doc = { getElementById: (id) => (id !== 'ph54-cal-body' ? null : (doc._done ? nb : prev)), _done: false };
    const wrap = {}; Object.defineProperty(wrap, 'innerHTML', { set(){ doc._done = true; } });
    const byDay = [{ teachers: [{ items }] }];
    try {
      new Function('document', 'wrap', 'html', 'accordion', 'byDay', 'openDay', 'PH54_START_H', 'PH54_HOUR_PX', 'ph54SetScrollTop', wireSrc)
        (doc, wrap, '<x>', true, byDay, 0, 6, 50, (el, v) => calls.push([el === nb ? 'new' : (el && el.id) || String(el), v]));
    } catch (er) { return 'ERR ' + er; }
    return JSON.stringify(calls);
  };
  // 이전 칸이 300 이면 «새 칸» 에 300
  check('🔴 E-2 다시 그리면 이전 칸의 위치(300)를 «새 칸» 에 넘긴다', runWire({ scrollTop: 300 }, [{ st: 600 }]) === '[["new",300]]', runWire({ scrollTop: 300 }, [{ st: 600 }]));
  check('E-2 이전 위치가 0 이어도 0 을 넘긴다(맨 위가 정당한 자리)', runWire({ scrollTop: 0 }, [{ st: 600 }]) === '[["new",0]]', runWire({ scrollTop: 0 }, [{ st: 600 }]));
  // 처음(이전 칸 없음)이면 첫 수업 한 시간 위 — 10:00 수업 → 09:00 = (600-60-360)/60*50 = 150
  check('E-2 처음 그릴 때는 첫 수업 한 시간 위(10:00 → 150px)', runWire(null, [{ st: 700 }, { st: 600 }]) === '[["new",150]]', runWire(null, [{ st: 700 }, { st: 600 }]));
  check('E-2 처음인데 수업이 없으면 아무것도 안 넣는다', runWire(null, []) === '[]', runWire(null, []));
}

console.log('\n════════════════════════════════════════');
console.log(`  ${FAIL ? '⚠' : '✅'} 실패 ${FAIL}건 / 통과 ${PASS}건`);
if (FAIL) { FAILS.forEach((f) => console.log('   ❌ ' + f)); process.exitCode = 1; }
console.log('════════════════════════════════════════\n');
