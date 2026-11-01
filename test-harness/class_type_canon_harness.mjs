// 수업 종류 이름·색 통일 — 정규수업 · 보강수업 · 체험수업 · 레벨테스트 (2026-10-07 사장님)
//
// 왜: 학생 상세 「수업 예약 등록」의 「특정 날짜 / One-off」가 class_type 을 안 보내 «정규수업»(주황)으로
//     저장됐고, 화면마다 «보충»/«보강»·색이 제각각이었다(정규가 어디는 파랑, 어디는 주황 — 레벨테스트는 그 반대).
//
// ① 등록 폼(initNewSchedule)을 student.html 에서 «통째로» 오려 가짜 DOM·가짜 fetch 로 실제로 돌린다 —
//    무작위 종류·날짜·요일로 수백 번 눌러 서버로 나가는 payload 의 불변식을 본다.
// ② 그 payload 를 서버의 class_type 허용식(api-admin.ts 에서 오려 냄)에 넣어 «서버도 같은 종류로 저장» 하는지 본다.
// ③ 화면 7곳의 이름·색 표를 정본(CANON)과 대조한다. 정본 표 자체도 student.html 캘린더(MGS_AI_COLORS)에서 «읽어» 온다.
// 짝: 「보강·체험·레벨은 하루만」 옆에 「정규는 매주 · 날짜를 안 보낸다」를 둔다(없으면 «전부 하루» 도 통과).
import fs from 'node:fs';
const rd = (p) => fs.readFileSync(new URL('../cloudflare-deploy/' + p, import.meta.url), 'utf8');
const SRC = process.env.STUDENT_SRC ? fs.readFileSync(process.env.STUDENT_SRC, 'utf8') : rd('public/admin/student.html');
let pass = 0, fail = 0;
const ok = (n, c, extra) => { if (c) { pass++; } else { fail++; console.log('  ❌ FAIL', n, extra === undefined ? '' : JSON.stringify(extra)); } };
const sect = (t) => console.log('▶ ' + t);
const stripC = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ───────── ③-0 정본: 학생 상세 캘린더 색표 ───────── */
sect('정본 색표(MGS_AI_COLORS)');
let CAN = null;
try {
  const a = SRC.indexOf('var MGS_AI_COLORS = {');
  let d = 0, e = -1;
  for (let i = SRC.indexOf('{', a); i < SRC.length; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}' && --d === 0) { e = i; break; } }
  CAN = new Function('return ' + SRC.slice(SRC.indexOf('{', a), e + 1))();
} catch (x) { console.log('  읽기 실패', x.message); }
ok('전제: 정본 색표를 읽었다', !!CAN && ['regular', 'makeup', 'trial', 'level_test'].every(k => CAN[k]));
const NAME = { regular: '정규수업', makeup: '보강수업', trial: '체험수업', level_test: '레벨테스트' };
for (const k in NAME) ok('정본 이름 ' + k + ' = ' + NAME[k], CAN && CAN[k].name === NAME[k]);
const HUE = { regular: '#b45309', makeup: '#6d28d9', trial: '#047857', level_test: '#1d4ed8' };   // 주황·보라·초록·파랑
for (const k in HUE) ok('정본 선색 ' + k, CAN && CAN[k].border === HUE[k], CAN && CAN[k]);
ok('네 색이 서로 다르다', CAN && new Set(Object.keys(HUE).map(k => CAN[k].bg)).size === 4);

/* ───────── ① 등록 폼을 실제로 돌린다 ───────── */
sect('등록 폼 — 종류 선택지');
const sel = SRC.match(/<select id="ns-kind"[^>]*>([\s\S]*?)<\/select>/);
ok('전제: 종류 select 를 찾았다', !!sel);
const opts = sel ? [...stripC(sel[1]).matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)].map(m => [m[1], m[2]]) : [];
ok('선택지는 정확히 정규·보강·체험·레벨테스트 넷', JSON.stringify(opts.map(o => o[0])) === JSON.stringify(['regular', 'makeup', 'trial', 'level_test']), opts);
for (const [v, label] of opts) ok('선택지 글자에 정본 이름: ' + v, label.includes(NAME[v]), label);
ok('옛 「특정 날짜 / One-off」 선택지가 없다', !opts.some(o => /특정|One-off/.test(o[1])));

function grabIIFE() {
  const a = SRC.indexOf('(function initNewSchedule(){');
  let d = 0, e = -1;
  for (let i = SRC.indexOf('{', a); i < SRC.length; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}' && --d === 0) { e = i; break; } }
  return a > 0 && e > a ? SRC.slice(a, SRC.indexOf(')();', e) + 4) : '';
}
const IIFE = grabIIFE();
ok('전제: initNewSchedule 을 오려 냈다', IIFE.length > 1000);

function mkEl(id, extra) {
  const l = {};
  return Object.assign({ id, value: '', style: {}, attrs: {}, innerHTML: '', textContent: '', checked: false, disabled: false,
    addEventListener(t, f) { (l[t] = l[t] || []).push(f); }, fire(t) { (l[t] || []).forEach(f => f({ target: this })); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, removeAttribute(k) { delete this.attrs[k]; } }, extra || {});
}
async function boot() {
  const els = {};
  for (const id of ['ns-kind', 'ns-days-wrap', 'ns-date-wrap', 'ns-start-wrap', 'ns-start', 'ns-add', 'ns-msg', 'ns-teacher-sel', 'ns-teacher', 'ns-show-left-wrap', 'ns-show-left', 'ns-show-left-lb', 'ns-date', 'ns-time', 'ns-dur']) els[id] = mkEl(id);
  els['ns-kind'].value = 'regular'; els['ns-time'].value = '21:10'; els['ns-dur'].value = '20';
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => mkEl('d' + i, { value: String(i) }));
  const sent = [];
  const document = { getElementById: id => els[id] || null, querySelectorAll: q => q === '.ns-day:checked' ? days.filter(d => d.checked) : [] };
  const fetch = async (url, opt) => {
    if (String(url).startsWith('/api/admin/teachers')) return { ok: true, status: 200, json: async () => ({ ok: true, items: [{ id: 22, name: 'FAR', active: 1 }, { id: 3, name: 'HT FARRAH', active: 0 }] }) };
    sent.push({ url, body: JSON.parse(opt.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, created: [1] }) };
  };
  const win = {};
  const fn = new Function('document', 'fetch', 'window', 'location', 'URLSearchParams', 'STUDENT_UID', 'STUDENT_NAME', '_mgsKstToday', 'loadAiSchedules', 'loadDStudentSchedule', 'confirm', IIFE);
  fn(document, fetch, win, { search: '?uid=delaware' }, URLSearchParams, 'delaware', '김연숙', () => '2026-10-07', () => {}, () => {}, () => false);
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  return { els, days, sent, win };
}
let B = null;
try { B = await boot(); } catch (x) { console.log('  폼 실행 실패:', x.message); }
ok('전제: 폼을 실제로 돌렸다', !!B && typeof B.win.nsClassPick === 'function');

sect('등록 폼 — 정본 nsClassPick');
const P = B && B.win.nsClassPick;
const pick = (v) => { try { return P(v); } catch { return {}; } };
ok('정규 → regular + 매주', JSON.stringify(pick('regular')) === JSON.stringify({ class_type: 'regular', schedule_kind: 'recurring' }));
ok('보강 → makeup + 하루', JSON.stringify(pick('makeup')) === JSON.stringify({ class_type: 'makeup', schedule_kind: 'one_off' }));
ok('체험 → trial + 하루', JSON.stringify(pick('trial')) === JSON.stringify({ class_type: 'trial', schedule_kind: 'one_off' }));
ok('레벨 → level_test + 하루', JSON.stringify(pick('level_test')) === JSON.stringify({ class_type: 'level_test', schedule_kind: 'one_off' }));
for (const junk of ['', 'one_off', 'recurring', 'MAKEUP', 'x', null, undefined, '보강'])
  ok('모르는 값은 정규·매주로(지어내지 않음): ' + String(junk), pick(junk).class_type === 'regular' && pick(junk).schedule_kind === 'recurring');

/* ② 서버 허용식 */
const api = rd('src/api-admin.ts');
const cl = api.match(/const classType = (\[[^\]]+\]\.includes\(String\(body\.class_type \|\| ''\)\) \? String\(body\.class_type\) : 'regular');/);
ok('전제: 서버 class_type 허용식을 오려 냈다', !!cl);
const srvType = cl ? new Function('body', 'return ' + cl[1]) : () => '?';

sect('등록 폼 — 무작위 400회 눌러 보기 (화면 칸 + 서버로 나가는 payload)');
const KINDS = ['regular', 'makeup', 'trial', 'level_test'];
let seed = 20261007; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const N = 400; let shown = 0, sentOk = 0, srvOk = 0, dateOk = 0, startOk = 0, daysOk = 0, msgCleared = 0, tried = 0;
if (B) {
  for (let i = 0; i < N; i++) {
    const k = KINDS[Math.floor(rnd() * 4)];
    const date = rnd() < 0.85 ? '2026-10-' + String(1 + Math.floor(rnd() * 28)).padStart(2, '0') : '';
    B.days.forEach(d => { d.checked = rnd() < 0.4; });
    B.els['ns-date'].value = date;
    B.els['ns-msg'].setAttribute('data-src', 'submit'); B.els['ns-msg'].innerHTML = 'old';
    B.els['ns-kind'].value = k; B.els['ns-kind'].fire('change');
    const one = k !== 'regular';
    if (B.els['ns-days-wrap'].style.display === (one ? 'none' : 'flex') && B.els['ns-date-wrap'].style.display === (one ? 'flex' : 'none') && B.els['ns-start-wrap'].style.display === (one ? 'none' : 'flex')) shown++;
    if (B.els['ns-msg'].innerHTML === '') msgCleared++;
    const before = B.sent.length;
    B.els['ns-add'].fire('click');
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
    tried++;
    const p = B.sent.length > before ? B.sent[B.sent.length - 1].body : null;
    if (!p) continue;
    if (p.class_type === k && p.schedule_kind === (one ? 'one_off' : 'recurring')) sentOk++;
    if (srvType(p) === k) srvOk++;
    if (one ? p.scheduled_date === (date || undefined) : p.scheduled_date === undefined) dateOk++;
    if (one ? p.starts_on === undefined : p.starts_on === '2026-10-07') startOk++;
    if (JSON.stringify(p.days) === JSON.stringify(B.days.filter(d => d.checked).map(d => d.value))) daysOk++;
  }
}
ok(`${N}회 모두 눌렀다`, tried === N, tried);
ok(`${N}회 모두 요청이 나갔다`, B && B.sent.length === N, B && B.sent.length);
ok(`${N}회 모두 칸 보이기가 종류와 맞다(정규=요일·시작일 / 나머지=날짜)`, shown === N, shown);
ok(`${N}회 모두 종류를 바꾸면 옛 등록 문구가 지워진다`, msgCleared === N, msgCleared);
ok(`${N}회 모두 payload 종류(class_type)·방식(schedule_kind)이 고른 것과 같다`, sentOk === N, sentOk);
ok(`${N}회 모두 서버도 같은 종류로 저장한다(허용식 통과)`, srvOk === N, srvOk);
ok(`${N}회 모두 날짜는 하루짜리만 보낸다(정규는 안 보냄 — 그 칸이 있으면 «그 하루만» 이 된다)`, dateOk === N, dateOk);
ok(`${N}회 모두 시작일은 정규만 보낸다`, startOk === N, startOk);
ok(`${N}회 모두 요일 체크가 그대로 실린다`, daysOk === N, daysOk);
ok('짝: 400회 안에 네 종류가 다 나왔다', B && new Set(B.sent.map(s => s.body.class_type)).size === 4);
ok('강사는 id 로 보낸다(이름 짐작 금지 — 그대로)', B && B.sent.every(s => s.body.teacher_id === undefined || /^\d+$/.test(String(s.body.teacher_id))));

/* ───────── ③ 화면별 이름·색 대조 ───────── */
sect('화면별 이름 — «보충» 이 스케줄·캘린더에 남지 않았다');
const W = rd('public/admin/weekly-schedule.html'), Q6 = rd('public/js/adm-q6.js'), T = rd('public/teacher.html'), M = rd('public/admin/mypage.html'), C = rd('public/js/adm-core.js');
for (const [n, t] of [['student.html', SRC], ['weekly-schedule.html', W], ['adm-q6.js', Q6], ['teacher.html', T], ['mypage.html', M]])
  ok(n + ' 화면 글자에 «보충» 0건', !/보충/.test(stripC(t)), (stripC(t).match(/.{0,30}보충.{0,30}/) || [])[0]);
ok('student 범례 넷 = 정본 이름', ['정규수업', '체험수업', '레벨테스트', '보강수업'].every(n => SRC.includes(`<span data-ko="${n}"`)));

sect('화면별 색 — 같은 종류는 같은 색');
const a2 = SRC.indexOf('var MGSU_TYPE = {');
let MG = null; try { let d = 0, e = -1; for (let i = SRC.indexOf('{', a2); i < SRC.length; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}' && --d === 0) { e = i; break; } } MG = new Function('return ' + SRC.slice(SRC.indexOf('{', a2), e + 1))(); } catch {}
ok('전제: 다가오는 수업 칩 색표(MGSU_TYPE)를 읽었다', !!MG);
for (const k of Object.keys(NAME)) {
  ok('다가오는 수업 칩 바탕 = 캘린더 바탕: ' + k, MG && CAN && MG[k].bg === CAN[k].bg, MG && MG[k]);
  ok('다가오는 수업 칩 글자 = 캘린더 글자: ' + k, MG && CAN && MG[k].fg === CAN[k].text);
  ok('다가오는 수업 칩 이름: ' + k, MG && MG[k].full === NAME[k]);
}
ok('스케줄 목록 배지는 정본 표를 «읽는다»(따로 안 적음)', /const typeCol = \(t\) => MGS_AI_COLORS\[t\]/.test(SRC) && !/typeColor = \{ regular:'#3b82f6'/.test(SRC));
ok('스케줄 목록 배지가 그 색을 실제로 쓴다', /background-color:' \+ tCol\.bg \+ ';color:' \+ tCol\.text/.test(SRC));
// 주간 스케줄 «셀» 톤 = 강사 캘린더(adm-q6)
const CELL = { '1on1': '#fde68a', temp: '#c4b5fd', trial: '#86efac', leveltest: '#93c5fd' };
const LINE = { '1on1': '#b45309', temp: '#6d28d9', trial: '#047857', leveltest: '#1d4ed8' };
for (const k in CELL) {
  ok('주간 셀 .slot-' + k + ' = ' + CELL[k], new RegExp('\\n\\.slot-' + k + '\\{background:' + CELL[k] + '\\}').test(W));
  ok('주간 타임라인 s-' + k + ' 선색 = 정본 ' + LINE[k], W.includes('.tl-seg.s-' + k + '{background:' + CELL[k] + ';border-left:2.5px solid ' + LINE[k] + '}'));
}
ok('주간 밝은 테마 변수 = 정본 옅은 바탕', [['--cell-1on1', 'regular'], ['--cell-temp', 'makeup'], ['--cell-trial', 'trial'], ['--cell-lt', 'level_test']].every(([v, k]) => CAN && new RegExp(v + ':' + CAN[k].bg + ';', 'i').test(W)));
ok('주간 밝은 테마에 체험·레벨 칸 규칙이 있다', W.includes('.slot-trial{ background:var(--cell-trial); }') && W.includes('.slot-leveltest{ background:var(--cell-lt); }'));
let PH = null; try { PH = new Function('var PH54_BLOCK_HATCH="h";return ' + Q6.match(/var PH54_TYPE_COLOR = (\{[^}]+\});/)[1])(); } catch {}
ok('전제: 강사 캘린더 색표를 읽었다', !!PH);
for (const k in CELL) ok('강사 캘린더 ' + k + ' = 주간 셀 색', PH && PH[k] === CELL[k], PH && PH[k]);
let PL = null; try { PL = new Function('return ' + Q6.match(/var PH54_TYPE_LABEL = (\{[^}]+\});/)[1])(); } catch {}
ok('강사 캘린더 라벨 정규·보강·체험·레벨테스트', PL && PL['1on1'] === '정규' && PL.temp === '보강' && PL.trial === '체험' && PL.leveltest === '레벨테스트');
// 진한 칩(흰 글자) 톤 — 주간 큰 범례 = AI 운영비서
const SOLID = { regular: '#d97706', makeup: '#8b5cf6', trial: '#059669', level_test: '#3b82f6' };
let TC = null; try { TC = new Function('return ' + C.match(/const typeColor = (\{[^}]+\});/)[1])(); } catch {}
ok('전제: AI 운영비서 색표를 읽었다', !!TC);
for (const k in SOLID) ok('AI 운영비서 ' + k + ' = ' + SOLID[k], TC && TC[k] === SOLID[k]);
ok('AI 운영비서 두 곳이 같은 색표', (C.match(/const typeColor = \{ regular:'#d97706', makeup:'#8b5cf6', level_test:'#3b82f6', trial:'#059669' \};/g) || []).length === 2);
ok('AI 운영비서 이름표에 보강수업', (C.match(/makeup:'보강수업'/g) || []).length === 3);
ok('주간 큰 범례 진한 칩 = 같은 네 색', ['#d97706', '#8b5cf6', '#059669', '#3b82f6'].every(c => W.includes('class="legend-chip" style="background:' + c + '"') || W.includes('repeating-linear-gradient(135deg,' + c)));
ok('강사 페이지 배지 = 정본 선색', T.includes('.pill.p-lt{background:#1d4ed8') && T.includes('.pill.p-trial{background:#047857') && T.includes('.pill.p-makeup{background:#6d28d9'));
ok('마이페이지 배지 색상 계열(레벨 파랑·체험 초록·보강 보라)', /level_test: \[[^\]]*rgba\(59,130,246/.test(M) && /trial: +\[[^\]]*rgba\(16,185,129/.test(M) && /makeup: +\[[^\]]*rgba\(139,92,246/.test(M));

sect('서버 — 체험수업이 정규로 뭉개지지 않는다');
const a3 = api.indexOf('const mapType = (ct: string): string => {');
let mt = null; try { let d = 0, e = -1; for (let i = api.indexOf('{', a3); i < api.length; i++) { if (api[i] === '{') d++; else if (api[i] === '}' && --d === 0) { e = i; break; } } mt = new Function('return (' + api.slice(api.indexOf('(ct', a3), e + 1).replace('(ct: string): string', '(ct)') + ')')(); } catch {}
const mm = (v) => { try { return mt(v); } catch { return '?'; } };
ok('trial → trial · makeup → temp · level_test → leveltest · regular → 1on1', mm('trial') === 'trial' && mm('makeup') === 'temp' && mm('level_test') === 'leveltest' && mm('regular') === '1on1');
const lbl = ['1on1', 'group', 'temp', 'trial', 'leveltest'];
ok('주간 툴팁·끌기·이동확인·종류알약 모두 trial·leveltest 이름을 안다', (W.match(/trial:currentLang==='ko'\?'🟢 체험수업'/g) || []).length === 1 && W.includes("trial:'체험수업',leveltest:'레벨테스트'}") && W.includes("'trial':L?'🟢 체험수업'") && W.includes("trial:{cls:'trial',ico:'🟢',ko:'체험수업'"));
// 번호는 병합으로 또 오를 수 있다 — «이 변경 이전 번호가 아닌가» 로 묻는다(정확한 일치는 asset_version_harness 몫)
ok('?v= 를 올렸다(adm-q6 · adm-core)', !/adm-q6\.js\?v=(1[0-5]|[0-9])"/.test(rd('public/admin.html')) && /adm-q6\.js\?v=\d+/.test(rd('public/admin.html')) && !/adm-core\.js\?v=261007-room"/.test(rd('public/admin.html')));


// 일간 뷰는 모든 칸이 col-today — 오늘 앰버가 수업 칸까지 덮으면 종류 색이 사라진다(2026-10-07 실측)
{
  const css = W.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]*\.col-today[^{}]*)\{([^}]*)\}/g)].filter(m => /tl-scroll/.test(m[1]) && /background\s*:/.test(m[2]));
  ok('col-today 배경 규칙이 있다', rules.length >= 1, rules.length);
  for (const m of rules) for (const sel of m[1].split(','))
    ok('col-today 배경은 빈칸·주말칸에만: ' + sel.trim(), /slot-empty|slot-weekend/.test(sel), sel.trim());
}
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
