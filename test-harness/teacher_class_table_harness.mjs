/* 강사 화면 «표 보기»(매니저 화면처럼) — 2026-10-26 강사 제안 3.
   teacher.html 의 classTableHtml·extrasHtml·portalContact 를 오려 내 «실제로 돌려» 답을 본다.
   ① 매니저 화면과 같은 칸 순서 15칸 ② 강사가 안 쓰는 칸(결제 유형·연기·참관·초대 링크·메시지)이 없다
   ③ 버튼은 넘겨준 함수(opt.act)가 그린다 — 안내용 줄(LMS)에는 버튼을 안 준다(짝)
   ④ 이전 강사·연락처·학원이 보인다 / 모르면 «—» ⑤ 옛 응답(칸 없음)에서도 던지지 않는다
   ⑥ 카드 보기 출력은 그대로다(asParts 를 안 주면 문자열). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(process.env.TCH_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'teacher.html'), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const ok = (n, c, d) => { c ? pass++ : fail++; console.log((c ? '  ✅ ' : '  ❌ FAIL ') + n + (c || d === undefined ? '' : '  — ' + JSON.stringify(d).slice(0, 300))); };
function fn(name) {
  const a = html.indexOf('  function ' + name + '(');
  if (a < 0) return '';
  let i = html.indexOf('{', a), d = 0;
  for (; i < html.length; i++) { if (html[i] === '{') d++; else if (html[i] === '}') { d--; if (!d) break; } }
  return html.slice(a, i + 1);
}
const src = ['classTableHtml', 'extrasHtml', 'portalContact'].map(fn);
ok('전제: 세 함수를 오려 냈다', src.every(s => s.length > 200), src.map(s => s.length));

let api = null;
try {
  api = new Function('MangoiClassDisplay', 'stuLabelHtml', 'stuLabelText', 'stuUid', 'kindPill', 'goalHtml', 'preqHtml', 'handoverHtml', 'todayKST', 'hhmm', 'T', 'esc',
    src.join('\n') + '\nreturn { classTableHtml, extrasHtml, portalContact };')(
    { range: c => c.start_time }, c => c.student_name || '', c => c.student_name || '', c => String(c.student_uid || ''), () => '',
    () => '', () => '', () => '', () => '2026-10-26', () => '09:00', en => en,
    x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
} catch (e) { ok('컴파일', false, e.message); }

if (api) {
  const row = {
    kind: 'class', schedule_id: 7, room_id: 'class-7-20261026', start_time: '14:00', student_name: 'Kim', student_uid: 'kim01',
    academy: 'A학원', student_phone: '010-1111-2222', class_date: '2026-10-26', sched_label_en: '2/wk', pay_type: 'B2C',
    teacher_entry: { state: 'pending' }, attendance: { state: 'not_yet' }, level: 'Lv3', textbook: 'BTS 5',
    week_days: [1, 0, 1, 0, 0, 0, 0], week_dates: ['2026-10-26'], prev_lesson: { teacher_name: 'Teacher Kaye', date: '2026-10-20' },
    previous_lesson_loaded: true, last_eval: { id: 9, date: '2026-10-20', score: 4, max: 5 },
  };
  const lms = { kind: 'lms', start_time: '15:00', room_id: '' };
  const old = { kind: 'class', start_time: '16:00', student_name: 'Lee', student_uid: 'lee' };   // 옛 응답 — 칸 없음
  let h = '';
  try { h = api.classTableHtml([row, lms, old], { act: (c, i) => '<button data-join="' + i + '">GO</button>', status: () => '<i>ST</i>', wi: (c, i) => i }); }
  catch (e) { h = 'THROW ' + e.message; }
  const ths = (h.match(/<th>[^<]*<\/th>/g) || []).map(x => x.replace(/<\/?th>/g, ''));
  ok('① 머리 15칸 · 매니저 화면 순서', ths.join('|') === 'Date|Time|Status|Student / Action|Contact|Academy|Class calendar|Schedule|Teacher connection|Attendance|Previous teacher|Last class feedback|Today\'s feedback|Level · Textbook|Room', ths);
  ok('② 결제 유형 칸·값 없음', !/Payment/.test(h) && !/B2C/.test(h));
  ok('② 연기·참관·초대·메시지 없음', !/Move|Observe|Invite|Message/.test(h));
  ok('③ 수업 줄에는 넘겨준 버튼', /data-join="0"/.test(h));
  ok('③ 안내용 줄(LMS)에는 버튼 없음(짝)', !/data-join="1"/.test(h) && /Not a Mangoi class/.test(h));
  ok('④ 이전 강사·연락처(tel:)·학원', /Teacher Kaye · 2026-10-20/.test(h) && /href="tel:01011112222"/.test(h) && /A학원/.test(h));
  ok('④ 요약/캘린더 버튼 + 이번 주 7칸', /data-teacher-history/.test(h) && (h.match(/<i class="/g) || []).length === 7);
  ok('④ 오늘 피드백 «✍ 작성» 버튼(wi 전달)', /data-eval="0"/.test(h));
  ok('⑤ 옛 응답 줄도 던지지 않고 그린다', !/^THROW/.test(h) && /Lee/.test(h), h.slice(0, 120));
  ok('⑤ 행 수 = 3', (h.match(/<tr class="cls-tr/g) || []).length === 3);
  const card = api.extrasHtml(row, 0);
  ok('⑥ 카드 보기는 그대로 문자열(cls-extra)', typeof card === 'string' && /^<div class="cls-extra">/.test(card) && /This week/.test(card));
  ok('⑥ 옛 응답: 카드 = 빈 문자열 · 조각 = null(짝)', api.extrasHtml({}, -1) === '' && api.extrasHtml({}, -1, true) === null);
  ok('⑥ portalContact 카드 출력 유지', /^<div class="cls-meta">Academy: A학원 · Contact: 010-1111-2222 <button/.test(api.portalContact(row)));
  const esc = api.classTableHtml([{ ...row, student_name: '<b>x', academy: '<img>' }], {});
  ok('이스케이프(학원 이름)', !/<img>/.test(esc));
}
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
