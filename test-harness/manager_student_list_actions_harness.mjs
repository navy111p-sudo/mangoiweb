// 매니저 화면(manager.html) — 2026-10-08 매니저 요청 3건 회귀 감시
//   ① 오늘 수업: 매주 반복 줄도 «막다른 글자» 대신 학생 캘린더를 연다(날짜별로 나눠 그 날만 연기·변경)
//   ② 학생 명부: 일정·강사·리포트 + 연기·변경·강사 변경 버튼(학생 캘린더 창)
//   ③ 오늘 수업: 입장 가능한 줄에 «👁 관찰 · 💬 메시지»(ghost-view 의 학생 지정 메시지)
// ⚠️ 문자열이 아니라 그 코드 조각을 오려 내 실제로 돌려 «무슨 HTML 이 나오는가» 로 묻는다.
//    «나온다» 옆에 «안 나와야 할 때 안 나온다» 를 짝으로 둔다.
import fs from 'node:fs';
const MGR = fs.readFileSync(new URL('../cloudflare-deploy/public/manager.html', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (name, c, extra) => { if (c) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };
const T = (en, ko) => ko, TE = (en) => en;
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지 */
function braceBlock(src, openIdx) {
  let d = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}

console.log('\n② 학생 명부 줄');
{
  const a = MGR.indexOf('el.innerHTML = shown.map(function(s){');
  const body = a > 0 ? braceBlock(MGR, MGR.indexOf('{', a)) : '';
  ok('전제: 명부 줄 함수를 오려 냈다', body.length > 200);
  let row = null;
  try { row = new Function('T', 'esc', 'stuKstMonth', 'return function(s)' + body)(T, esc, () => '2026-10'); }
  catch (e) { ok('만들 수 있다', false, e.message); }
  if (row) {
    let h1 = '', h2 = '', h3 = '';
    try {
      h1 = row({ user_id: 'jeong', name: '정우영', status: '재원',
        sched: { weekly: 4, upcoming: 1, label_ko: '주 4회 · 단건 1회', label_en: '4/wk', teachers: ['강선생님', 'FAR'] } });
      h2 = row({ user_id: 'lee', name: '이병엽', sched: { weekly: 0, upcoming: 0, label_ko: '—', label_en: '—', teachers: [] } });
      h3 = row({ user_id: 'kim', name: '김' });
    } catch (e) { ok('돌릴 수 있다', false, e.message); }
    ok('일정 라벨을 서버 값 그대로 그린다', /주 4회 · 단건 1회/.test(h1));
    ok('담당 강사 이름을 그린다', /강선생님, FAR/.test(h1));
    ok('📅 일정 버튼이 그 학생 캘린더를 연다', /data-calpin="jeong"[^>]*>📅 일정/.test(h1));
    ok('수업이 있으면 ⏸ 연기·변경 / 🔄 강사 변경 버튼', /⏸ 연기 · 변경/.test(h1) && /🔄 강사 변경/.test(h1));
    ok('📄 리포트 = 그 학생 월간 리포트(이번 달)', /href="\/monthly-report\.html\?uid=jeong&period=2026-10"/.test(h1));
    ok('짝: 수업이 없으면 연기·강사 변경 버튼은 없다', !/⏸ 연기/.test(h2) && !/🔄 강사 변경/.test(h2) && /📅 일정/.test(h2));
    ok('짝: 수업 없는 학생 일정은 «—»(지어내지 않음)', /일정: —/.test(h2) && /강사: —/.test(h2));
    ok('짝: sched 가 아예 없어도 죽지 않고 «—»', /일정: —/.test(h3) && !/⏸ 연기/.test(h3));
  }
  const bind = MGR.indexOf('function bindStuActions(){');
  const bb = bind > 0 ? braceBlock(MGR, MGR.indexOf('{', bind)) : '';
  ok('클릭 배선: 명부 상자의 [data-calpin] → mgCalOpen', /closest\('\[data-calpin\]'\)/.test(bb) && /mgCalOpen\(/.test(bb));
  const ps = MGR.indexOf('window.paintStudents = function(){');
  const pb = ps > 0 ? braceBlock(MGR, MGR.indexOf('{', ps)) : '';
  ok('paintStudents 가 bindStuActions 를 부른다', /\bbindStuActions\(\);/.test(pb));
}

console.log('\n①③ 오늘 수업 줄');
{
  const i = MGR.indexOf("      var resch = '';");
  const j = MGR.indexOf('/* 📋 (2026-09-23 매니저 요청)', i);
  const src = i > 0 && j > i ? MGR.slice(i, j) : '';
  ok('전제: resch 블록을 오려 냈다', src.length > 100);
  let g = null;
  try { g = new Function('r', 'esc', 'T', 'var act="";' + src + ' return resch;'); } catch (e) { ok('만들 수 있다', false, e.message); }
  if (g) {
    const w = g({ schedule_id: 8, can_move: false, student_uid: 'jeong', student_name: '정우영' }, esc, T);
    ok('매주 반복 줄: 학생 캘린더 버튼', /data-calpin="jeong"/.test(w) && /캘린더에서 날짜별로/.test(w));
    ok('짝: 매주 반복 줄에 바로 옮기는 data-ta 는 주지 않는다', !/data-ta=/.test(w));
    ok('짝: 학생 아이디가 없으면 글자만', !/data-calpin/.test(g({ schedule_id: 8, can_move: false }, esc, T)));
    ok('짝: 날짜 지정 줄은 그대로 📅 연기·변경(data-ta)', /data-ta="7"/.test(g({ schedule_id: 7, can_move: true }, esc, T)));
  }
  const a = MGR.indexOf('      var act = r.join_open');
  const b = MGR.indexOf(';', MGR.indexOf("        : '';", a));
  const actSrc = a > 0 && b > a ? MGR.slice(a, b + 1) : '';
  ok('전제: act 식을 오려 냈다', actSrc.length > 50);
  let f = null;
  try { f = new Function('r', 'who', 'esc', 'T', actSrc + ' return act;'); } catch (e) { ok('act 를 만들 수 있다', false, e.message); }
  if (f) {
    const on = f({ join_open: true, room_id: 'class-12-20261008' }, '김', esc, TE);
    ok('입장 가능한 줄: 관찰·메시지 링크(ghost-view, room_id)', /\/admin\/ghost-view\.html\?room_id=class-12-20261008/.test(on) && /Message/.test(on));
    ok('짝: 입장 시간이 아니면 링크 없음', !/ghost-view/.test(f({ join_open: false, room_id: 'class-12-20261008' }, '김', esc, TE)));
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
