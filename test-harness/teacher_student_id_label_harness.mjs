// ═══════════════════════════════════════════════════════════════════════════
// 🆔 teacher_student_id_label_harness — 강사 화면 수업 이름 옆 «학생 아이디»
//
// [왜 이 검사가 있나 — 2026-09-22]
//   제안: 「강사 페이지에서 망고아이 수업을 늘 학생 아이디와 함께 적어 달라.
//          그래야 강사가 테스트 수업은 망고아이로 들어가야 한다는 걸 안다.」
//   강사는 같은 수업을 «옛 LMS» 에서도 본다. 두 화면을 잇는 열쇠는 «이름» 이 아니라
//   **아이디** 다(동명이인이 실재한다 — 김민서 71명·김민준 56명).
//
// [문자열 검사로는 원리상 못 잡는다]
//   함수도 값도 다 «있고» 틀린 것은 «무슨 글자가 나오는가» 뿐이다. 그래서 이 하니스는
//   teacher.html·api-teacher.ts 에서 정본을 **오려 내 실제로 돌려** 답을 대조한다.
//   ⛔ 기대값을 손으로 베끼지 말 것 — 색·문구는 소스에서 «읽어» 온다.
//
// [짝으로 묻는다]
//   「붙인다」만 재면 «전부 붙이기» 도 통과한다. 그래서 언제나 반대쪽을 함께 둔다:
//     · 아이디가 있으면 붙인다  ↔  없으면 빈 껍데기를 안 만든다
//     · 레벨테스트엔 망고아이 안내  ↔  정규수업엔 안 붙인다
//     · 진짜 아이디는 내려간다   ↔  자리표시(lms·type_seed)는 비운다
//     · 정본을 부른다            ↔  옛 모양(esc(stuName(…)))으로 다시 조립하지 않는다
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';

const HTML_PATH = process.env.TEACHER_HTML || 'cloudflare-deploy/public/teacher.html';
const API_PATH  = process.env.TEACHER_API  || 'cloudflare-deploy/src/api-teacher.ts';

let pass = 0, fail = 0;
const ok  = (name, cond, detail) => {
  if (cond) { pass++; }
  else { fail++; console.log('  ❌ ' + name + (detail ? ' — ' + detail : '')); }
};
const eq = (name, got, want) =>
  ok(name, got === want, 'got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want));

const html = readFileSync(HTML_PATH, 'utf8');
const api  = readFileSync(API_PATH, 'utf8');

// ── 중괄호 «짝» 으로 자른다 (⛔ 길이로 자르지 말 것 — 옆 코드가 딸려 온다) ──────────
function braceBody(src, startIdx) {
  const open = src.indexOf('{', startIdx);
  if (open < 0) return null;
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(startIdx, i + 1); }
  }
  return null;
}
function cutFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  return i < 0 ? null : braceBody(src, i);
}

// ── 인라인 <script> 중 본체 블록 ────────────────────────────────────────────────
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
const js = blocks.sort((a, b) => b.length - a.length)[0] || '';
ok('① 전제: 인라인 스크립트 본체를 찾았다', js.length > 10000, 'len=' + js.length);

// ═══ ② 정본 함수를 오려 내 «실제로» 돌린다 ═════════════════════════════════════
const srcEsc   = cutFn(js, 'esc');
const srcUid   = cutFn(js, 'stuUid');
const srcName  = cutFn(js, 'stuName');
const srcParts = cutFn(js, 'stuParts');
const srcText  = cutFn(js, 'stuLabelText');
const srcHtml  = cutFn(js, 'stuLabelHtml');
ok('② 전제: 정본 6종을 전부 오려 냈다',
   !!(srcEsc && srcUid && srcName && srcParts && srcText && srcHtml),
   [srcEsc, srcUid, srcName, srcParts, srcText, srcHtml].map(x => x ? 'o' : 'x').join(''));

let L = null, runErr = '';
try {
  // EN() 은 밖에서 갈아 끼운다(영어 화면에서도 같은 규칙인지 보려고).
  L = new Function('__EN', `
    var EN = function(){ return !!__EN(); };
    ${srcEsc}
    ${srcName}
    ${srcUid}
    ${srcParts}
    ${srcText}
    ${srcHtml}
    return { esc: esc, parts: stuParts, text: stuLabelText, html: stuLabelHtml };
  `);
} catch (e) { runErr = String(e && e.message || e); }
ok('② 정본이 실제로 실행된다', !!L, runErr);

const FB = '(이름 미등록)';
if (L) {
  const ko = L(() => false);   // 한국어 화면
  const en = L(() => true);    // 영어 화면

  // ── 짝 ⓐ 아이디가 있으면 «붙인다» ────────────────────────────────────────────
  const row = { student_name: '정우영', student_uid: 'jeong' };
  eq('②-1 이름+아이디 → 글자', ko.text(row, FB), '정우영 · jeong');
  ok('②-2 이름+아이디 → HTML 에 아이디 span',
     ko.html(row, FB) === '정우영<span class="stu-id">jeong</span>', ko.html(row, FB));

  // ── 짝 ⓑ 아이디가 없으면 «빈 껍데기를 안 만든다» ──────────────────────────────
  const noId = { student_name: '정우영' };
  eq('②-3 이름만 → 글자는 예전 그대로', ko.text(noId, FB), '정우영');
  ok('②-4 이름만 → span·괄호를 만들지 않는다',
     ko.html(noId, FB) === '정우영', ko.html(noId, FB));

  // 이름이 없으면 아이디가 «이름 자리» 로 간다(빈 이름이 최악이다).
  const noName = { student_uid: 'lt18' };
  eq('②-5 이름 없음 → 아이디가 이름 자리', ko.text(noName, FB), 'lt18');
  ok('②-6 이름 없음 → 아이디를 두 번 적지 않는다',
     ko.html(noName, FB) === 'lt18', ko.html(noName, FB));

  // ── 짝 ⓒ 이름 칸에 아이디가 든 행(옛 LMS: student_name = user_id) ─────────────
  eq('②-7 이름==아이디 → 한 번만',
     ko.text({ student_name: 'mby1', student_uid: 'mby1' }, FB), 'mby1');
  eq('②-8 대소문자만 다른 같은 글자도 한 번만',
     ko.text({ student_name: 'Kim', student_uid: 'kim' }, FB), 'Kim');

  // ── 둘 다 없으면 예전 문구 그대로 ────────────────────────────────────────────
  eq('②-9 둘 다 없으면 폴백(글자)', ko.text({}, FB), FB);
  eq('②-10 둘 다 없으면 폴백(HTML)', ko.html({}, FB), FB);

  // ── 이스케이프 — 이 값들은 DB 에서 온다 ───────────────────────────────────────
  const evil = { student_name: '<b>x</b>', student_uid: 'a"b<c' };
  ok('②-11 이름을 이스케이프한다', !ko.html(evil, FB).includes('<b>'), ko.html(evil, FB));
  ok('②-12 아이디를 이스케이프한다',
     ko.html(evil, FB).includes('a&quot;b&lt;c'), ko.html(evil, FB));

  // ── 영어 화면도 같은 규칙(이름만 영문명으로 바뀐다) ───────────────────────────
  eq('②-13 영어 화면 → 영문명 + 아이디',
     en.text({ student_name: '정우영', student_name_en: 'Woo', student_uid: 'jeong' }, FB),
     'Woo · jeong');

  // ── 공백만 든 아이디를 «있는 것» 으로 보지 않는다 ────────────────────────────
  eq('②-14 공백 아이디는 없는 것', ko.text({ student_name: '정우영', student_uid: '   ' }, FB), '정우영');

  // ── 판정은 한 곳 — 글자 자리와 HTML 자리가 «같은 답» 을 낸다 ──────────────────
  const cases = [row, noId, noName, { student_name: 'mby1', student_uid: 'mby1' }, {}];
  const same = cases.every(c => {
    const p = ko.parts(c);
    const t = ko.text(c, FB);
    const h = ko.html(c, FB);
    return (p.nm ? t.startsWith(p.nm) : t === FB) && (p.nm ? h.startsWith(ko.esc(p.nm)) : h === ko.esc(FB));
  });
  ok('②-15 텍스트 자리와 HTML 자리가 같은 판정을 쓴다', same);
}

// ═══ ③ 배선 — 정본을 «실제로 부르는가» ↔ 옛 모양으로 «다시 조립하지 않는가» ══════
const callsHtml = (js.match(/stuLabelHtml\s*\(/g) || []).length - 1;   // 선언 1개 제외
const callsText = (js.match(/stuLabelText\s*\(/g) || []).length - 1;
ok('③-1 이름을 그리는 자리가 정본을 부른다 (HTML 4곳 이상)', callsHtml >= 4, 'calls=' + callsHtml);
ok('③-2 글자만 쓰는 자리도 정본을 부른다 (3곳 이상)', callsText >= 3, 'calls=' + callsText);
ok('③-3 ⛔ 옛 모양 esc(stuName(…)) 으로 다시 조립하지 않는다',
   !/esc\s*\(\s*stuName\s*\(/.test(js));
ok('③-4 ⛔ 이름만 그리는 옛 모양 (stuName(x) || T(…)) 이 남아 있지 않다',
   !/\(\s*stuName\s*\([^)]*\)\s*\|\|\s*T\(/.test(js));

// 선언이 «한 벌» 인가 — 복제되면 두 화면이 다른 말을 한다.
eq('③-5 stuParts 선언은 정확히 하나', (js.match(/function\s+stuParts\s*\(/g) || []).length, 1);

// 중첩 함수 선언 함정 — 정본은 기존 stuName·esc 와 «같은 깊이» 여야 한다.
const depthAt = (needle) => {
  const i = js.indexOf(needle);
  if (i < 0) return -1;
  const head = js.slice(0, i);
  return (head.split('{').length - 1) - (head.split('}').length - 1);
};
const dName = depthAt('function stuName(');
ok('③-6 정본이 stuName 과 같은 스코프에 있다 (중첩 선언 아님)',
   dName >= 0 && depthAt('function stuParts(') === dName
             && depthAt('function stuLabelHtml(') === dName
             && depthAt('function stuLabelText(') === dName,
   'stuName=' + dName + ' parts=' + depthAt('function stuParts(')
     + ' html=' + depthAt('function stuLabelHtml(') + ' text=' + depthAt('function stuLabelText('));

// ═══ ④ 🥭 「망고아이에서 입장」 안내 — 짝으로 묻는다 ═══════════════════════════
const mgIdx = js.indexOf('var _mgKind');
ok('④ 전제: 망고아이 안내 블록을 찾았다', mgIdx >= 0);
if (mgIdx >= 0) {
  // `var _mgKind = …;` 줄 + 뒤따르는 if 블록을 중괄호 짝으로 자른다.
  const ifIdx = js.indexOf('if (', mgIdx);
  const declLine = js.slice(mgIdx, ifIdx);
  const ifBlock = braceBody(js, ifIdx);
  ok('④ 전제: if 블록을 중괄호 짝으로 잘라 냈다', !!ifBlock);
  let runMeta = null, mErr = '';
  try {
    runMeta = new Function('c', `
      ${srcEsc}
      var T = function(en, ko){ return ko; };
      var meta = [];
      ${declLine}
      ${ifBlock}
      return meta;
    `);
  } catch (e) { mErr = String(e && e.message || e); }
  ok('④ 안내 블록이 실제로 실행된다', !!runMeta, mErr);
  if (runMeta) {
    const hasHint = (c) => runMeta(c).some(s => /망고아이/.test(String(s)));
    ok('④-1 레벨테스트에는 망고아이 안내가 붙는다', hasHint({ class_kind: 'level_test' }));
    ok('④-2 체험수업에도 붙는다', hasHint({ class_kind: 'trial' }));
    ok('④-3 옛 캐시(class_kind 없음 + is_level_test)에도 붙는다', hasHint({ is_level_test: true }));
    // 짝 — 없으면 «전부 붙이기» 도 통과한다.
    ok('④-4 ⛔ 정규수업에는 안 붙는다', !hasHint({ class_kind: 'regular' }));
    ok('④-5 ⛔ 보강수업에도 안 붙는다', !hasHint({ class_kind: 'makeup' }));
    ok('④-6 ⛔ 종류를 모르는 행에도 안 붙는다', !hasHint({}));
    // 안내는 «어디로 들어가는가» 를 말해야 한다 — 배지(레벨테스트)와 다른 정보다.
    ok('④-7 안내가 «옛 LMS 아님» 을 말한다',
       runMeta({ class_kind: 'level_test' }).some(s => /LMS/.test(String(s))));
  }
}

// ═══ ⑤ 서버 — 자리표시는 «비워서» 내려간다 (정본을 실제로 돌린다) ══════════════
const sIdx = api.indexOf('const studentUidOf');
ok('⑤ 전제: studentUidOf 를 찾았다', sIdx >= 0);
if (sIdx >= 0) {
  const raw = braceBody(api, sIdx);
  const stripped = String(raw || '')
    .replace(/:\s*string\s*\|\s*null/g, '')
    .replace(/:\s*any/g, '');
  let sFn = null, sErr = '';
  try { sFn = new Function(`${stripped}\n; return studentUidOf;`)(); }
  catch (e) { sErr = String(e && e.message || e); }
  ok('⑤ studentUidOf 가 실제로 실행된다', !!sFn, sErr);
  if (sFn) {
    // 짝 ⓐ — 자리표시는 비운다(그리면 「lms 라는 학생」 이 생긴다)
    eq('⑤-1 lms 는 비운다', sFn({ user_id: 'lms' }), null);
    eq('⑤-2 대문자 LMS 도 비운다', sFn({ user_id: 'LMS' }), null);
    eq('⑤-3 type_seed 는 비운다', sFn({ user_id: 'type_seed' }), null);
    eq('⑤-4 빈 값은 비운다', sFn({ user_id: '' }), null);
    eq('⑤-5 없는 값은 비운다', sFn({}), null);
    // 짝 ⓑ — 진짜 아이디는 그대로 내려간다(앞만 보면 «전부 비우기» 도 통과한다)
    eq('⑤-6 진짜 아이디는 그대로', sFn({ user_id: 'jeong' }), 'jeong');
    eq('⑤-7 앞뒤 공백은 다듬는다', sFn({ user_id: '  lt18  ' }), 'lt18');
    eq('⑤-8 lms 를 품은 다른 아이디는 살린다', sFn({ user_id: 'lms_kid' }), 'lms_kid');
  }

  // 배선 — 주간표·앞으로 7일 push 안에서 «그 함수를 쓰는가»
  const wIdx = api.indexOf('weekDays[wi].items.push(');
  const uIdx = api.indexOf('upcoming.push(');
  const wBody = wIdx >= 0 ? braceBody(api, wIdx) : '';
  const uBody = uIdx >= 0 ? braceBody(api, uIdx) : '';
  ok('⑤ 전제: 두 push 블록을 잘라 냈다', !!wBody && !!uBody);
  ok('⑤-9 주간표가 아이디를 싣는다', /student_uid\s*:\s*studentUidOf\(s\)/.test(wBody));
  ok('⑤-10 앞으로 7일도 아이디를 싣는다', /student_uid\s*:\s*studentUidOf\(s\)/.test(uBody));
  // 짝 — 손으로 다시 적지 않는가(정본을 비켜 가면 자리표시가 그대로 샌다)
  ok('⑤-11 ⛔ 자리표시를 거르지 않는 날것(user_id)을 싣지 않는다',
     !/student_uid\s*:\s*s\.user_id/.test(wBody) && !/student_uid\s*:\s*s\.user_id/.test(uBody));

  // ⛔ 주석이 「같은 판정이 아래 kind 계산에도 있다 — 한쪽만 고치지 말 것」이라 적어 두었다.
  //    그 말이 «사실» 이려면 아이디를 싣는 자리가 «전부» 정본을 지나야 한다.
  const uidLines = (api.match(/student_uid\s*:\s*[^,\n]+/g) || []).map(x => x.trim());
  ok('⑤-12 아이디를 싣는 자리를 전부 찾았다 (오늘·대타·옛LMS 미러 포함 5곳 이상)',
     uidLines.length >= 5, 'n=' + uidLines.length);
  ok('⑤-13 아이디를 싣는 자리가 «전부» 정본을 지난다',
     uidLines.every(l => /studentUidOf\(/.test(l)),
     uidLines.filter(l => !/studentUidOf\(/.test(l)).join(' | '));
}

// ═══ ⑥ 아이디 색 — 소스에서 «읽어» 대조한다 (⛔ 값을 하니스에 베끼지 말 것) ══════
const metaRule = /\.cls-meta\{[^}]*color:\s*(#[0-9a-fA-F]{3,8})/.exec(html);
const idRule   = /\.stu-id\{([^}]*)\}/.exec(html);
ok('⑥ 전제: .cls-meta 와 .stu-id 규칙을 찾았다', !!metaRule && !!idRule);
if (metaRule && idRule) {
  const idColor = /color:\s*(#[0-9a-fA-F]{3,8})/.exec(idRule[1]);
  ok('⑥-1 아이디 색이 .cls-meta 와 같다 (흰 카드에서 이미 읽히는 값)',
     !!idColor && idColor[1].toLowerCase() === metaRule[1].toLowerCase(),
     'id=' + (idColor && idColor[1]) + ' meta=' + metaRule[1]);
  ok('⑥-2 ⛔ 이 규칙이 스스로 opacity 로 흐려지지 않는다', !/opacity/.test(idRule[1]), idRule[1]);
}

// ── 🌙 다크 모드에서도 «읽히는가» — 색은 전부 소스에서 읽어 온다 ────────────────
//   `.cls-meta` 에는 다크 override 가 있는데 `.stu-id` 에만 없으면, 밝은 모드에서
//   멀쩡한 색이 어두운 카드 위에서 대비 3 대로 떨어진다(이 화면은 사람이 켜는 다크다).
const cssText = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
function ruleColorFor(sel) {
  let found = null;
  for (const m of cssText.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1].split(',').map(x => x.trim());
    if (!selectors.includes(sel)) continue;
    const c = /(?:^|;)\s*color:\s*(#[0-9a-fA-F]{3,8})/.exec(m[2]);
    if (c) found = c[1];
  }
  return found;
}
function ruleBgFor(sel) {
  let found = null;
  for (const m of cssText.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectors = m[1].split(',').map(x => x.trim());
    if (!selectors.includes(sel)) continue;
    const c = /background(?:-color)?:\s*(#[0-9a-fA-F]{3,8})/.exec(m[2]);
    if (c) found = c[1];
  }
  return found;
}
function relLum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  const ch = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a, b) {
  const la = relLum(a), lb = relLum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const idLight   = idRule ? (/color:\s*(#[0-9a-fA-F]{3,8})/.exec(idRule[1]) || [])[1] : null;
const idDark    = ruleColorFor('html[data-t="dark"] .stu-id');
const cardDark  = ruleBgFor('html[data-t="dark"] .card');
ok('⑥-3 다크 모드에 .stu-id override 가 있다 (.cls-meta 와 짝)', !!idDark, 'dark=' + idDark);
ok('⑥ 전제: 다크 카드 배경색을 읽었다', !!cardDark, 'card=' + cardDark);
if (idLight && idDark && cardDark) {
  const crLight = contrast(idLight, '#ffffff');
  const crDark  = contrast(idDark, cardDark);
  console.log(`  📏 아이디 대비 — 밝은 모드 ${crLight.toFixed(2)}:1 (${idLight} / #ffffff)`
            + `, 다크 ${crDark.toFixed(2)}:1 (${idDark} / ${cardDark})`);
  ok('⑥-4 밝은 모드에서 읽힌다 (WCAG AA 4.5)', crLight >= 4.5, crLight.toFixed(2));
  ok('⑥-5 다크 모드에서도 읽힌다 (WCAG AA 4.5)', crDark >= 4.5, crDark.toFixed(2));
}

// ═══ ⑦ 「수업 연기·변경」 목록 — rows 를 «손으로 다시 만드는» 자리 ═════════════════
//   그 자리는 필드를 골라 담기 때문에 새 칸을 빠뜨리기 쉽다. 빠지면 화면은 멀쩡히
//   그려지고 아이디만 «원리상» 안 나온다 — 그래서 실제로 돌려 «무슨 글자가 나오는가» 를 본다.
const ppIdx = js.indexOf('window.renderPostponeList = function()');
ok('⑦ 전제: 연기 목록 함수를 찾았다', ppIdx >= 0);
if (ppIdx >= 0 && srcEsc) {
  const ppSrc = braceBody(js, ppIdx);
  ok('⑦ 전제: 함수를 중괄호 짝으로 잘라 냈다', !!ppSrc);
  let runPP = null, pErr = '';
  try {
    runPP = new Function('__DATA', `
      ${srcEsc}
      ${srcName}
      ${srcUid}
      ${srcParts}
      ${srcHtml}
      var EN = function(){ return false; };
      var T = function(en, ko){ return ko; };
      var now = function(){ return 0; };
      var DATA = __DATA;
      var window = {};
      var out = '';
      var fill = function(id, h){ out = h; };
      var bindAll = function(){};
      var document = { getElementById: function(){ return null; } };
      ${ppSrc};
      window.renderPostponeList();
      return out;
    `);
  } catch (e) { pErr = String(e && e.message || e); }
  ok('⑦ 연기 목록이 실제로 실행된다', !!runPP, pErr);
  if (runPP) {
    const out = runPP({
      today: '2026-09-22',
      classes: [
        { schedule_id: 11, start_ts: 9e12, start_time: '14:00',
          student_name: '정우영', student_uid: 'jeong' },
        { schedule_id: 12, start_ts: 9e12, start_time: '15:00', student_name: '이름만' },
      ],
      upcoming: [
        { id: 21, start_ts: 9e12, start_time: '10:00', date: '2026-09-24',
          student_name: '김사랑', student_uid: 'lt18' },
      ],
    });
    ok('⑦-1 오늘 수업 줄에 아이디가 나온다',
       out.includes('<span class="stu-id">jeong</span>'), out.slice(0, 400));
    ok('⑦-2 다가오는 수업 줄에도 아이디가 나온다',
       out.includes('<span class="stu-id">lt18</span>'), out.slice(0, 400));
    // 짝 — 없으면 «전부 붙이기»(빈 껍데기)도 통과한다.
    ok('⑦-3 ⛔ 아이디 없는 줄에는 빈 껍데기를 안 만든다',
       (out.match(/class="stu-id"/g) || []).length === 2,
       'n=' + (out.match(/class="stu-id"/g) || []).length);
  }
}

// ═══ ⑧ ⚡ 장애 신고 본문은 «저장되는 값» 이라 아이디를 넣지 않는다 ═══════════════
//   D1 teacher_outages.affected_text + 사무실 알림으로 그대로 나간다(화면 표시와 다른 일).
const ogIdx = js.indexOf('function outageAffected(');
ok('⑧ 전제: outageAffected 를 찾았다', ogIdx >= 0);
if (ogIdx >= 0 && srcEsc) {
  const ogSrc = braceBody(js, ogIdx);
  let runOG = null, oErr = '';
  try {
    runOG = new Function('__DATA', `
      ${srcName}
      ${srcUid}
      ${srcParts}
      ${srcText}
      ${srcEsc}
      var EN = function(){ return false; };
      var T = function(en, ko){ return ko; };
      var now = function(){ return 0; };
      var DATA = __DATA;
      ${ogSrc}
      return outageAffected();
    `);
  } catch (e) { oErr = String(e && e.message || e); }
  ok('⑧ 장애 스냅샷이 실제로 실행된다', !!runOG, oErr);
  if (runOG) {
    const aff = runOG({ classes: [
      { start_ts: 1, close_at_ts: 9e12, start_time: '14:00',
        student_name: '정우영', student_uid: 'jeong' },
    ] });
    ok('⑧-1 이름은 그대로 들어간다', /정우영/.test(aff.text), aff.text);
    ok('⑧-2 ⛔ 아이디는 안 들어간다', !/jeong/.test(aff.text), aff.text);
  }
}

// ═══ ⑨ 🥭 안내 자리 — 🔄 대체강사가 «맨 앞» 이라고 그 자리 주석이 못 박는다 ═══════
const subIdx = js.indexOf("if (c.substitute) meta.push(");
ok('⑨ 🔄 대체강사 표시가 🥭 안내보다 앞이다',
   subIdx >= 0 && mgIdx >= 0 && subIdx < mgIdx, 'sub=' + subIdx + ' mango=' + mgIdx);

// ═══ ⑩ 다시 그릴지 판정하는 지문(sig)에 아이디가 들어 있다 ═════════════════════
//   빠지면 «아이디만 바뀐» 응답에서 화면이 옛 글자를 그대로 둔다.
const sigIdx = js.indexOf('sig += sc.schedule_id');
ok('⑩ 전제: sig 조립식을 찾았다', sigIdx >= 0);
if (sigIdx >= 0) {
  const sigExpr = js.slice(sigIdx, js.indexOf(';', sigIdx));
  ok('⑩-1 지문이 아이디를 함께 본다', /stuUid\s*\(/.test(sigExpr), sigExpr.replace(/\s+/g, ' ').slice(0, 200));
  ok('⑩-2 짝: 이름도 여전히 본다', /stuName\s*\(/.test(sigExpr));
}

console.log(`\nteacher_student_id_label_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) { console.log('⚠ 실제 확인 필요'); process.exit(1); }
