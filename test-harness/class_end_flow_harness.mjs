/* class_end_flow_harness.mjs — 수업 종료 흐름(평가 ⭐ → 복습퀴즈 🧠)이 「나가기」에 실제로 이어져 있는지 (2026-09-02)
 *
 * 왜 필요한가
 *   index.html 의 종료 방아쇠는 나가기 버튼을 «셀렉터» 로 찾는다(isExitBtnEl).
 *   그런데 화면에 실제로 보이는 「나가기」는 js/vc-dock.js 가 그리는 «다른 버튼» 이고,
 *   그 버튼의 id·class 가 셀렉터와 어긋나 있으면 **눌러도 평가·복습퀴즈가 통째로 건너뛰어진다.**
 *   실제로 그 상태였다(2026-09-02 사장님 제보 「중국어 수업 후 복습퀴즈도 설문도 안 나온다」).
 *     · 독 버튼: id=vc-dock-leave · class=leave  → 셀렉터 5개 중 **하나도 안 맞음**
 *     · 게다가 vc-dock.js 가 옛 버튼(#vc-exit-btn-v34)을 display:none 으로 숨긴다
 *   [실측] class_ratings 에 평가가 남은 수업 5건은 전부 «강사 퇴장 후 10초» 방아쇠로 뜬 것이었고
 *     (강사→학생 퇴장 간격 12초·3분36초·4분20초·5분19초), 학생이 먼저 나간
 *     class-849-20260902(간격 3초)만 한 줄도 없었다.
 *   [브라우저 변이시험] 클래스를 빼면 학생이 나가기를 눌렀을 때 평가 모달이 안 뜨고
 *     주소가 /?_e=... 로 바뀐다(v34 FORCE_HOME) — 즉 홈으로 튕긴다.
 *
 * 무엇을 검사하나 — «두 파일이 서로 같은 말을 하는가»
 *   ⛔ 「그 글자가 있는가」로 쓰지 않는다. index.html 의 셀렉터를 **읽어서** 파싱하고,
 *      vc-dock.js 가 만드는 버튼이 그중 하나에 **실제로 매치되는지** 대조한다.
 *      그래야 어느 쪽을 바꿔도 어긋나는 순간 FAIL 이 난다.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

const html = readFileSync(join(PUB, 'index.html'), 'utf8');
const dock = readFileSync(join(PUB, 'js', 'vc-dock.js'), 'utf8');
const mfix = readFileSync(join(PUB, 'js', 'idx-vc-mobilefix.js'), 'utf8');

console.log('■ ① 「나가기」 → 평가·복습퀴즈 배선');

/* index.html 의 종료 방아쇠가 쓰는 셀렉터 목록을 «읽어» 온다 */
const selMatches = [...html.matchAll(/closest\(\s*'([^']*#vc-exit-btn-v3[^']*)'\s*\)/g)].map(m => m[1]);
ok(selMatches.length >= 2, '종료 방아쇠 셀렉터를 index.html 에서 찾았다 (' + selMatches.length + '곳)',
   '평가(4325행)·v35(4601행) 두 곳이 같은 셀렉터를 쓴다');

/* vc-dock.js 가 만드는 나가기 버튼의 tag/id/class 를 «읽어» 온다.
   mk(id, label, icon, cls, tip) → button#vc-dock-<id>.<cls> */
const mkLeave = /mk\(\s*'leave'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'([^']*)'/.exec(dock);
ok(!!mkLeave, 'vc-dock.js 에서 나가기 버튼 생성 호출을 찾았다',
   "mk('leave', …) 의 모양이 바뀌면 이 검사가 헛돈다 — 모양을 바꾸면 여기도 함께 고칠 것");

if (mkLeave && selMatches.length) {
  const cls = new Set(mkLeave[1].split(/\s+/).filter(Boolean));
  const btn = { tag: 'button', id: 'vc-dock-leave', cls };
  /* 「button.ctrl-btn.danger」 같은 단순 셀렉터를 파싱해 실제로 매치되는지 본다 */
  const matches = sel => sel.split(',').map(s => s.trim()).some(one => {
    const m = /^([a-z]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/.exec(one);
    if (!m) return false;
    if (m[1] && m[1] !== btn.tag) return false;
    if (m[2] && m[2].slice(1) !== btn.id) return false;
    const need = (m[3] || '').split('.').filter(Boolean);
    return need.every(c => btn.cls.has(c));
  });
  const hit = selMatches.filter(matches).length;
  ok(hit === selMatches.length,
     '독의 「나가기」 버튼이 종료 방아쇠 셀렉터에 걸린다 (' + hit + '/' + selMatches.length + ')',
     '걸리지 않으면 학생이 나가기를 눌러도 평가·복습퀴즈가 통째로 건너뛰어진다. '
     + '버튼 class = "' + [...cls].join(' ') + '"');
}

/* 색을 되돌려 두었는가 — css/vc-refresh.css 의 작성자 !important 가 독 버튼까지 바꾼다 */
const refresh = readFileSync(join(PUB, 'css', 'vc-refresh.css'), 'utf8');
const refreshOwns = /body\.vc-in-call\s+\.ctrl-btn\.danger[^{]*\{[^}]*!important/.test(refresh);
if (refreshOwns && mkLeave && mkLeave[1].includes('danger')) {
  const leaveCss = (dock.match(/#vc-dock button\.leave\{[^}]*/g) || []).join(' ');
  ok(/background:[^;]*!important/.test(leaveCss) && /color:[^;]*!important/.test(leaveCss),
     '독 나가기 버튼의 원래 색을 !important 로 되돌려 두었다',
     'css/vc-refresh.css 의 body.vc-in-call .ctrl-btn.danger 가 !important 라, 안 되돌리면 '
     + '연빨강(.18)이 진빨강(.96)+흰글자로 바뀐다 — 사장님이 지시하지 않은 시각 변경');
}

console.log('■ ② 공유받은 교재의 «이름» 을 학생 화면도 아는가');

ok(/window\.vcApplySharedPdf\s*=\s*function/.test(mfix),
   'idx-vc-mobilefix.js 가 vcApplySharedPdf 를 감싼다',
   '이 배선이 없으면 학생 화면은 교재 이름을 영영 못 받아 «중국어 수업인데 영어 퀴즈» 가 된다');
ok(/__mangoiCurrentBookId\s*=\s*bk/.test(mfix),
   '뽑은 교재 이름을 __mangoiCurrentBookId 에 넣는다',
   'js/idx-x8.js 의 ctx() 가 읽는 바로 그 칸이다');
ok(/window\.__rqvResetProbe\s*=\s*function/.test(mfix),
   '교재가 «나중에» 오면 ⑩절 probe 를 다시 하게 푼다',
   '안 풀면 수업 초반에 복습 탭을 먼저 연 학생은 그 세션 내내 中文 전환이 안 된다');

/* 교재명 추출은 «문자열이 있는가» 가 아니라 함수를 오려 내 실제로 돌려서 판정한다 */
const bookOfSrc = /function bookOf\(name\)\s*\{[\s\S]*?\n    \}/.exec(mfix);
ok(!!bookOfSrc, '교재명 추출 함수(bookOf)를 오려 냈다');
if (bookOfSrc) {
  let bookOf = null;
  try { bookOf = new Function(bookOfSrc[0] + '; return bookOf;')(); } catch (e) { bookOf = null; }
  ok(typeof bookOf === 'function', 'bookOf 가 실제로 돌아간다');
  if (typeof bookOf === 'function') {
    const cases = [
      ['[다락원 중국어 마스터 3] 미분류 레슨 / Slide7.JPG', '다락원 중국어 마스터 3'],
      ['[BTS 2 001] 제1과 / Slide3.JPG', 'BTS 2 001'],
      ['  [Mangoi Phonics A] x / y.png', 'Mangoi Phonics A'],
      ['대괄호 없는 이름.jpg', ''],          // 모르면 빈 값 — 부르는 쪽이 건드리지 않는다
      ['', ''],
      [null, ''],
      ['Slide[3].jpg', ''],                  // 앞이 아니면 교재명이 아니다
      ['[중요] 공지.pdf', ''],                // 🪤 교재가 «아닌» 파일 — 잡으면 맞게 잡힌 교재를 덮어쓴다
      ['[BTS 3] 제2과 / a/b.jpg', 'BTS 3'],   // 슬래시가 여러 개여도 된다
    ];
    let bad = [];
    for (const [input, want] of cases) {
      let got = ''; try { got = bookOf(input); } catch (e) { got = '(throw)'; }
      if (got !== want) bad.push(JSON.stringify(input) + ' → ' + JSON.stringify(got) + ' (기대 ' + JSON.stringify(want) + ')');
    }
    ok(bad.length === 0, '교재명 추출이 ' + cases.length + '가지 입력에서 전부 맞다', bad.join(' · '));
  }
}

/* 모르면 안 건드린다 — 틀린 교재명은 «엉뚱한 과의 퀴즈» 라 빈 값보다 나쁘다 */
ok(/if\s*\(\s*bk\s*&&\s*bk\s*!==\s*window\.__mangoiCurrentBookId\s*\)/.test(mfix),
   '교재명을 못 뽑았거나 그대로면 아무것도 건드리지 않는다',
   '빈 값으로 덮으면 이미 잡혀 있던 교재가 사라지고, 매번 덮으면 학생이 고른 中文·과 선택이 되돌아간다');

/* 상주 감시 금지 — 홈 전체를 멎게 한 전력(2026-07-14 · 2026-08-27) */
/* ⑬절만 정확히 잘라 낸다 — 범위를 «대충» 잡으면 옆 절의 코드가 딸려 들어와
   멀쩡한 코드가 FAIL 난다(CLAUDE.md 「검사 범위를 길이로 자르지 마세요」). */
const s13 = mfix.indexOf('⑬ 📚');
/* ⑬절의 «끝» 은 «다음 절이 시작하는 자리» 다.
   ⚠️ 파일 끝(마지막 console.log)까지로 잡으면 그 뒤에 새 절이 붙을 때마다 남의 코드가
      딸려 들어와 멀쩡한 코드가 FAIL 난다 — 2026-09-10 실제로 밟았다(⑮⑯ 칭찬 절을
      더하자 그 절 **주석**의 «setInterval» 글자에 걸렸다). */
const after13 = s13 >= 0 ? mfix.slice(s13 + 4) : '';
const nextSec = after13.search(/[⑭⑮⑯⑰⑱⑲⑳]/);
const e13 = s13 < 0 ? -1
  : nextSec >= 0 ? s13 + 4 + nextSec
  : mfix.indexOf("console.log('[mobilefix] 교재 배율");
/* 부정 검사(«이 낱말이 없어야 한다»)는 **주석을 벗겨 낸 사본**으로 판정한다 —
   「왜 안 쓰는지」 적어 둔 설명 주석이 자기 자신에게 걸린다(CLAUDE.md 2장). */
const stripCmt = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const sec13 = (s13 >= 0 && e13 > s13) ? stripCmt(mfix.slice(s13, e13)) : '';
ok(sec13 && !/setInterval|MutationObserver/.test(sec13),
   '⑬절에 상주 setInterval·MutationObserver 가 없다',
   'body class 감시가 홈 전체를 멎게 한 전력이 있다(CLAUDE.md)');

/* 감싸는 대상이 «그 이름으로» 아직 정의되는가 — 이름이 바뀌면 래퍼가 조용히 헛돈다
   (CLAUDE.md 「blocking 파일을 못 고칠 때 — 그 칸의 모양을 하니스로 못 박아야 합니다」) */
const idxMain = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
ok(/window\.vcApplySharedPdf\s*=\s*function/.test(idxMain),
   'idx-main.js 가 vcApplySharedPdf 를 그 이름으로 정의한다(래퍼가 물 대상)',
   '이름이 바뀌면 ⑬절이 typeof !== function 으로 조용히 건너뛰어 «중국어인데 영어 퀴즈» 가 되살아난다');

console.log('■ ③ 터치(휴대폰)에서도 같은 흐름을 타는가');
/* 🔴 학생 방아쇠가 «잡는 이벤트» 와, 홈으로 튕기는 옛 패치들이 «잡는 이벤트» 를 대조한다.
      학생 방아쇠에 없는 이벤트를 옛 패치가 잡으면, 그 이벤트에서 학생이 홈으로 튕겨
      평가 모달이 떴다가 navigation 으로 지워진다(2026-09-02 헤드리스 터치 실측). */
const evOf = src => new Set([...src.matchAll(/'(pointerdown|touchstart|touchend|mousedown|mouseup|click)'/g)].map(m => m[1]));
const rateBlock = html.slice(html.indexOf("트리거 A: ✕/나가기 버튼"), html.indexOf('트리거 B:'));
const studentEvents = evOf(rateBlock);
ok(studentEvents.size > 0, '학생 방아쇠가 잡는 이벤트를 읽어 왔다 (' + [...studentEvents].join(',') + ')');

const HOME_PATCHES = [['v29', 'v29-leave-capture'], ['v32', 'v32'], ['v34', 'v34-final-exit']];
let holes = [];
for (const [name, marker] of HOME_PATCHES) {
  const i = html.indexOf(marker); if (i < 0) continue;
  const blk = html.slice(i, i + 6000);
  for (const e of evOf(blk)) if (!studentEvents.has(e)) holes.push(name + ':' + e);
}
if (holes.length === 0) {
  ok(true, '옛 «홈으로 튕기기» 패치가 잡는 이벤트를 학생 방아쇠가 전부 덮는다');
} else {
  /* ⛔ FAIL 로 내지 않는다 — 고치려면 index.html(공동 금지구역)을 손대야 해서 사람이 정할 일이다.
     대신 «사람 결정 대기» 로 이름을 찍어 출력한다(popup_open_return_harness 의 방식). */
  console.log('  ⏳ 사람 결정 대기 — 학생 방아쇠가 못 덮는 이벤트: ' + [...new Set(holes)].join(' · '));
  console.log('       · 그 이벤트에서는 학생이 나가기를 눌러도 평가 모달이 뜬 직후 홈으로 튕깁니다');
  console.log('       · 고치려면 index.html 의 학생 방아쇠 배열에 그 이벤트를 더해야 합니다(공동 금지구역)');
}

console.log('────────────────────────────────');
console.log(`  ${fail === 0 ? '✅' : '❌'} PASS ${pass} · FAIL ${fail}`);
process.exit(fail === 0 ? 0 : 1);
