/* ══════════════════════════════════════════════════════════════════════════
   student_uplink_cap_harness — 학생 송신 상한 250kbps (idx-vc-mobilefix.js ⑮절)

   [무엇을 지키나] 사장님 2026-09-07 지시 「학생이 보는 교사 화질은 유지하고,
     교사가 보는 학생 화질을 줄여서 가볍게」.
     · 상대편에 «교사» 가 있으면(=내가 학생) 내 송신 상한을 250kbps 로
     · 교사 화면(상대가 학생)에서는 **한 톨도 건드리지 않는다** ← 지시의 절반이 이쪽이다

   [왜 문자열 검사로는 안 되나] 함수도 값도 다 «있고» 틀릴 수 있는 것은
     «어떤 답이 나오는가» 뿐이다. 그래서 소스에서 그 블록을 **오려 내 실제로 돌린다.**
     ⚠️ 값을 여기에 손으로 옮겨 적지 않는다 — 그러면 소스를 한 번도 안 보고
        내가 적은 값만 검사하게 된다(CLAUDE.md 「자기가 새로 만든 상수를 잡아 통과」).
        250000 같은 숫자도 «소스에서 읽어» 확인한다.

   [짝 검사가 생명이다] 「학생이면 낮춘다」만 넣으면 «전부 낮추기» 회귀가 통과한다.
     「교사면 안 낮춘다」를 반드시 나란히 둔다.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* SUC_SRC_FILE 로 다른 사본을 가리킬 수 있다 — 변이시험(일부러 망가뜨린 사본으로 돌려
   «진짜 FAIL 이 나는가» 확인)용. 운영 검사에서는 비워 둔다. */
const SRC_FILE = process.env.SUC_SRC_FILE
  || path.join(ROOT, 'cloudflare-deploy/public/js/idx-vc-mobilefix.js');
const HTML_FILE = path.join(ROOT, 'cloudflare-deploy/public/index.html');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  →  ' + detail : ''}`); }
}

const src = fs.readFileSync(SRC_FILE, 'utf8');

/* ── ⓪ 블록 오려 내기 ────────────────────────────────────────────────
   ⛔ 길이(slice(i, i+N))로 자르지 않는다 — 옆 절이 딸려 들어온다.
      중괄호 짝으로 자른다(CLAUDE.md 「검사 범위를 «길이» 로 자르지 마세요」). */
console.log('\n⓪ ⑮절 블록을 소스에서 오려 낸다');
const ANCHOR = '(function studentUplinkCap() {';
const start = src.indexOf(ANCHOR);
ok(start >= 0, '⑮절(studentUplinkCap)이 소스에 있다');
if (start < 0) { console.log(`\nstudent_uplink_cap_harness — PASS ${pass} / FAIL ${fail}`); process.exit(1); }

function sliceByBraces(text, from) {
  const open = text.indexOf('{', from);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}
const body = sliceByBraces(src, start);
ok(!!body && body.length > 500, '블록 본문을 중괄호 짝으로 잘라냈다', `len=${body ? body.length : 0}`);

/* 소스가 «선언한» 값을 읽는다 — 손으로 적지 않는다 */
const CAP_BR = Number((body.match(/CAP_BR\s*=\s*([0-9]+)\s*\*\s*1000/) || [])[1]) * 1000;
const CAP_FPS = Number((body.match(/CAP_FPS\s*=\s*([0-9]+)/) || [])[1]);
const CAP_SCALE = Number((body.match(/CAP_SCALE\s*=\s*([0-9]+)/) || [])[1]);
ok(CAP_BR === 250000, `상한이 250kbps 다 (소스 선언값 ${CAP_BR})`, String(CAP_BR));
ok(CAP_FPS === 15 && CAP_SCALE === 2,
  `낮출 때 fps·해상도도 '저' 조합으로 맞춘다 (fps ${CAP_FPS} · 1/${CAP_SCALE})`,
  JSON.stringify({ CAP_FPS, CAP_SCALE }));

/* ── 실행기 ────────────────────────────────────────────────────────
   블록은 바깥 스코프의 mgRemoteTeacherPresent 를 부른다 → 주입한다. */
function run({ teacherRemote, observer = false, capOff = false, caps, applyStepSpy } = {}) {
  const store = capOff ? { mangoi_vc_student_cap: 'off' } : {};
  const bodyCls = new Set(observer ? ['vc-observer'] : []);
  const win = {
    vcQualityCaps: caps,
    vcPeerConnections: { a: { __qStep: 0 }, b: { __qStep: 2 } },
    __vcApplyStep: applyStepSpy || function () {},
    vcApplySpotlight: function () { return 'spot'; }
  };
  const doc = { body: { classList: { contains: (c) => bodyCls.has(c) } } };
  const ls = { getItem: (k) => (k in store ? store[k] : null) };
  const con = { log() {}, warn() {} };
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', 'document', 'localStorage', 'console', 'mgRemoteTeacherPresent',
    `(function studentUplinkCap(){${body}})();`);
  fn(win, doc, ls, con, () => teacherRemote);
  return win;
}

const LOW_PC = () => ({ br: 400000, fps: 15, scale: 2 });   // '저' 모드 PC (실제 기본값)
const LOW_PHONE = () => ({ br: 250000, fps: 15, scale: 2 }); // '저' 모드 폰
const HIGH_PC = () => ({ br: 1200000, fps: 24, scale: 1 });  // '자동/고' 모드 PC

/* ── ① 학생 쪽 — 낮춘다 ───────────────────────────────────────────── */
console.log('\n① 상대편에 교사가 있으면(=내가 학생) 250kbps 로 낮춘다');
{
  const w = run({ teacherRemote: true, caps: LOW_PC });
  const c = w.vcQualityCaps();
  ok(c.br === CAP_BR, `PC 학생 400kbps → ${c.br / 1000}kbps`, JSON.stringify(c));
  ok(c.fps === CAP_FPS && c.scale === CAP_SCALE, 'fps·해상도는 폰 학생과 같은 조합', JSON.stringify(c));
}

/* ── ② 교사 쪽 — 손대지 않는다 (짝 검사) ──────────────────────────────
   ⛔ 이 절을 지우면 «모두 낮추기» 회귀가 조용히 통과한다. 지시의 절반이 여기다. */
console.log('\n② 상대편이 학생이면(=내가 교사) 한 톨도 안 건드린다');
{
  const w = run({ teacherRemote: false, caps: LOW_PC });
  const c = w.vcQualityCaps();
  ok(c.br === 400000 && c.fps === 15 && c.scale === 2,
    `교사 송신은 그대로 400kbps (실측 ${c.br / 1000}kbps)`, JSON.stringify(c));
  const w2 = run({ teacherRemote: false, caps: HIGH_PC });
  const c2 = w2.vcQualityCaps();
  ok(c2.br === 1200000 && c2.scale === 1,
    `'고' 모드 교사도 그대로 1200kbps (실측 ${c2.br / 1000}kbps)`, JSON.stringify(c2));
}

/* ── ③ '자동/고' 모드 학생 — br 만 낮추면 깨진다 ────────────────────── */
console.log("\n③ '고' 모드 학생은 fps·해상도도 함께 맞춘다 (br 만 낮추면 720p 에 250kbps → 깨짐)");
{
  const w = run({ teacherRemote: true, caps: HIGH_PC });
  const c = w.vcQualityCaps();
  ok(c.br === CAP_BR, `1200 → ${c.br / 1000}kbps`, JSON.stringify(c));
  ok(c.fps === CAP_FPS, `24fps → ${c.fps}fps`, JSON.stringify(c));
  ok(c.scale === CAP_SCALE, `해상도 1/1 → 1/${c.scale}`, JSON.stringify(c));
}

/* ── ④ 이미 낮은 값은 «올리지» 않는다 ──────────────────────────────── */
console.log('\n④ 이미 250kbps 이하인 연결을 되올리지 않는다 (나쁜 회선 보호)');
{
  const w = run({ teacherRemote: true, caps: LOW_PHONE });
  const c = w.vcQualityCaps();
  ok(c.br === 250000, `폰 학생 250kbps 그대로 (실측 ${c.br / 1000}kbps)`, JSON.stringify(c));
  const w2 = run({ teacherRemote: true, caps: () => ({ br: 120000, fps: 10, scale: 4 }) });
  const c2 = w2.vcQualityCaps();
  ok(c2.br === 120000 && c2.fps === 10 && c2.scale === 4,
    '적응 루프가 더 내려간 상태(120kbps·10fps·1/4)는 건드리지 않는다', JSON.stringify(c2));
}

/* ── ⑤ 참관자 제외 ───────────────────────────────────────────────── */
console.log('\n⑤ 참관(Ghost)은 제외한다 — 역할이 admin 이라 헷갈리기 쉬운 자리');
{
  const w = run({ teacherRemote: true, observer: true, caps: LOW_PC });
  ok(w.vcQualityCaps().br === 400000, '참관 중에는 상한을 걸지 않는다', JSON.stringify(w.vcQualityCaps()));
}

/* ── ⑥ 되돌리는 스위치 ───────────────────────────────────────────── */
console.log("\n⑥ localStorage 'mangoi_vc_student_cap'='off' 로 되돌아간다");
{
  const w = run({ teacherRemote: true, capOff: true, caps: LOW_PC });
  ok(w.vcQualityCaps().br === 400000, '스위치를 끄면 원래대로', JSON.stringify(w.vcQualityCaps()));
}

/* ── ⑦ 안전한 실패 ──────────────────────────────────────────────────
   ⚠️ 이 절이 없으면 «판정이 죽었는데 조용히 전부 낮추는» 상태를 못 본다. */
console.log('\n⑦ 모르면 낮추지 않는다 / 던지지 않는다');
{
  const w = run({ teacherRemote: true, caps: () => { throw new Error('boom'); } });
  let threw = false, out;
  try { out = w.vcQualityCaps(); } catch (e) { threw = true; }
  ok(!threw, '원본이 던져도 감싼 함수는 던지지 않는다');
  ok(out === null || out === undefined, '값을 모르면 지어내지 않는다', JSON.stringify(out));

  const w2 = run({ teacherRemote: true, caps: () => ({ nope: 1 }) });
  const c2 = w2.vcQualityCaps();
  ok(c2 && c2.br === undefined, '모양이 다른 값은 그대로 통과시킨다', JSON.stringify(c2));

  /* 판정 함수 자체가 던지면 → 안 낮춘다 */
  const store = {};
  const win = { vcQualityCaps: LOW_PC, vcPeerConnections: {}, __vcApplyStep() {} };
  const fn = new Function('window', 'document', 'localStorage', 'console', 'mgRemoteTeacherPresent',
    `(function studentUplinkCap(){${body}})();`);
  fn(win, { body: { classList: { contains: () => false } } },
     { getItem: (k) => (k in store ? store[k] : null) }, { log() {}, warn() {} },
     () => { throw new Error('role unknown'); });
  ok(win.vcQualityCaps().br === 400000, '판정이 던지면 «모름» 으로 보고 안 낮춘다',
    JSON.stringify(win.vcQualityCaps()));
}

/* ── ⑧ vcQualityCaps 가 없으면 조용히 헛돌지 않는다 ─────────────────── */
console.log('\n⑧ 감쌀 대상이 없으면 멈춘다 (이름이 바뀌면 조용히 헛도는 것을 막는다)');
{
  const win = { vcPeerConnections: {} };
  const fn = new Function('window', 'document', 'localStorage', 'console', 'mgRemoteTeacherPresent',
    `(function studentUplinkCap(){${body}})();`);
  let threw = false;
  try {
    fn(win, { body: { classList: { contains: () => false } } },
       { getItem: () => null }, { log() {}, warn() {} }, () => true);
  } catch (e) { threw = true; }
  ok(!threw, '없어도 예외를 내지 않는다');
  ok(typeof win.vcQualityCaps !== 'function', '없는 것을 감싸 «가짜 함수» 를 만들지 않는다');
  ok(typeof win.__mgStudentUplinkCap === 'undefined', '손잡이도 안 만든다(적용 안 됐다는 표시)');
}

/* ── ⑨ 이미 걸린 연결에 다시 거는가 (역할이 늦게 올 때) ──────────────── */
console.log('\n⑨ 판정이 바뀌면 이미 연결된 상대에게 다시 건다 — «바뀔 때만»');
{
  let calls = [];
  let isTeacher = false;
  const store = {};
  const win = {
    vcQualityCaps: LOW_PC,
    vcPeerConnections: { a: { __qStep: 0 }, b: { __qStep: 2 } },
    __vcApplyStep: (pc, step) => calls.push(step),
    vcApplySpotlight: function () { return 'spot'; }
  };
  const fn = new Function('window', 'document', 'localStorage', 'console', 'mgRemoteTeacherPresent',
    `(function studentUplinkCap(){${body}})();`);
  fn(win, { body: { classList: { contains: () => false } } },
     { getItem: (k) => (k in store ? store[k] : null) }, { log() {}, warn() {} },
     () => isTeacher);

  ok(typeof win.vcApplySpotlight === 'function' && win.vcApplySpotlight() === 'spot',
    'vcApplySpotlight 를 감싸되 원래 반환값을 그대로 돌려준다');

  win.vcApplySpotlight();                       // 아직 학생 아님 → 첫 판정 기록
  const afterFirst = calls.length;
  win.vcApplySpotlight();                       // 그대로 → 다시 걸지 않는다
  ok(calls.length === afterFirst, '판정이 그대로면 setParameters 를 다시 부르지 않는다 (영상 튐 방지)',
    JSON.stringify(calls));

  isTeacher = true;                             // 역할이 늦게 와서 «상대가 교사» 로 밝혀짐
  calls = [];
  win.vcApplySpotlight();
  ok(calls.length === 2, '연결된 상대 2개 모두에게 다시 건다', JSON.stringify(calls));
  ok(calls.includes(0) && calls.includes(2), '각 연결의 현재 단계(__qStep)를 그대로 쓴다', JSON.stringify(calls));

  calls = [];
  win.vcApplySpotlight();
  ok(calls.length === 0, '두 번째 호출에서는 다시 걸지 않는다', JSON.stringify(calls));
}

/* ── ⑩ 배선 — 화면이 이 파일의 새 판을 싣는가 ────────────────────────── */
console.log('\n⑩ index.html 이 이 파일을 싣고 ?v= 가 올라갔는가');
{
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const m = html.match(/idx-vc-mobilefix\.js\?v=(\d+)/);
  ok(!!m, 'index.html 이 idx-vc-mobilefix.js 를 싣는다');
  ok(m && Number(m[1]) >= 24, `?v= 가 24 이상이다 (실측 ${m ? m[1] : '-'})`, m ? m[1] : '');
}

/* ── ⑪ «크기» 와 «용량» 을 섞어 적지 않았는가 ───────────────────────────
   이 저장소가 실제로 밟은 오해다 — 화면 크기는 대역폭과 무관하다.
   그 경고가 소스에 남아 있어야 다음 사람이 이 절을 «화면 크기 절감» 으로 안 읽는다. */
console.log('\n⑪ 소스가 «효과 크기» 를 부풀리지 않는다');
{
  ok(/CPU\s*절감책.*인용하지 말/.test(src.replace(/\s+/g, ' ')) || /CPU 절감책/.test(src),
    '「교사 CPU 절감책으로 인용하지 말 것」 경고가 남아 있다');
  ok(/폰 학생은 이미 250/.test(src), '「폰 학생은 변화 없음」이라는 한계가 적혀 있다');
}

console.log(`\n🎚 student_uplink_cap_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
