/* my_schedule_rows_harness.mjs — 홈 «내 수업» 카드(js/idx-my-schedule.js)가 수업을 «한 건 = 한 줄» 로 그리는가
   (2026-09-14, 사장님 샘플 A 결정)
   [사고] 그전 코드는 모든 수업의 요일을 한 줄로 합치고 시간·강사는 list[0] 것 하나만 붙였다 →
          「매주 화·수·목·금 오후 7:20 · 강선생님」처럼 «없는 수업» 을 말했다.
   [방식] 문자열이 아니라 파일을 가짜 window/document 에서 «통째로 실행» 해 나온 HTML 을 본다.
          «갈라진다» 옆에 «같은 시각·강사는 합친다» 를 짝으로 둔다 — 앞만 보면 «전부 갈라 놓기» 도 통과한다.
   실패하면 exit 1. */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.env.NMS_SRC_FILE || path.join(ROOT, 'cloudflare-deploy/public/js/idx-my-schedule.js');
const src = fs.readFileSync(FILE, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name, extra != null ? '→ ' + extra : ''); } };

function render(schedules, lang = 'ko') {
  const styles = [];
  const doc = { getElementById: () => null, createElement: () => ({}), head: { appendChild: s => styles.push(String(s.textContent || '')) } };
  const win = { getLang: () => lang, getCurrentUser: () => ({ uid: 'stu1', name: '학생' }),
    fetch: () => Promise.resolve({ json: () => Promise.resolve({ ok: true, schedules }) }) };
  const ctx = vm.createContext({ window: win, document: doc, fetch: win.fetch, console });
  vm.runInContext(src, ctx);
  const c = { style: { display: 'none' }, innerHTML: '' };
  const first = win.__nccNoClassToday(c);
  return new Promise(res => setTimeout(() => { const drawn = win.__nccNoClassToday(c); res({ first, drawn, html: c.innerHTML, display: c.style.display, styles }); }, 5));
}
const rowsOf = html => [...html.matchAll(/<div class="nms-row[^"]*">([\s\S]*?)<\/div>/g)].map(m => m[0]);
const txt = (row, cls) => { const m = new RegExp('class="' + cls + '">([^<]*)<').exec(row); return m ? m[1] : null; };

const S = (id, days, time, teacher, next_date, ts, extra = {}) => ({ schedule_id: id, day_labels_ko: days.ko, day_labels_en: days.en, scheduled_date: null, start_time: time, teacher_name: teacher, next_date, next_start_ts: ts, ...extra });
const D = { 화: { ko: ['화'], en: ['Tue'] }, 수: { ko: ['수'], en: ['Wed'] }, 목: { ko: ['목'], en: ['Thu'] }, 금: { ko: ['금'], en: ['Fri'] } };

console.log('▶ my_schedule_rows_harness — 홈 «내 수업» 카드 세로 목록');
{
  // ① 사고 재현 입력: 강사·시간이 다른 수업 넷 (강선생님 화·목 7:20 / Kaye 수 5:00 / Farrah 금 8:40)
  const r = await render([
    S(1, D.화, '19:20', '중국어 강선생님', '2026-09-15', 1), S(2, D.목, '19:20', '중국어 강선생님', '2026-09-17', 3),
    S(3, D.수, '17:00', 'Teacher Kaye', '2026-09-16', 2), S(4, D.금, '20:40', 'Teacher Farrah', '2026-09-18', 4),
  ]);
  ok(r.first === false && r.drawn === true && r.display === 'block', '① 조회 전엔 false, 조회 뒤엔 그려서 true');
  const rows = rowsOf(r.html);
  ok(rows.length === 3, '① 강사·시간이 다르면 줄이 갈린다 (3줄)', rows.length);
  ok(rows.length && txt(rows[0], 'nms-day') === '화·목' && txt(rows[0], 'nms-teacher') === '중국어 강선생님', '① 같은 시각·같은 강사(화/목)는 한 줄로 합친다', rows[0]);
  ok(!/화·수·목·금|화·수|수·목/.test(r.html), '① 옛 사고 문장(요일 전부 합침)이 없다');
  ok(/nms-next/.test(rows[0] || '') && /다음 · 9\/15/.test(rows[0] || ''), '① 다음 수업이 맨 위 + 「다음 · 9/15」', rows[0]);
  ok(rows.slice(1).every(x => !/nms-next/.test(x)), '① 강조는 한 줄뿐');
  ok(txt(rows[1] || '', 'nms-teacher') === 'Teacher Kaye' && txt(rows[2] || '', 'nms-teacher') === 'Teacher Farrah', '① 다음 날짜 순 정렬 (Kaye 9/16 → Farrah 9/18)');
  ok(/매주 4회/.test(r.html) && /강사 3명/.test(r.html), '① 머리글: 매주 4회 · 강사 3명');
  ok(r.styles.length === 1 && !/transform\s*:\s*(scale|translate)/.test(r.styles[0]), '① 스타일 1회 주입 · hover 확대 없음');
}
{
  // ② 서로 «다른» 강사가 같은 시각이면 합치지 않는다 (짝 검사 — 합치기 조건이 «시각만» 이면 여기서 잡힌다)
  const r = await render([S(1, D.화, '19:20', '강선생님', '2026-09-15', 1), S(2, D.목, '19:20', 'Teacher Kaye', '2026-09-17', 3)]);
  ok(rowsOf(r.html).length === 2, '② 같은 시각이라도 강사가 다르면 두 줄', rowsOf(r.html).length);
  const r2 = await render([S(1, D.화, '19:20', '강선생님', '2026-09-15', 1), S(2, D.목, '20:00', '강선생님', '2026-09-17', 3)]);
  ok(rowsOf(r2.html).length === 2, '② 같은 강사라도 시각이 다르면 두 줄', rowsOf(r2.html).length);
}
{
  // ③ 강사 이름은 DB 값 — 이스케이프
  const r = await render([S(1, D.화, '19:20', '<img src=x onerror=alert(1)>', '2026-09-15', 1)]);
  ok(!/<img/.test(r.html) && /&lt;img/.test(r.html), '③ 강사 이름의 HTML 이 이스케이프된다');
}
{
  // ④ 일회성 수업: 요일 칸에 날짜, 같은 날짜를 두 번 적지 않는다 · 날짜 없는 줄은 맨 아래
  const r = await render([S(1, D.화, '19:20', 'A', '2026-09-15', 1), S(2, { ko: [], en: [] }, '10:00', 'B', '2026-09-20', 9, { scheduled_date: '2026-09-20' }), S(3, D.금, '11:00', 'C', null, null)]);
  const rows = rowsOf(r.html);
  ok(rows.length === 3 && txt(rows[1], 'nms-day') === '9/20' && (rows[1].match(/9\/20/g) || []).length === 1, '④ 일회성은 날짜가 요일 칸에 한 번만', rows[1]);
  ok(txt(rows[2], 'nms-teacher') === 'C' && !/nms-date/.test(rows[2]), '④ 다음 날짜를 못 구한 줄은 맨 아래, 날짜 칸 없음');
}
{
  // ⑤ 영어
  const r = await render([S(1, D.화, '19:20', 'A', '2026-09-15', 1), S(2, D.목, '19:20', 'A', '2026-09-17', 3)], 'en');
  const rows = rowsOf(r.html);
  ok(txt(rows[0], 'nms-day') === 'Tue/Thu' && /7:20 PM/.test(rows[0]) && /Next · 9\/15/.test(rows[0]) && /My classes/.test(r.html), '⑤ EN: Tue/Thu · 7:20 PM · Next · 9/15', rows[0]);
}
{
  // ⑥ 수업이 0건이면 false(호출부가 hide)
  const r = await render([]);
  ok(r.drawn === false, '⑥ 수업 0건이면 false');
}
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
