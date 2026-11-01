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
  // 2026-10-27 사장님 «너무 복잡해» → 15칸을 7칸으로 묶음(PC=B안). 옛 15칸 값이 7칸 어디엔가 남았는지는 ④·⑧이 본다.
  ok('① 머리 7칸 · 묶음 순서', ths.join('|') === 'Time|Status|Student · Contact · Academy|Class calendar|Teacher connection · Attendance|Previous teacher · Feedback|Action', ths);
  const trs = h.split('<tr class="cls-tr').slice(1);
  ok('⑧ 줄마다 7칸 · 칸 이름(data-k) 실림 — 폰 상자가 이 이름을 그린다', trs.length === 3 && trs.every(r => (r.match(/<td class="c-[a-z]+" data-k="[^"]+">/g) || []).length === 7), trs.map(r => (r.match(/<td /g) || []).length));
  ok('⑧ 칸 순서 = time·st·stu·cal·conn·prev·act', trs.every(r => (r.match(/<td class="(c-[a-z]+)"/g) || []).map(x => x.slice(11, -1)).join(',') === 'c-time,c-st,c-stu,c-cal,c-conn,c-prev,c-act'));
  ok('⑧ 할 일 버튼은 맨 오른쪽 칸(c-act) 안', /<td class="c-act"[^>]*><div class="cls-tbl-act"><button data-join="0">/.test(h));
  ok('⑧ 학생 칸 안에 연락처·학원(묶음)', /<td class="c-stu"[^>]*><b>Kim<\/b><div class="cls-sub"><span class="nw"><a href="tel:01011112222">[^<]*<\/a><\/span> · A학원<\/div>/.test(h));
  ok('⑧ 강사 입장 · 학생 출결이 한 칸', /<td class="c-conn"[^>]*><div class="cls-kv"><span>Teacher<\/span> not yet<\/div><div class="cls-kv"><span>Student<\/span> Not started<\/div>/.test(h));
  const r0 = trs[0] || '';
  ok('⑧ 옛 15칸 값이 전부 남았다 — 날짜·일정·상태·지난 피드백·방 번호(짝: 값을 «출력» 으로 확인)',
    /<td class="c-time"[^>]*><b class="nw">14:00<\/b><div class="cls-sub nw">2026-10-26<\/div>/.test(r0) && /<td class="c-cal"[^>]*>[^]*2\/wk/.test(r0)
    && /<td class="c-st"[^>]*><i>ST<\/i>/.test(r0) && /<td class="c-prev"[^>]*>[^]*Last<\/span> [^<]*2026-10-20/.test(r0) && /<td class="c-act"[^>]*>[^]*class-7-20261026/.test(r0), r0.slice(0, 300));
  {
    const ko = new Function('MangoiClassDisplay', 'stuLabelHtml', 'stuLabelText', 'stuUid', 'kindPill', 'goalHtml', 'preqHtml', 'handoverHtml', 'todayKST', 'hhmm', 'T', 'esc',
      src.join('\n') + '\nreturn { classTableHtml };')({ range: c => c.start_time }, c => c.student_name || '', c => c.student_name || '', c => String(c.student_uid || ''), () => '',
      () => '', () => '', () => '', () => '2026-10-26', () => '09:00', (en, ko) => ko, x => String(x == null ? '' : x)).classTableHtml([row], {});
    ok('⑧ 한국어: 머리글·칸 이름(data-k)도 한국어(짝)', /<th>학생 · 연락처 · 학원<\/th>/.test(ko) && /data-k="강사 입장 · 학생 출결"/.test(ko) && !/data-k="Teacher/.test(ko));
  }
  ok('⑧ 이전 강사 · 레벨 · 교재가 한 칸', /<td class="c-prev"[^>]*>[^]*Teacher Kaye · 2026-10-20[^]*Lv3 · BTS 5/.test(h));
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
// ⑦ 열 때마다 표로 시작(2026-10-28 사장님 «표가 기본») — 예전엔 «카드» 저장값이 이겨서 그 기기는 계속 카드로 열렸다.
//    보기 블록을 오려 내 가짜 select·localStorage 로 «실제로 돌려» 본다(문자열 검사는 «저장값을 읽는 줄» 을 되살려도 모른다).
{
  const a = html.indexOf("  var classViewSelect = document.getElementById('class-view');");
  const b = a < 0 ? -1 : html.indexOf('  /* 🙈 (2026-10-26) 상세 숨기기', a);
  const block = a < 0 || b < 0 ? '' : html.slice(a, b);
  ok('⑦ 전제: 보기 블록을 오려 냈다', /addEventListener\('change'/.test(block), block.length);
  const KEY = 'mangoi_teacher_class_view';
  function mkStore(init, broken) {
    const m = new Map(Object.entries(init || {})), sets = [];
    const boom = () => { throw new Error('blocked'); };
    return { m, sets, getItem: broken ? boom : k => (m.has(k) ? m.get(k) : null), setItem: broken ? boom : (k, v) => { sets.push(k); m.set(k, String(v)); }, removeItem: broken ? boom : k => { m.delete(k); } };
  }
  function open(store) {
    const sel = { value: '', on: null, addEventListener(t, f) { if (t === 'change') this.on = f; } };
    const calls = [];
    try {
      new Function('document', 'localStorage', 'renderClasses', 'renderClsDay', 'syncClsLite', 'DATA', 'lastSig', block)(
        { getElementById: id => (id === 'class-view' ? sel : null) }, store,
        () => calls.push('classes'), () => calls.push('day'), () => calls.push('lite'), { classes: [] }, 'sig');
    } catch (e) { return { err: e.message, sel, calls }; }
    return { sel, calls };
  }
  for (const saved of ['cards', 'table', 'junk']) {
    const st = mkStore({ [KEY]: saved });
    const r = open(st);
    ok('⑦ 저장값 «' + saved + '» 이 있어도 첫 보기 = 표', !r.err && r.sel.value === 'table', r.err || r.sel.value);
    ok('⑦ 옛 저장값을 지운다(' + saved + ')', !st.m.has(KEY), [...st.m.keys()]);
  }
  const none = open(mkStore({}));
  ok('⑦ 저장값이 없을 때도 표', !none.err && none.sel.value === 'table', none.err || none.sel.value);
  const broken = open(mkStore({}, true));
  ok('⑦ 저장소가 막힌 기기(사생활 모드 등)도 표로 시작 · 던지지 않음', !broken.err && broken.sel.value === 'table', broken.err || broken.sel.value);
  // 짝: 카드로 바꾸기는 그대로 된다(그 화면에서 다시 그림) — 단 기억하지 않아 새로 열면 다시 표.
  const st = mkStore({});
  const r1 = open(st);
  r1.sel.value = 'cards';
  try { r1.sel.on.call(r1.sel); } catch (e) { r1.err = e.message; }
  ok('⑦ 카드로 바꾸면 그 자리에서 다시 그린다(짝)', !r1.err && r1.calls.join(',') === 'classes,day,lite', r1.err || r1.calls);
  ok('⑦ 바꾼 값을 기기에 저장하지 않는다', !st.sets.includes(KEY), st.sets);
  const r2 = open(st);
  ok('⑦ 카드로 바꾼 뒤 새로 열면 다시 표', !r2.err && r2.sel.value === 'table', r2.err || r2.sel.value);
}
// ⑨ 실선(가로·세로) + 폰(<900px)은 같은 DOM 을 수업당 격자 상자로(D안) — CSS 를 실제로 읽어 본다
{
  const style = ([...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).find(t => t.includes('.cls-tbl{')) || '').replace(/\r\n/g, '\n');
  ok('⑨ 전제: 표 CSS 가 든 <style> 을 찾았다', style.length > 500, style.length);
  const rule = sel => { const m = style.match(new RegExp('(?:^|\\n|})\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}')); return m ? m[1] : ''; };
  ok('⑨ PC 칸에 세로선까지(border:1px solid)', /border:1px solid/.test(rule('.cls-tbl td')) && /border:1px solid/.test(rule('.cls-tbl th')));
  const mq = (style.match(/@media \(max-width:899\.98px\)\{([\s\S]*?)\n\}/) || [])[1] || '';
  ok('⑨ 폰 블록이 있다(899.98px)', mq.length > 200, mq.length);
  ok('⑨ 폰: 머리줄 숨김 · 줄 = 격자 상자', /\.cls-tbl thead\{display:none\}/.test(mq) && /\.cls-tbl tr\{display:grid;[^}]*grid-template-areas:"time st" "stu stu" "act act" "cal cal" "conn prev"/.test(mq));
  ok('⑨ 폰: 일곱 칸 모두 자리(grid-area)가 있다(짝 — 빠지면 상자 밖으로 샌다)', ['time','st','stu','act','cal','conn','prev'].every(a => new RegExp('td\\.c-' + a + '\\{grid-area:' + a + '[;}]').test(mq)));
  ok('⑨ 폰: 칸 이름을 data-k 로 그린다', /content:attr\(data-k\)/.test(mq));
  ok('⑨ «마지막 줄 아래선 없음» 은 PC 에서만 — 폰의 마지막 상자 안쪽 선을 지우지 않는다', /@media \(min-width:900px\)\{\.cls-tbl tbody tr:last-child>td\{border-bottom:0\}\}/.test(style)
    && !/(^|[}\n])\.cls-tbl tbody tr:last-child>td\{border-bottom:0\}/.test(style.replace(/@media \(min-width:900px\)\{[^\n]*\n/g, '')));
  ok('⑨ 연기된 줄 강조가 줄무늬에 안 덮인다(특정성)', /\.cls-tbl tbody tr\.cls-postponed>td\{background:#fff4e0\}/.test(style) && /nth-child\(even\):not\(\.cls-postponed\)>td\{background:none\}/.test(mq));
}
console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
