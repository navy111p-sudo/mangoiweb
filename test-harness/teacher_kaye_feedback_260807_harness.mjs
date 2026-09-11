/**
 * 🧑‍🏫 Kaye 강사 피드백 (2026-08-06 IT 칼 합동 테스트) 하니스 — 지적 5건 + 건의 2건
 *
 *  1. 학생이 «보드»와 교재에 그림을 그릴 수 있다      → 필기 잠금이 서버에서 통째로 버려지고 있었다 + 칠판엔 게이트가 없었다
 *  2. 교재를 넘기는 키보드 키가 또 안 먹는다           → 역할 미확정(vcMyRole)으로 게이트에 걸림
 *  3. 실수로 녹화를 껐을 때 다시 켜는 버튼             → 있음(2026-08-06). 끄는 순간 그 사실을 알려 준다
 *  4. 재연결 버튼을 눌러도 재연결이 안 된다            → 신호 회선(WebSocket)이 죽은 경우를 다루지 않았다
 *  5. 내 컴퓨터 화면 공유 버튼이 또 사라졌다           → 역할 미확정 + 독의 [화면공유]엔 진짜 기능이 없었다
 *  건의1. 학생이 말할 때 초록 표시 / 학생 기기 손보기  → 말하는 중 초록 테두리 · 무음 경고 · 원격 마이크 재획득
 *  건의2. 보다처럼 연습·데모 방                        → 번호 붙은 연습방 6개(녹화 안 함)
 *
 * ⚠️ 검사 원칙 — «글자 거리»가 아니라 «규칙»을 본다.
 *    (2026-08-07 실제로 vc_defaults 하니스가 «600자 안에» 라는 거리 조건 때문에 주석 한 줄에 깨졌다.)
 *
 * 실행: node test-harness/teacher_kaye_feedback_260807_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { readPageSource } from './page-source.mjs';   // 분해 대응: 페이지 코드 전체를 읽는다
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const SRC = process.env.MANGOI_SRC || join(ROOT, 'cloudflare-deploy', 'src');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const html = readPageSource('index.html');
const teacher = readFileSync(join(PUB, 'teacher.html'), 'utf8');
const rec = readFileSync(join(PUB, 'js', 'mango-rec.js'), 'utf8');
const doTs = readFileSync(join(SRC, 'video-call-room.ts'), 'utf8');

/** 함수 본문 잘라내기 — 시작 표시부터 다음 표시 직전까지 */
function slice(text, startMark, endMark) {
  const s = text.indexOf(startMark);
  if (s < 0) return '';
  const e = text.indexOf(endMark, s + startMark.length);
  return e < 0 ? text.slice(s) : text.slice(s, e);
}

console.log('\n════════ Kaye 강사 피드백 (2026-08-06) ════════');

/* ══════════════════════════════════════════════════════════════════
   0. 뿌리 원인 — 로비로 들어온 강사는 «학생»으로 서버에 기록됐다
   ══════════════════════════════════════════════════════════════════
   지적 1·2·5 가 동시에 난 진짜 이유. 역할 확정이 마이페이지 입장과 관리자 임베드
   두 경로에만 있어서, 로비에서 그냥 로그인해 들어온 강사는 vcMyRole 이 빈 채였다.
   → 여기서는 «실제로 코드를 실행해» 역할이 제대로 정해지는지 본다. */
console.log('\n[0] 역할 확정 — 로비 입장 강사도 강사로 인식되는가');
{
  const body = slice(html, 'async function vcJoinRoom', 'showView(\'view-videocall-call\')');
  check('vcJoinRoom 이 소켓을 열기 전에 window.vcMyRole 을 정한다',
        /window\.vcMyRole\s*=/.test(body),
        '이게 없으면 join-room 이 role:student 로 나가 강사 전용 기능이 서버에서 전부 거부된다');
  check('join-room 은 여전히 window.vcMyRole 을 실어 보낸다',
        /type:\s*'join-room'[\s\S]{0,160}window\.vcMyRole/.test(html));

  /* 역할 판정 블록만 떼어내 진짜로 돌려 본다
     🪤 (2026-08-08) 예전엔 여기서 «if (window.vcMyRole !== 'teacher' …)» 라는 **구현 모양**을
        글자로 찾았다. 그런데 그 조건문 자체가 버그였다 — 한 번 강사였던 창은 계정이 바뀌어도
        영영 강사로 남았다(Teacher Ana ① 「먼저 들어온 학생이 강사가 된다」).
        고치자 이 하네스가 깨졌다. 검사를 «그 글자» 가 아니라 «규칙» 으로 다시 쓴다. */
  const blk = slice(html, 'if (!window.__vcRoleFromUrl) {', '\n    } catch (_) {}');
  check('역할 판정 블록을 찾았다', blk.length > 100);
  if (blk.length > 100) {
    const run = (accountRole, name, stored) => {
      let storedRole = stored || '';
      const sandbox = { console: { warn(){}, log(){} } };
      sandbox.window = sandbox;
      sandbox.localStorage = { _d: {}, getItem(k){ return k in this._d ? this._d[k] : null; }, setItem(k, v){ this._d[k] = String(v); } };
      sandbox.getCurrentUser = () => (accountRole ? { role: accountRole } : null);
      sandbox.MangoV3 = null;
      sandbox.vcUsername = name || '';
      sandbox.vcIsTeacherRole = function () { return /교사|강사|선생님|teacher|tutor/i.test(String(sandbox.vcUsername)); };
      /* 🔴 (2026-08-08) 새 헬퍼의 스텁이 없으면 TypeError 가 바깥 try 에 먹혀,
         «아무 일도 안 했는데» 판정이 undefined 로 나온다 — 헛통과/헛실패의 전형.
         (vc_teacher_blackout 하네스에서 실제로 한 번 속았던 것과 같은 함정) */
      sandbox.vcRoleStored = () => storedRole;
      sandbox.vcRoleRemember = (r) => { storedRole = r; };
      vm.createContext(sandbox);
      vm.runInContext('try {\n' + blk + '\n} catch (_) {}', sandbox, { timeout: 2000 });
      return sandbox.window.vcMyRole;
    };
    check('마이페이지 표기 teacher → 강사', run('teacher', 'Kaye') === 'teacher');
    check('홈 통합로그인 표기 hq_teacher → 강사 (정확일치로 보면 학생이 된다)',
          run('hq_teacher', 'Kaye') === 'teacher', '실제 값 = ' + run('hq_teacher', 'Kaye'));
    check('admin → 관리자', run('admin', '본사') === 'admin');
    check('학생 계정은 학생 그대로', run('student', 'mangoi_162') === 'student');
    check('로그인이 아예 없을 때만 이름 휴리스틱 (Teacher Kaye → 강사)',
          run('', 'Teacher Kaye') === 'teacher');
    check('로그인한 학생은 이름이 뭐든 강사가 되지 않는다',
          run('student', 'Teacher Kaye') === 'student',
          '여기가 뚫리면 학생이 화살표로 반 전체 교재를 넘길 수 있다');

    /* 🎭 (2026-08-08 Teacher Ana ①) 「강사보다 먼저 들어온 학생이 자동으로 강사가 된다」
       공용 PC 에 남아 있던 남의 역할을 그대로 물려받던 경로. 실제 차단은 vcRoleStored 가
       주인(uid)을 확인해 남의 것이면 '' 를 주는 것 — 여기서는 두 방향을 다 본다. */
    check('계정이 학생이면 저장된 teacher 가 있어도 학생이다 (내림은 언제나 허용)',
          run('student', 'mangoi_162', 'teacher') === 'student',
          '여기가 뚫리면 학생이 서버 로스터에 «강사» 로 기록된다');
    check('저장값이 걸러져 비면(주인 불일치) 학생으로 시작한다',
          run('', 'mangoi_162', '') === 'student',
          '모르면 낮은 쪽 — 올려서 틀리면 반 전체 교재가 넘어간다');
    check('주인이 맞는 저장값은 그대로 쓴다 (계정 역할을 못 읽는 경로 보호)',
          run('', 'Kaye', 'teacher') === 'teacher',
          '이게 깨지면 마이페이지로 들어온 강사가 다시 학생이 된다');
  }

  check('입장 직후 강사 전용 칩을 다시 그린다',
        /vcClassLockChipsRender/.test(slice(html, 'async function vcJoinRoom', 'function vcEnsureIceServers')) ||
        /_chipTick\(\);/.test(html));
  check('강사 판정 정본(vcIsStaffNow)이 있다', /window\.vcIsStaffNow\s*=\s*function/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   1. 학생 필기 잠금 — 서버가 릴레이하지 않으면 «버튼만 색이 바뀌는» 기능이다
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[1] 학생이 보드·교재에 그리는 것을 막을 수 있는가');
{
  check('클라이언트가 pdf-drawlock 을 보낸다', /type:\s*'pdf-drawlock'/.test(html));
  check('서버(DO)가 pdf-drawlock 을 받는다 — 이게 없으면 통째로 버려진다',
        /case 'pdf-drawlock'/.test(doTs),
        "switch 에 없으면 default 의 'Unknown message type' 으로 사라진다");
  check('잠금 3종과 같은 길(LOCK_KEYS)에 태웠다 = 강사 검증·저장·늦은 입장 재전송',
        /'pdf-drawlock':\s*'drawLock'/.test(doTs));
  check('빈 방이 되면 필기 잠금도 자동 해제', /clearAllLocks[\s\S]{0,220}drawLock/.test(doTs));
  check('서버가 { locked, on } 을 함께 보낸다 — 이름이 어긋나면 조용히 항상 해제된다',
        /data:\s*\{\s*locked,\s*on:\s*locked\s*\}/.test(doTs));
  check('클라이언트도 두 이름을 모두 받는다',
        /__pdfStudentDrawLock\s*=\s*!!\(msg\.data\s*&&\s*\(msg\.data\.on\s*\|\|\s*msg\.data\.locked\)\)/.test(html));

  /* 칠판(wb-canvas) 게이트 — 교재에만 있고 칠판엔 «아예 없었다» */
  const wbDown = slice(html, "canvas.addEventListener('mousedown', e => {", 'wbFitCanvas();');
  check('칠판에도 학생 필기 게이트가 있다', /__pdfStudentDrawLock/.test(wbDown),
        'Kaye 지적은 「board and book」 둘 다였다');
  check('칠판 게이트는 강사를 막지 않는다', /vcIsStaffNow/.test(wbDown));
  check('교재(pdf-anno) 게이트도 같은 정본을 쓴다',
        /__pdfStudentDrawLock && !\(typeof vcIsStaffNow/.test(html));
  check('순단 중 눌린 잠금은 재연결 때 다시 보낸다(큐)', /'pdf-drawlock':1/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   2. 교재 페이지 넘기기 (키보드·휠)
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[2] 키보드·휠로 교재가 넘어가는가');
{
  const keyBlk = slice(html, "if (e.key !== 'ArrowLeft'", 'pdfNextPage();');
  check('화살표 게이트가 정본 판정을 쓴다', /vcIsStaffNow/.test(keyBlk),
        'vcMyRole 정확일치만 보면 로비 입장 강사에게 키가 안 먹는다');
  check('학생은 여전히 막힌다(교재는 반 전체에 방송된다)',
        /vcIsStaffNow\(\)[\s\S]{0,140}return;/.test(keyBlk));
  const wheelBlk = slice(html, "_pw.addEventListener('wheel'", 'pdfPrevPage();');
  check('휠 게이트도 같은 정본을 쓴다 — 한쪽만 고치면 어긋난다', /vcIsStaffNow/.test(wheelBlk));
}

/* ══════════════════════════════════════════════════════════════════
   3. 녹화를 실수로 껐을 때 다시 켜기
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[3] 녹화를 껐다가 다시 켤 수 있는가');
{
  check('꺼져도 배지를 지우지 않는다(그 자리가 다시 켜는 버튼)', /mango-rec-off/.test(rec));
  check('꺼진 배지를 누르면 다시 시작한다', /if \(!isRecording\)[\s\S]{0,400}startRecording\(\{ auto: true \}\)/.test(rec));
  check('꺼짐 상태는 모바일에서도 점으로 줄지 않는다(점이면 아무도 못 찾는다)',
        /mango-rec-off\{width:auto/.test(rec));
  check('중지 안내가 «다시 켜는 법»을 한/영으로 알려 준다',
        /녹화가 종료되었습니다[\s\S]{0,200}눌러서 시작/.test(rec) && /To record again/.test(rec),
        '버튼이 있어도 있는 줄 모르면 없는 것과 같다');
}

/* ══════════════════════════════════════════════════════════════════
   4. 재연결 버튼
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[4] 재연결 버튼이 실제로 재연결하는가');
{
  const body = slice(html, 'async function vcManualReconnect', '\nfunction vcReconnectPeer');
  const iWs = body.indexOf('reconnectNow');
  const iVid = body.indexOf('vcHealLocalVideo()');
  const iPeer = body.indexOf('vcReconnectPeer(id)');
  check('신호 회선(WebSocket)이 죽었으면 그것부터 살린다', iWs > 0,
        '회선이 끊긴 상태에서는 상대 목록 자체가 비어 «성공적으로 아무 일도 안 일어난다»');
  check('회선 → 내 장치 → 상대 순서', iWs > 0 && iVid > iWs && iPeer > iVid);
  check('진행 상황을 한/영으로 알린다',
        /Reconnecting…/.test(body) && /다시 연결하는 중/.test(body));
  check('결과도 알린다 — 눌렀는데 어떻게 됐는지 말해 준다',
        /Reconnected \(/.test(body) && /다시 연결됐어요/.test(body));
  check('상대가 아직 없을 때는 «기다리는 중»이라고 정확히 말한다',
        /Waiting for the other person/.test(body) && /상대가 들어오기를 기다리는 중/.test(body));
  check('새로고침이 아니다(수업에서 나가지면 안 된다)', !/location\.reload/.test(body));
}

/* ══════════════════════════════════════════════════════════════════
   5. 내 컴퓨터 화면 공유
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[5] 화면 공유 버튼을 찾을 수 있고 눌리는가');
{
  check('실제 화면 공유 함수가 있다(getDisplayMedia)', /getDisplayMedia/.test(html));
  const share = slice(html, 'window.vcShareMyScreen = async function', 'window.vcStopMyScreen');
  check('실행 게이트가 노출 게이트와 같은 정본을 쓴다', /vcIsStaffNow/.test(share),
        '예전엔 «버튼은 보이는데 누르면 거절»이었다');
  const folder = slice(html, "screen: {", 'vcFolderOpen');
  check('하단 독 [화면공유] 시트에 진짜 화면 공유가 들어 있다', /vcShareMyScreen\(\)/.test(folder),
        '독 버튼 이름이 «화면공유»인데 안에는 화면 «분할»뿐이었다 — 강사 눈엔 사라진 것이 맞다');
  check('시트 제목도 두 기능을 다 말한다', /화면 공유 · 화면 분할/.test(html));
  check('상단 칩도 그대로 있다', /id="vc-screenshare-btn"/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   건의1. 학생 소리 — 초록 표시 · 무음 경고 · 원격으로 마이크 다시 잡기
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[건의1] 문제가 학생 쪽인지 우리 쪽인지 구분되는가');
{
  check('말하는 동안 타일 테두리가 초록', /\.video-box\.vc-talking/.test(html));
  const loop = slice(html, 'analyser.getByteFrequencyData(data)', 'requestAnimationFrame(loop)');
  check('상태가 바뀔 때만 DOM 을 건드린다(매 프레임 쓰기 금지 — 수업 부하)',
        /talking !== mon\.talking/.test(loop) && /dead !== mon\.dead/.test(loop));
  check('마이크는 켜져 있는데 무음이면 경고', /vcMarkNoSound/.test(loop));
  check('음소거(의도된 무음)는 경고하지 않는다', /if \(muted \|\| talking\) mon\.soundAt/.test(loop));
  /* 🔁 (2026-09-11 사장님 지시) 옛 단정은 「학생·관찰자에게도 «🔇 소리가 안 들어와요» 를 한/영으로
     띄운다」였다. 그런데 이 판정은 «상대가 8초 동안 조용하다» 이므로 학생이 문제를 푸는 동안
     강사 타일에, 강사가 듣는 동안 학생 타일에 그대로 떴다 — «듣고 있는 중» 이 «고장» 으로 읽혔다
     (사장님 화면 제보). 그래서 안내 판은 끄고 «강사가 눌러서 고치는» 배지만 남긴다.
     ⛔ 학생·관찰자 판을 되살리지 말 것. 검사는 글자가 아니라 함수를 실제로 돌려서 본다. */
  {
    const fn = slice(html, 'function vcMarkNoSound(box, on) {', '\n}\n');
    check('vcMarkNoSound 를 잘라 냈다(전제 — 못 자르면 아래가 조용히 통과한다)', fn.length > 200);
    /* 가짜 DOM 으로 실제 실행 — «누구에게 무엇이 그려지는가» 는 글자로 볼 수 없다 */
    const run = (staff, boxId, lang) => {
      let added = null, fixedUid = null;
      const box = { id: boxId, style: {}, querySelector: () => null, appendChild: (el) => { added = el; } };
      const sandbox = {
        console: { warn(){}, log(){} },
        getComputedStyle: () => ({ position: 'relative' }),
        getLang: () => lang,
        vcIsStaffNow: () => staff,
        vcRequestMicFix: (u) => { fixedUid = u; },
        /* 🪤 리스너를 «빈 함수» 로 두면 「누를 수 있는 버튼이다」가 배선이 끊겨도 통과한다
           (함정 대조 실측 — addEventListener 줄을 통째로 지워도 68/0 초록이었다).
           그래서 «달아 둔 핸들러를 실제로 눌러» 본다. */
        document: { createElement: (tag) => ({ tag, className: '', textContent: '', title: '', type: '',
          __on: {}, addEventListener(ev, f) { this.__on[ev] = f; } }) },
        __box: box,
      };
      sandbox.window = sandbox;
      vm.createContext(sandbox);
      try { vm.runInContext(fn + '\n}\nvcMarkNoSound(__box, true);', sandbox, { timeout: 2000 }); }
      catch (e) { return { err: String(e && e.message || e) }; }
      if (added && added.__on && added.__on.click) {
        try { added.__on.click({ stopPropagation() {} }); } catch (_) {}
      }
      return added ? Object.assign(added, { fixedUid }) : null;
    };
    const stu   = run(false, 'vc-video-u1', 'ko');
    const tea   = run(true,  'vc-video-u1', 'ko');
    const teaEn = run(true,  'vc-video-u1', 'en');
    const noUid = run(true,  '',            'ko');
    /* ⚠️ 경계는 «학생/관찰자» 가 아니라 «staff 판정»(vcIsStaffNow) 이다 —
       vcJoinAsObserver 는 window.vcMyRole 을 안 정하므로 관찰자도 저장된 역할·관리자 세션에
       따라 staff 로 잡힐 수 있다. 단정하지 말고 잰 것만 적는다. */
    check('staff 가 아닌 화면에는 무음 배지를 안 띄운다', stu === null,
          '8초 침묵마다 «소리가 안 들어와요» 가 떠서 정상 수업이 고장으로 보였다');
    check('그래도 강사에게는 뜬다(짝 — 이게 없으면 «전부 끄기» 도 통과한다)',
          !!tea && /눌러서 고치기/.test(tea.textContent || ''));
    check('강사 배지 문구는 한/영 두 벌', !!teaEn && /Tap to fix/.test(teaEn.textContent || ''));
    check('강사 배지는 누를 수 있는 버튼이다', !!tea && tea.tag === 'button' && tea.type === 'button');
    check('눌러 보면 그 학생의 마이크를 다시 잡는다(배선 — 핸들러를 실제로 실행)',
          !!tea && tea.fixedUid === 'u1',
          '배지가 그려지고 눌려도 핸들러가 없으면 «보이는데 아무 일도 안 하는» 버튼이 된다');
    check('uid 를 못 구하면 아무에게도 안 띄운다(누구 마이크인지 모르는 채 «고치기» 를 주지 않는다)',
          noUid === null);
    /* 부정 검사는 주석을 벗겨 낸 사본으로 — 「왜 지웠는지」 적은 주석이 자기를 잡는다 */
    const bare = fn.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    check('학생용 문구가 코드에 남아 있지 않다',
          !/소리가 안 들어와요/.test(bare) && !/No sound coming in/.test(bare));
  }
  check('강사는 그 배지를 눌러 학생 마이크를 다시 잡게 할 수 있다',
        /vcRequestMicFix/.test(html) && /type:\s*'device-fix'/.test(html));
  check('서버가 device-fix / device-report 를 릴레이한다',
        /case 'device-fix'/.test(doTs) && /case 'device-report'/.test(doTs));
  check('device-fix 는 강사만 보낼 수 있다(서버 검증)',
        /case 'device-fix':[\s\S]{0,400}dfRole !== 'teacher' && dfRole !== 'admin'/.test(doTs),
        '아무나 보낼 수 있으면 학생이 다른 학생 마이크를 원격으로 건드린다');
  check('학생이 스스로 끈 마이크는 원격으로 켜지 않는다',
        /selfMuted = \(window\.vcMicOn === false\)/.test(html) && /!selfMuted/.test(html),
        '고장과 «본인이 끈 것»은 다른 일이다');
  check('«본인이 껐다»는 사실을 강사에게 그대로 알린다',
        /turned their microphone off themselves/.test(html) && /스스로 마이크를 껐어요/.test(html));
  check('학생 쪽은 나에게 온 요청만 처리한다', /msg\.data\.targetUserId !== vcUserId/.test(html));
  check('전체 음소거 중이면 무시한다(강사가 의도한 무음을 되돌리지 않는다)',
        /device-fix[\s\S]{0,600}__vcMicLockedByTeacher/.test(html));
  check('결과 보고도 한/영', /mic picked up again/.test(html) && /마이크를 다시 잡았어요/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   건의2. 연습·데모 방
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[건의2] 연습·데모 방이 있는가');
{
  check('강사 오늘 화면에 연습방 입구가 있다', /id="c-practice"/.test(teacher));
  check('번호별로 방이 갈린다(공용방 하나로 몰리지 않는다)', /vc_room=demo-' \+ no/.test(teacher));
  check('«학생 역할»로도 들어갈 수 있다(신입 교육)', /joinPractice\(document\.getElementById\('practice-as-student-no'\)\.value, 'student'\)/.test(teacher));
  check('학생 역할일 때는 이름에 «교사» 접두사를 붙이지 않는다',
        /role === 'teacher'\) \? \('교사 ' \+ me\)/.test(teacher),
        '접두사가 붙으면 이름 휴리스틱이 강사로 판정해 학생 역할 연습이 되지 않는다');
  check('안내가 한/영', /Practice \/ demo rooms/.test(teacher) && /연습 · 데모 방/.test(teacher));
  check('로비에도 입구가 있다(강사 전용)', /id="vc-practice-wrap"/.test(html) && /vcSyncPracticeEntry/.test(html));
  check('연습방은 자동녹화하지 않는다(R2 낭비·녹화 목록 오염 방지)',
        /_isDemoRoom/.test(rec) && /\^demo-\\d\+\$/.test(rec));
}

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) {
  console.log('\n  실패 목록:');
  failures.forEach(f => console.log('   - ' + f));
}
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
