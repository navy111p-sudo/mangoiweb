/**
 * 관리자 «주간 시간표» — 같은 칸에 «취소» 와 «연기·옮겨 감» 이 섞여도 둘 다 말하는가 (2026-11-04)
 * ─────────────────────────────────────────────────────────────────────────────
 * 왜 이 하니스가 있나
 *   그룹 수업은 서버(/api/admin/schedules 의 off_items)가 «학생마다 한 행» 을 준다. 화면(admin/weekly-schedule.html)의
 *   OFF_SLOTS 로더는 그것을 강사·날짜·시각 «칸» 으로 묶는데, 예전에는 상태(취소/연기)·글자(→ 새 날짜)를 안 보고
 *   «먼저 온 줄» 의 글자 하나로 합쳤다 — 같은 칸에서 A 학생은 취소, B 학생은 «⏸ 연기됨 → 11/11» 이면
 *   B 의 사정이 화면에서 사라졌다(2026-11-04 «여전히 그대로 둔 것» 에 적어 둔 한계 → 사장님 «고쳐줘»).
 *   지금은 칸 하나에 «부분(parts)» 을 두고, 상태+서버 글자가 같을 때만 학생을 합친다.
 *
 * 무엇이 «진짜» 인가
 *   ✅ 진짜: 화면 소스에서 로더(off_items.forEach 콜백)·offParts·offLabel1·offLabel·offGlyph·통계 줄을 «오려 내» 실행한다.
 *   ✅ 진짜: 툴팁 핸들러(data-off 칸 mousemove)도 오려 내 가짜 이벤트로 돌려 나온 HTML 을 잰다(G2 — 처음 판은 글자만 봐서
 *      «첫 부분만 돌기»·«모든 학생을 모든 부분에» 변이가 통과했다, 2026-11-04 함정 대조).
 *   🟡 모형: 그리기(칸·막대·실제 위치)는 manual/weekly-schedule-cancelled-browser.mjs 8절(사람이 부르는 브라우저 검사)이 잰다.
 *
 * 변이시험: 소스 문자열의 «사본» 만 바꿔 다시 돌린다 — ⛔ 저장소 파일은 안 건드린다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HTML_PATH = fileURLToPath(new URL('../cloudflare-deploy/public/admin/weekly-schedule.html', import.meta.url));
const REAL = readFileSync(HTML_PATH, 'utf8');

/** 여는 중괄호 위치부터 짝이 맞는 닫는 중괄호까지(문자열 안은 건너뜀) */
function braceEnd(src, open) {
  let d = 0, q = null;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
function fnSrc(src, name) {
  const at = src.indexOf('function ' + name + '(');
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  const end = braceEnd(src, open);
  return end < 0 ? null : src.slice(at, end + 1);
}

function runChecks(src) {
  const out = [];
  const ok = (name, cond, why) => out.push({ name, pass: !!cond, why: cond ? '' : (why || '') });

  const names = ['offLabel1', 'offParts', 'offLabel', 'offGlyph'];
  const fns = names.map(n => fnSrc(src, n));
  const loAnchor = "((sd&&Array.isArray(sd.off_items))?sd.off_items:[]).forEach(function(o){";
  const loAt = src.indexOf(loAnchor);
  const loOpen = loAt < 0 ? -1 : loAt + loAnchor.length - 1;
  const loEnd = loOpen < 0 ? -1 : braceEnd(src, loOpen);
  const loBody = loEnd < 0 ? null : src.slice(loOpen + 1, loEnd);
  const cntM = /var nOff=0; for\(var ko in OFF_SLOTS\)(nOff\+=[^;]+;)/.exec(src);
  ok('⓪ 전제: 화면 소스에서 로더·글자 함수·통계 줄을 오려 냈다', fns.every(Boolean) && !!loBody && !!cntM,
    JSON.stringify({ fns: fns.map(Boolean), loader: !!loBody, count: !!cntM }));
  if (!(fns.every(Boolean) && loBody && cntM)) return out;

  let api;
  try {
    api = new Function('ctx', `
      var currentLang = ctx.lang, SLOT_STEP = 10, OFF_SLOTS = {};
      ${fns.join('\n')}
      function load(list){ OFF_SLOTS = {}; list.forEach(function(o){ ${loBody} }); return OFF_SLOTS; }
      function count(){ var nOff=0; for(var ko in OFF_SLOTS)${cntM[1]} return nOff; }
      return { load: load, count: count, offLabel: offLabel, offLabel1: offLabel1, offGlyph: offGlyph, offParts: offParts,
               setLang: function(l){ currentLang = l; } };`)({ lang: 'ko' });
  } catch (e) { ok('⓪-b 오려 낸 코드가 실행된다', false, String(e && e.message || e)); return out; }

  const ch = (k, ko, en) => ({ kind: k, label_ko: ko, label_en: en, by: null, reason: null, at_kst: null });
  const C = (uid, name) => ({ off: 'cancelled', teacher_id: 1, date: '2026-11-04', start_time: '15:00', duration_min: 20, type: 'group',
    students: [{ uid, name }], change: ch('cancelled', '✕ 취소됨', '✕ Cancelled') });
  const P = (uid, name, to, toEn, dur) => ({ off: 'postponed', moved_away: true, teacher_id: 1, date: '2026-11-04', start_time: '15:00',
    duration_min: dur || 20, type: 'group', students: [{ uid, name }], change: ch('postponed', '⏸ 연기됨 → ' + to, '⏸ Postponed → ' + toEn) });

  let S, slot, err = null;
  const tryRun = (f) => { try { return f(); } catch (e) { err = String(e && e.message || e); return null; } };

  // A. 취소 + 다른 학생의 «옮겨 감» — 한 칸에 둘 다
  S = tryRun(() => api.load([C('a', '가학생'), P('b', '나학생', '11/11 15:50', '11/11 15:50')]));
  slot = S && S['1__2026-11-04__900'];
  ok('A1 같은 칸 = 한 칸(학생 둘) · 상태는 «섞임»', !!slot && slot.students.length === 2 && slot.off === 'mixed', JSON.stringify(slot && { off: slot.off, n: slot.students.length }) + (err || ''));
  ok('A2 칸 글자에 두 사정이 다 들어 있다(✕ 취소됨 · ⏸ 연기됨 → 11/11 15:50)',
    !!slot && api.offLabel(slot) === '✕ 취소됨 · ⏸ 연기됨 → 11/11 15:50', slot && api.offLabel(slot));
  ok('A3 칸 머리 기호도 둘 다(✕⏸)', !!slot && api.offGlyph(slot) === '✕⏸ ', slot && JSON.stringify(api.offGlyph(slot)));
  ok('A4 부분마다 «그 학생» 만 — 취소 부분엔 가학생, 연기 부분엔 나학생',
    !!slot && slot.parts.length === 2 && slot.parts[0].students.map(x => x.uid).join() === 'a' && slot.parts[1].students.map(x => x.uid).join() === 'b',
    slot && JSON.stringify(slot.parts.map(p => p.students.map(x => x.uid))));
  ok('A5 통계는 «사정» 을 센다(한 칸 2건)', !!slot && api.count() === 2, String(S && api.count()));

  // B. 같은 상태·같은 글자 → 학생만 합친다(짝: 부분이 늘지 않는다)
  S = tryRun(() => api.load([P('b', '나학생', '11/11 15:50', '11/11 15:50'), P('c', '다학생', '11/11 15:50', '11/11 15:50')]));
  slot = S && S['1__2026-11-04__900'];
  ok('B1 짝: 같은 사정(같은 글자)이면 부분은 하나 · 학생만 합친다 · 상태는 그대로 postponed',
    !!slot && slot.parts.length === 1 && slot.parts[0].students.length === 2 && slot.off === 'postponed' && api.offGlyph(slot) === '⏸ ',
    slot && JSON.stringify({ parts: slot.parts.length, off: slot.off }));
  ok('B2 짝: 부분이 하나면 글자는 예전과 같다(offLabel == offLabel1)', !!slot && api.offLabel(slot) === '⏸ 연기됨 → 11/11 15:50' && api.count() === 1, slot && api.offLabel(slot));

  // C. 같은 «연기» 라도 새 날짜가 다르면 따로 — 상태만으로 합치지 않는다
  S = tryRun(() => api.load([P('b', '나학생', '11/11 15:50', '11/11 15:50'), P('d', '라학생', '11/12 09:00', '11/12 09:00', 40)]));
  slot = S && S['1__2026-11-04__900'];
  ok('C1 같은 연기라도 «→ 11/11» 과 «→ 11/12» 는 두 부분 · 상태는 postponed(섞임 아님)',
    !!slot && slot.parts.length === 2 && slot.off === 'postponed' && api.offLabel(slot) === '⏸ 연기됨 → 11/11 15:50 · ⏸ 연기됨 → 11/12 09:00',
    slot && JSON.stringify({ parts: slot.parts.length, off: slot.off, l: api.offLabel(slot) }));
  ok('C2 칸 길이는 가장 긴 수업에 맞춘다(20분 + 40분 → 40분)', !!slot && slot.duration_min === 40, slot && String(slot.duration_min));

  // D. 한 학생이 두 줄로 와도 칸의 학생 수는 한 번만
  S = tryRun(() => api.load([C('a', '가학생'), C('a', '가학생'), P('a', '가학생', '11/11 15:50', '11/11 15:50')]));
  slot = S && S['1__2026-11-04__900'];
  ok('D1 같은 학생은 칸 전체에서 한 번 · 부분 안에서도 한 번(사정이 둘이면 두 부분에 각각)',
    !!slot && slot.students.length === 1 && slot.parts.length === 2 && slot.parts.every(p => p.students.length === 1),
    slot && JSON.stringify({ n: slot.students.length, parts: slot.parts.map(p => p.students.length) }));

  // E. 다른 칸은 서로 안 섞인다(짝)
  S = tryRun(() => api.load([C('a', '가학생'), Object.assign(P('b', '나학생', '11/11 15:50', '11/11 15:50'), { start_time: '16:00' })]));
  ok('E1 짝: 시각이 다르면 다른 칸 — 각자 부분 하나', !!S && Object.keys(S).length === 2 && Object.values(S).every(x => x.parts.length === 1 && x.off !== 'mixed'),
    S && JSON.stringify(Object.keys(S)));

  // F. EN 글자도 서버 글자 그대로
  api.setLang('en');
  S = tryRun(() => api.load([C('a', '가학생'), P('b', '나학생', '11/11 15:50', '11/11 15:50')]));
  slot = S && S['1__2026-11-04__900'];
  ok('F1 EN: ✕ Cancelled · ⏸ Postponed → 11/11 15:50', !!slot && api.offLabel(slot) === '✕ Cancelled · ⏸ Postponed → 11/11 15:50', slot && api.offLabel(slot));
  api.setLang('ko');

  // G. 배선 — 그리는 곳이 새 함수를 실제로 부른다(옛 삼항식으로 되돌리면 칸 머리가 «먼저 온 줄» 기호 하나가 된다)
  // 블록주석 + «줄 전체가 주석» 인 줄을 벗긴다(새 식을 // 주석으로만 남겨 두는 변이도 잡게 — 2026-11-04 함정 대조)
  const live = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok('G1 일간 칸 머리 = offGlyph(off) · 옛 삼항식이 남아 있지 않다',
    /escapeHtml\(offGlyph\(off\)\+oWho\)/.test(live) && !/\(off\.off==='postponed'\?'⏸ ':'✕ '\)\+oWho/.test(live));
  // G2 — 툴팁 핸들러(data-off 칸 mousemove)를 «오려 내 실제로 돌린다». 글자 확인만으로는 «첫 부분만 돌기»·
  //      «모든 학생을 모든 부분에» 같은 변이가 통과했다(2026-11-04 함정 대조 실측) — 그래서 나온 HTML 을 잰다.
  const hAnchor = 'if(!t||!t.dataset.off)return;';
  const hAt = src.indexOf(hAnchor);
  const hFn = hAt < 0 ? -1 : src.lastIndexOf("document.addEventListener('mousemove',function(e){", hAt);
  const hOpen = hFn < 0 ? -1 : src.indexOf('{', hFn + 40);
  const hEnd = hOpen < 0 ? -1 : braceEnd(src, hOpen);
  const line1 = (name) => { const m = new RegExp('^function ' + name + '\\(.*$', 'm').exec(src); return m ? m[0] : null; };
  const helpers = ['escapeHtml', 'pad2', 'minLabel'].map(line1);
  const ocr = fnSrc(src, 'offChangeRows');
  let tip = null;
  if (hEnd > 0 && helpers.every(Boolean) && ocr) {
    try {
      tip = new Function('ctx', `
        var currentLang = ctx.lang, SLOT_STEP = 10, OFF_SLOTS = {}, _out = null;
        ${fns.join('\n')}
        ${helpers.join('\n')}
        ${ocr}
        function _ttShow(html){ _out = html; }
        function load(list){ OFF_SLOTS = {}; list.forEach(function(o){ ${loBody} }); return OFF_SLOTS; }
        var handler = function(e)${src.slice(hOpen, hEnd + 1)};
        return function(list, key){
          var S = load(list), off = S[key]; _out = null;
          var payload = encodeURIComponent(JSON.stringify({ teacher: 'T', date: '2026-11-04', hour: 15, minute: 0, off: off }));
          var cell = { dataset: { off: payload } };
          handler({ target: { closest: function(){ return cell; } }, clientX: 0, clientY: 0 });
          return _out;
        };`)({ lang: 'ko' });
    } catch (e) { tip = null; ok('G2-0 툴팁 핸들러를 오려 내 실행할 수 있다', false, String(e && e.message || e)); }
  }
  ok('G2-0 전제: 툴팁 핸들러·도우미를 오려 냈다', !!tip, JSON.stringify({ handler: hEnd > 0, helpers: helpers.map(Boolean), ocr: !!ocr }));
  if (tip) {
    const parse = (html) => {
      const segs = String(html || '').split('<div class="tooltip-off-part">').slice(1);
      return segs.map(sg => ({ uids: [...sg.matchAll(/<span class="uid">([^<]*)<\/span>/g)].map(m => m[1]), text: sg.replace(/<[^>]+>/g, '') }));
    };
    let html = null; try { html = tip([C('a', '가학생'), P('b', '나학생', '11/11 15:50', '11/11 15:50'), P('c', '다학생', '11/11 15:50', '11/11 15:50')], '1__2026-11-04__900'); } catch (e) { html = 'ERR ' + e.message; }
    const pp = parse(html);
    ok('G2 툴팁(실제 실행): 사정마다 한 묶음 — 취소 묶음엔 a 만, 연기 묶음엔 b·c 만 · 각 묶음 글자는 자기 사정 하나',
      pp.length === 2 && JSON.stringify(pp.map(x => x.uids)) === JSON.stringify([['a'], ['b', 'c']])
      && /✕ 취소됨/.test(pp[0].text) && !/연기됨/.test(pp[0].text) && /⏸ 연기됨 → 11\/11 15:50/.test(pp[1].text) && !/취소됨/.test(pp[1].text),
      JSON.stringify(pp.map(x => ({ u: x.uids, t: x.text.slice(0, 40) }))) + ' ' + String(html).slice(0, 60));
    let html1 = null; try { html1 = tip([C('a', '가학생'), C('z', '마학생')], '1__2026-11-04__900'); } catch (e) { html1 = 'ERR ' + e.message; }
    ok('G2b 짝: 사정이 하나면 묶음 없이 예전 모양 — 학생 둘이 한 목록 · 사정 글자는 제목과 «취소 · 연기» 줄에 한 번씩',
      !/tooltip-off-part/.test(String(html1)) && [...String(html1).matchAll(/<span class="uid">([^<]*)<\/span>/g)].map(m => m[1]).join() === 'a,z'
      && (String(html1).replace(/<[^>]+>/g, '').match(/✕ 취소됨/g) || []).length === 2,   // 맨 위 제목 + 취소·연기 줄
      String(html1).slice(0, 120));
  }
  ok('G3 섞인 칸에는 취소선을 긋지 않는다(slot-off-mixed CSS)', /td\.slot\.slot-off\.slot-off-mixed\{text-decoration:none/.test(src));
  return out;
}

let pass = 0, fail = 0;
console.log('\n─ 실제 소스 ─');
for (const r of runChecks(REAL)) {
  if (r.pass) { pass++; console.log('  PASS ' + r.name); } else { fail++; console.log('  FAIL ' + r.name + (r.why ? '  ' + r.why : '')); }
}

const MUTANTS = [
  { name: '옛 동작: 칸만 보고 합침(부분을 안 늘림)', expect: /^A[1-4] /,
    from: "if(!tgt){tgt={key:pkey,off:okind,change:o.change||null,students:[]};prev.parts.push(tgt);if(prev.off!==okind)prev.off='mixed';}",
    to: "if(!tgt){tgt=prev.parts[0];}" },
  { name: '부분 열쇠를 상태만으로(글자를 안 봄)', expect: /^C1 /,
    from: "var pkey=okind+'|'+((o.change&&(o.change.label_ko||o.change.label_en))||'');", to: "var pkey=okind;" },
  { name: '섞임 표시를 안 함', expect: /^A1 /, from: "if(prev.off!==okind)prev.off='mixed';", to: '' },
  { name: '섞임 판정 뒤집기(같은 상태인데 섞임)', expect: /^C1 /, from: "if(prev.off!==okind)prev.off='mixed';", to: "if(prev.off===okind)prev.off='mixed';" },
  { name: '글자를 첫 부분만', expect: /^A2 |^C1 |^F1 /, from: "  if(ps.length<2)return offLabel1(ps[0]);", to: "  return offLabel1(ps[0]);" },
  { name: '기호를 첫 부분만', expect: /^A3 /, from: "offParts(o).forEach(function(p){var c=", to: "[offParts(o)[0]].forEach(function(p){var c=" },
  { name: '통계를 칸 수로 되돌림', expect: /^A5 /, from: "nOff+=offParts(OFF_SLOTS[ko]).length;", to: "nOff+=1;" },
  { name: '부분 학생을 안 넣음', expect: /^A4 |^B1 |^D1 /, from: "if(!haveP[id]){tgt.students.push(x);haveP[id]=1;}", to: '' },
  { name: '칸 길이를 안 늘림', expect: /^C2 /, from: 'if(oDurN>prev.duration_min)prev.duration_min=oDurN;', to: '' },
  { name: '일간 칸 머리를 옛 삼항식으로', expect: /^G1 /, from: 'escapeHtml(offGlyph(off)+oWho)', to: "escapeHtml((off.off==='postponed'?'⏸ ':'✕ ')+oWho)" },
  { name: '툴팁을 칸 전체 하나로(부분을 안 돎)', expect: /^G2 /, from: 'var ps=offParts(o), multi=ps.length>1;', to: 'var ps=[o], multi=false;' },
  { name: '툴팁: 첫 부분만 돎', expect: /^G2 /, from: '  ps.forEach(function(p){\n    var stus=', to: '  [ps[0]].forEach(function(p){\n    var stus=' },
  { name: '툴팁: 모든 학생을 모든 부분에', expect: /^G2 /, from: 'var stus=(multi?p.students:o.students)||[]', to: 'var stus=(o.students)||[]' },
  { name: '툴팁: 묶음 상자를 안 씀', expect: /^G2 /, from: `html+=multi?'<div class="tooltip-off-part">'+h+'</div>':h;`, to: 'html+=h;' },
  { name: '툴팁: 부분이 하나여도 묶음 상자(짝)', expect: /^G2b /, from: `html+=multi?'<div class="tooltip-off-part">'+h+'</div>':h;`, to: `html+='<div class="tooltip-off-part">'+h+'</div>';` },
  { name: '일간 칸 머리 새 식을 // 주석으로만 남김', expect: /^G1 /, from: "          ' data-off=\"'+oPay+'\">'+escapeHtml(offGlyph(off)+oWho)+'</td>';",
    to: "          ' data-off=\"'+oPay+'\">'+escapeHtml(off.off+oWho)+'</td>';\n          // escapeHtml(offGlyph(off)+oWho)" },
];
console.log('\n─ 변이시험 (소스 사본만 바꾼다) ─');
for (const m of MUTANTS) {
  if (!REAL.includes(m.from)) { fail++; console.log('  FAIL 변이 «' + m.name + '» — 바꿀 자리를 못 찾았다(소스가 바뀌었으면 변이도 고칠 것)'); continue; }
  const res = runChecks(REAL.replace(m.from, m.to));
  const failed = res.filter(r => !r.pass).map(r => r.name);
  const caught = failed.some(n => m.expect.test(n));
  if (caught) { pass++; console.log('  PASS 변이 잡힘 «' + m.name + '» → ' + failed.filter(n => m.expect.test(n)).slice(0, 2).join(' · ')); }
  else { fail++; console.log('  FAIL 변이 못 잡음 «' + m.name + '»' + (failed.length ? ' (다른 실패: ' + failed.slice(0, 3).join(' · ') + ')' : '')); }
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
