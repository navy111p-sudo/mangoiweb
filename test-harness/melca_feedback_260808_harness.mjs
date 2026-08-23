/**
 * 🧑‍🏫 Melca 테스트 강사 피드백 (2026-08-08) 하니스 — 7건
 *
 *  HT Ness ①  하단 아이콘을 없앨 수 없다 · 그 아래 작은 아이콘을 못 누른다  → 접기 손잡이에 글자 + 「작게·위로」
 *  HT Ness ②  화면이 깜빡여 버튼을 누르기 어렵다 (Belle ② 동일)            → 수업 중 홈 폴러 정지 + 칠판 지워짐 제거
 *  HT Ness ③  카메라가 갑자기 꺼진다 · 영상이 멈춘다                        → 가상배경 백그라운드 얼어붙음 · AAO 안내 한/영
 *  Ana    ①  먼저 들어온 학생이 강사 역할을 받는다                          → 저장된 역할에 주인(uid) · 이름 휴리스틱 차단
 *  Ana    ②  교재 업로드가 장수에 비례해 오래 걸린다                        → 순차 업로드 → 3장 동시
 *  Ana    ③  학생 펜이 강사 화면에 안 보인다 (Kes ① 동일)                   → 칠판 획 기록 + 리사이즈 재그리기 + 늦은 입장 재전송
 *  Belle  ①  수업 열기·페이지 전환 로딩 지연                                → pdf.js 조각 받기 + 라이브러리 교재 Range + 다음 장 미리 받기
 *
 * ⚠️ 검사 원칙 — «글자» 가 아니라 «규칙». 그리고 가능한 것은 **떼어내서 실제로 실행**한다.
 *    (구현 모양을 글자로 박으면 옳은 리팩터링이 하네스를 깬다 — 2026-08-07·08 두 번 겪음)
 *
 * 실행: node test-harness/melca_feedback_260808_harness.mjs
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

// 🪤 (2026-08-08) 읽을 때 줄바꿈을 LF 로 통일한다.
//   git 에는 LF 로 들어 있지만 Windows 의 autocrlf 가 체크아웃 때 CRLF 로 바꾼다.
//   그러면 아래 slice() 의 «여러 줄짜리 표시자» 가 안 맞아 함수 끝을 못 찾고,
//   파일 끝까지 훑게 되어 **멀쩡한 코드가 실패로** 잡힌다(브랜치 전환 뒤 재현).
const html   = readPageSource('index.html');
const dock   = readFileSync(join(PUB, 'js', 'vc-dock.js'), 'utf8');
const spot   = readFileSync(join(PUB, 'js', 'vc-spotlight.js'), 'utf8');
const doTs   = readFileSync(join(SRC, 'video-call-room.ts'), 'utf8');
const idxTs  = readFileSync(join(SRC, 'index.ts'), 'utf8');

function slice(text, startMark, endMark) {
  const s = text.indexOf(startMark);
  if (s < 0) return '';
  const e = text.indexOf(endMark, s + startMark.length);
  return e < 0 ? text.slice(s) : text.slice(s, e);
}

/* 🪤 (2026-08-23) «끝 표시자» 로 함수 끝을 찾는 방식은 코드가 «옮겨지면» 깨진다.
   idx-main.js 를 홈/수업으로 가르면서 window.vcRoleStored 와 그 «다음 줄» 이 서로
   다른 파일로 갈렸고, 그러자 slice() 가 파일 끝까지 훑어 VM 에서 통째로 터졌다.
   (같은 성격의 경고가 이 파일 위쪽 CRLF 주석에 이미 있다 — 이번엔 원인이 «분해» 였다.)
   중괄호를 세어 함수 끝을 찾으면 코드가 어디로 옮겨가든 맞는다. */
function sliceFn(text, startMark) {
  const s = text.indexOf(startMark);
  if (s < 0) return '';
  let d = 0, started = false;
  for (let i = s; i < text.length; i++) {
    const c = text[i];
    if (c === '{') { d++; started = true; }
    else if (c === '}') { d--; if (started && d === 0) return text.slice(s, i + 1) + ';'; }
  }
  return '';
}

console.log('\n════════ Melca 강사 피드백 (2026-08-08) ════════');

/* ══════════════════════════════════════════════════════════════════
   [1] Ana③ · Kes① — 학생 펜이 강사 화면에 안 보인다
   ══════════════════════════════════════════════════════════════════
   글자 검사로는 절대 못 잡는 종류다(«캔버스에 width 를 대입하면 지워진다» 는 규격이
   원인이었다). 그래서 칠판 기록·재그리기 코드를 **떼어내 가짜 캔버스 위에서 실행**한다. */
console.log('\n[1] 칠판 — 학생 획이 지워지지 않고 강사 화면에 남는가');
{
  const wb = slice(html, 'window.wbOps = window.wbOps || [];', '\nfunction wbInit()');
  check('칠판 획 기록·재그리기 블록을 찾았다', wb.length > 500);

  if (wb.length > 500) {
    /* 가짜 캔버스 — width 를 «대입하면» 지워지는 실제 규격을 그대로 흉내 낸다.
       이 흉내가 없으면 «지워지는 버그» 자체를 재현할 수 없어 하네스가 헛통과한다. */
    function makeEnv(wrapW, wrapH) {
      const painted = [];
      const ctx = {
        _w: 0, _h: 0,
        clearRect(){ painted.length = 0; },
        beginPath(){}, moveTo(){}, lineTo(){}, rect(){}, ellipse(){}, save(){}, restore(){},
        stroke(){ painted.push(['stroke', this.strokeStyle, this.lineWidth]); },
        fillText(t, x, y){ painted.push(['text', t, Math.round(x), Math.round(y)]); },
      };
      const canvas = {
        _w: 300, _h: 150,
        get width(){ return this._w; },
        set width(v){ this._w = v; painted.length = 0; },     // ← 규격: 대입하면 비트맵이 리셋된다
        get height(){ return this._h; },
        set height(v){ this._h = v; painted.length = 0; },
        getContext(){ return ctx; },
        parentElement: { clientWidth: wrapW, clientHeight: wrapH },
      };
      const sandbox = {
        console: { warn(){}, log(){} },
        document: { getElementById: (id) => (id === 'wb-canvas' ? canvas : null) },
        wbRenderShape(){ painted.push(['shape']); },
      };
      sandbox.window = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(wb, sandbox, { timeout: 3000 });
      return { sandbox, canvas, painted };
    }

    // ① 칠판 탭이 숨어 있는 동안(0×0) resize 가 와도 판서를 지우지 않는다
    {
      const { sandbox, canvas, painted } = makeEnv(0, 0);
      canvas._w = 900; canvas._h = 600;
      painted.push(['stroke', '#000', 3]);      // 이미 그려져 있는 학생 획
      sandbox.wbResize();
      check('칠판 탭이 숨어 있으면(0×0) resize 가 캔버스를 건드리지 않는다',
            canvas.width === 900 && painted.length === 1,
            '여기가 뚫리면 강사가 교재 탭에 있는 동안 학생 판서가 통째로 사라진다');
    }

    // ② 크기가 그대로면 손대지 않는다 (같은 값 대입도 캔버스를 지운다)
    {
      const { sandbox, canvas, painted } = makeEnv(900, 600);
      canvas._w = 900; canvas._h = 600;
      painted.push(['stroke', '#000', 3]);
      sandbox.wbResize();
      check('크기가 같으면 canvas.width 를 다시 대입하지 않는다',
            painted.length === 1,
            '같은 값이라도 대입하면 지워진다 — 전체화면 진입/해제 때마다 판서가 백지가 됐다');
    }

    // ③ 크기가 바뀌면 기록으로 «다시 그린다» (예전엔 putImageData 라 확대가 안 됐다)
    {
      const { sandbox, canvas, painted } = makeEnv(900, 600);
      canvas._w = 300; canvas._h = 150;
      sandbox.wbRecord({ k: 'seg', d: { tool: 'pen', fromX: 0.1, fromY: 0.1, toX: 0.9, toY: 0.9, color: '#2563eb', size: 3 } });
      sandbox.wbRecord({ k: 'text', d: { text: 'hello', x: 0.5, y: 0.5, color: '#000', fontSize: 20, rel: 0.05 } });
      sandbox.wbResize();
      check('크기가 바뀌면 새 크기로 전부 다시 그린다',
            canvas.width === 900 && canvas.height === 600 && painted.length === 2,
            '실제 그려진 것 = ' + JSON.stringify(painted));
      const txt = painted.find(p => p[0] === 'text');
      check('좌표는 «비율» 이라 커진 캔버스에서도 같은 자리에 온다',
            !!txt && txt[2] === 450 && txt[3] === 300,
            '글자 위치 = ' + JSON.stringify(txt));
    }

    // ④ 상한을 넘으면 오래된 것부터 버린다(메모리 폭주 방지) — 백지보다는 낫다
    {
      const { sandbox } = makeEnv(900, 600);
      for (let i = 0; i < 40050; i++) sandbox.wbRecord({ k: 'seg', d: { tool: 'pen', fromX: 0, fromY: 0, toX: 1, toY: 1, color: '#000', size: 1 } });
      check('기록 상한이 있다 (무한히 쌓이지 않는다)', sandbox.window.wbOps.length <= 40000,
            '길이 = ' + sandbox.window.wbOps.length);
    }
  }

  /* 수신 쪽 규칙 — 화면이 아직 0×0 이어도 «기록은 반드시» 남아야 한다.
     안 그러면 강사가 칠판 탭을 여는 순간 이전 획이 통째로 없다. */
  const rcv = slice(html, 'function wbReceiveDraw(data) {', '\nfunction wbReceiveClear');
  check('원격 획은 캔버스가 없어도 먼저 기록한다',
        rcv.indexOf('wbRecord(') >= 0 && rcv.indexOf('wbRecord(') < rcv.indexOf('canvas.width'),
        '기록보다 캔버스 검사가 먼저면 숨은 탭에서 받은 획이 사라진다');

  check('전체 지우기는 기록도 함께 비운다',
        /function wbReceiveClear\(\)[\s\S]{0,200}wbClearOps\(\)/.test(html));

  /* 늦게 들어온 사람(=신고 상황: 강사가 학생보다 늦게 입장)에게 지금까지의 칠판을 돌려준다 */
  check('서버가 칠판 획을 모아 둔다', /recordWb\s*\(/.test(doTs) && /wbOps/.test(doTs));
  check('서버가 새 입장자에게 칠판을 재전송한다 (교재 pdf-sync 와 같은 자리)',
        /whiteboard-replay/.test(doTs));
  check('전체 지우기·지난 수업이면 서버 기록도 비운다',
        /handleWhiteboardClear[\s\S]{0,200}this\.wbOps\s*=\s*\[\]/.test(doTs) &&
        /this\.wbOps\s*=\s*\[\][\s\S]{0,200}storage\.delete\('pdfState'\)/.test(doTs));
  check('클라이언트가 whiteboard-replay 를 받아 다시 그린다',
        /case 'whiteboard-replay'/.test(html) && /wbRedrawAll\(\)/.test(html));
  check('서버 기록에 상한이 있다 (DO 메모리 폭주 방지)', /WB_OPS_MAX/.test(doTs));
}

/* ══════════════════════════════════════════════════════════════════
   [2] Ana① — 먼저 들어온 학생이 강사 역할을 받는다
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[2] 역할 — 남의 «강사» 를 물려받지 않는가');
{
  check('저장된 역할에 주인(uid)을 함께 적는다', /mangoi_user_role_uid/.test(html));
  check('주인이 다르면 저장값을 버린다 (vcRoleStored)',
        /window\.vcRoleStored\s*=\s*function/.test(html) &&
        /uid && owner !== uid/.test(html));

  /* vcRoleStored 를 떼어내 실제로 돌려 본다 — «주인 확인» 이 진짜로 동작하는지 */
  const fn = sliceFn(html, 'window.vcRoleStored = function(){');
  check('vcRoleStored 를 찾았다', fn.length > 100);
  if (fn.length > 100) {
    const run = (storedRole, ownerUid, loginUid) => {
      const sandbox = { console: { warn(){}, log(){} } };
      sandbox.window = sandbox;
      const d = {};
      if (storedRole) d['mangoi_user_role'] = storedRole;
      if (ownerUid) d['mangoi_user_role_uid'] = ownerUid;
      sandbox.localStorage = { getItem: (k) => (k in d ? d[k] : null), setItem(k, v){ d[k] = String(v); }, removeItem(k){ delete d[k]; } };
      sandbox.getCurrentUser = () => (loginUid ? { uid: loginUid } : null);
      vm.createContext(sandbox);
      vm.runInContext(fn, sandbox, { timeout: 2000 });
      return sandbox.window.vcRoleStored();
    };
    check('내 것이면 돌려준다', run('teacher', 'kaye', 'kaye') === 'teacher');
    check('🔴 남이 남긴 강사 역할은 돌려주지 않는다 (공용 PC — 신고의 직접 원인)',
          run('teacher', 'kaye', 'mangoi_162') === '',
          '여기가 뚫리면 다음에 들어온 학생이 서버 로스터에 «강사» 로 기록된다');
    check('주인이 안 적힌 옛 값도 로그인 중이면 쓰지 않는다',
          run('teacher', '', 'mangoi_162') === '',
          '주인을 안 적던 시절의 값이 그대로 남아 있다 — 그것이 이번 신고다');
    check('로그인이 아예 없으면 예전처럼 쓴다 (자동입장 경로 보호)',
          run('teacher', '', '') === 'teacher');
  }

  check('스포트라이트가 이미 정해진 역할을 덮어쓰지 않는다',
        /if \(!window\.vcMyRole\) window\.vcMyRole = myRole\(\)/.test(spot),
        '이 파일이 페이지 로드 즉시 vcMyRole 을 낡은 값으로 덮어쓰던 것이 출발점이었다');
  check('스포트라이트도 주인 확인을 거친 값만 쓴다', /vcRoleStored/.test(spot));
  check('URL 로 명시된 역할(관리자 임베드)은 재판정이 뒤집지 않는다',
        /__vcRoleFromUrl/.test(html));
  check('학생 펜 색(pdfMyIdentity)도 주인 확인을 거친다',
        /function pdfMyIdentity\(\)[\s\S]{0,400}vcRoleStored/.test(html),
        '낡은 teacher 를 집으면 학생 펜이 강사와 같은 빨강이 된다');

  /* 🎭 마지막 방어선 — 브라우저 기억이 아니라 «예약» 이 말하는 역할.
     verify-room 은 이미 학생/교사를 알아내고 있었는데 그 답을 버리고 있었다. */
  const mango = readFileSync(join(SRC, 'api-mango.ts'), 'utf8');
  check('서버가 예약에서 «학생/교사» 를 판정해 resolved_role 로 돌려준다',
        /resolved_role:\s*resolvedRole/.test(mango) && /resolvedRole:\s*'student'\s*\|\s*'teacher'\s*\|\s*null/.test(mango));
  check('학생 uid·이름으로 붙으면 student 로 확정한다',
        /String\(row\.user_id\) === userId\) \{ ok = true; resolvedRole = 'student'; \}/.test(mango));
  check('🔴 교사 «이름 부분일치» 는 강사 근거로 쓰지 않는다 (짧은 이름이 우연히 걸린다)',
        !/hit\(t, n\)\) \{ ok = true; resolvedRole = 'teacher'/.test(mango),
        '여기서 올리면 지금 고치는 사고가 반대 방향으로 다시 난다');
  check('클라이언트는 서버 판정으로 역할을 «내리기만» 한다',
        /_vres\.resolved_role === 'student'[\s\S]{0,300}window\.vcMyRole = 'student'/.test(html));
  check('🔴 서버 판정으로 «올리지» 않는다',
        !/resolved_role === 'teacher'[\s\S]{0,200}vcMyRole = 'teacher'/.test(html));
  check('역할만 바로잡고 입장은 막지 않는다 (게이트 1원칙 유지)',
        !/resolved_role === 'student'[\s\S]{0,400}return;/.test(html),
        '수업을 막으면 원래 신고보다 큰 사고가 된다');
}

/* ══════════════════════════════════════════════════════════════════
   [3] Ness① — 하단 독을 없앨 수 없다 / 아래 아이콘을 못 누른다
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[3] 하단 독 — 접기·줄이기·위로 가 «눈에 보이는가»');
{
  check('접기 손잡이에 글자가 있다 (회색 막대만으로는 있는 줄 모른다)',
        /vdh-txt/.test(dock) && /메뉴 펴기|메뉴 숨기기/.test(dock));
  check('손잡이 글자는 한/영 둘 다 (강사 다수 필리핀)',
        /Show menu/.test(dock) && /Hide menu/.test(dock));
  check('「작게」가 실제로 독을 줄인다 (라벨 숨김 + 버튼 축소)',
        /vc-dock-small[\s\S]{0,300}\.lbl\{display:none/.test(dock));
  check('「위로」가 독을 화면 위로 올린다',
        /vc-dock-top #vc-dock\{top:[^}]*bottom:auto/.test(dock));
  check('위로 올릴 때 bottom 을 !important 로 덮는다 (모바일 규칙이 더 강해 안 그러면 양쪽에 걸린다)',
        /vc-dock-top #vc-dock\{top:var\(--vcdock-top[^}]*\) !important;bottom:auto !important/.test(dock));
  /* 🔴 (브라우저 실측에서만 잡힌 것) top 을 64px 로 박았더니 상단 툴바와 1px 겹치고
     바로 아래 [화면 크기] 바(1/4·1/2·3/4·Full)를 통째로 덮었다 — 아래를 비우려다 위를 가리면
     같은 신고가 방향만 바꿔 돌아온다. 고정값이 아니라 «재서» 정해야 한다. */
  check('🔴 「위로」 자리는 고정값이 아니라 상단 바들을 재서 정한다',
        /function syncTopOffset\(\)/.test(dock) && /--vcdock-top/.test(dock),
        '툴바·화면크기바 높이는 가로/세로·접힘에 따라 달라진다');
  check('상단 후보에 [화면 크기] 바가 들어 있다 (이걸 빼면 그 바를 덮는다)',
        /'\.video-size-bar'/.test(dock));
  check('리사이즈에서도 「위로」 자리를 다시 잰다', /resize'[\s\S]{0,160}syncTopOffset\(\)/.test(dock));
  check('위 모드에서는 독을 아이콘만으로 줄인다 (상단은 원래 바가 겹겹이다)',
        /vc-dock-top #vc-dock button \.lbl\{display:none/.test(dock));
  check('선택(기본·작게·위로)을 기억한다', /mangoi_vc_dock_size/.test(dock));
  check('🔴 위로 올리면 «접힘» 을 반드시 푼다 (안 그러면 독이 어디에도 없고 되돌릴 길이 사라진다)',
        /if \(v === 'top'\) b\.classList\.remove\('vc-dock-collapsed'\)/.test(dock));
  /* 🔴 (실측) 되돌릴 버튼을 오른쪽 끝에 두었더니 그 버튼이 [화면 크기] 바를 덮었다.
     → 독 바로 오른쪽에 붙인다. 되돌릴 길은 반드시 화면에 남아 있어야 한다. */
  check('위로 올린 상태에서도 되돌릴 버튼이 화면에 남는다',
        /vc-dock-top #vc-dock-size\{top:calc\(var\(--vcdock-top/.test(dock));
  check('되돌릴 버튼이 오른쪽 끝(=화면크기 바 자리)에 있지 않다',
        !/vc-dock-top #vc-dock-size\{top:64px;bottom:auto;left:auto;right:14px/.test(dock));
  check('vc-dock.js 캐시 버전을 올렸다', /vc-dock\.js\?v=(1[7-9]|[2-9]\d)/.test(html));
  check('vc-spotlight.js 캐시 버전을 올렸다', /vc-spotlight\.js\?v=([3-9]|\d\d)/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   [4] Ness② · Belle② — 화면이 깜빡여 버튼을 누르기 어렵다
   ══════════════════════════════════════════════════════════════════
   깜빡임의 실체는 «메인 스레드 경합» 이다. 홈 화면 전용 폴러(0.5~0.7초)가 수업 중에도
   1.6MB DOM 을 훑고 getComputedStyle 로 스타일 재계산을 강제하고 있었다. */
console.log('\n[4] 깜빡임 — 수업 중에 홈 폴러가 쉬는가');
{
  const idxX5 = readFileSync(join(PUB, 'js', 'idx-x5.js'), 'utf8');
  const guard = /vc-in-call'\)\) return;/;
  for (const [fnName, mark] of [
    ['ph64Enhance',      '  function ph64Enhance(){'],
    ['ph67ForceReflow',  '  function ph67ForceReflow(){'],
    ['ph68SyncVerb',     '  function ph68SyncVerb(){'],
    ['ph69EnhanceModal', '  function ph69EnhanceModal(){'],
    ['ph73Tick',         '  function ph73Tick(){'],
  ]) {
    const head = html.slice(html.indexOf(mark), html.indexOf(mark) + 700);
    check(fnName + ' 은 수업 중에는 쉰다', mark && html.indexOf(mark) > 0 && guard.test(head),
          '수업 중 0.5초 폴러가 겹치면 프레임이 밀려 «깜빡임 + 클릭 빗나감» 이 된다');
  }
  check('ph71Tick(idx-x5) 도 수업 중에는 쉰다', guard.test(idxX5));
  check('🔴 ph67 의 강제 resize 도 함께 멈춘다 (이것이 칠판을 지우던 경로였다)',
        guard.test(html.slice(html.indexOf('  function ph67ForceReflow(){'),
                              html.indexOf('  function ph67ForceReflow(){') + 700)));
}

/* ══════════════════════════════════════════════════════════════════
   [5] Ness③ — 카메라가 갑자기 꺼진다 · 영상이 멈춘다
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[5] 카메라 — 얼어붙음과 «왜 꺼졌는지»');
{
  const g = slice(html, '(function vcBgFreezeGuard(){', '\n})();\n\n/* 🔊 Opus');
  check('가상배경 얼어붙음 방어 블록이 있다', g.length > 300,
        '창이 가려지면 rAF 가 멈춰 합성 캔버스가 마지막 프레임에서 얼어붙는다');
  check('가려지면 원본 카메라 트랙으로 갈아끼운다 (카메라는 백그라운드에서도 프레임을 낸다)',
        /originalVideoTrack/.test(g) && /vcSwapVideoTrack/.test(g));
  check('돌아오면 합성 트랙으로 되돌리고 렌더 루프를 다시 돌린다',
        /processedStream[\s\S]{0,200}vcBgRenderLoop/.test(g));
  check('재협상은 하지 않는다 (replaceTrack 만) — 회선이 나쁠 때 연결을 다시 맺는 것이 최악',
        !/createOffer|vcReconnectPeer/.test(g));
  check('얼굴꾸미기(vcFx)가 켜져 있으면 손대지 않는다 (sender 를 서로 뺏는다)',
        /vcFx/.test(g));
  check('저대역 음성전용(AAO) 안내가 한/영 둘 다',
        /audio only for a moment[\s\S]{0,300}음성만/.test(html),
        '강사 다수가 필리핀이다 — 한국어뿐이면 «일부러 끈 것» 을 고장으로 신고한다');
  check('회복 안내도 한/영 둘 다', /Connection recovered[\s\S]{0,120}영상을 다시 켭니다/.test(html));
}

/* ══════════════════════════════════════════════════════════════════
   [6] Ana② · Belle① — 업로드·로딩 지연
   ══════════════════════════════════════════════════════════════════ */
console.log('\n[6] 속도 — 업로드와 교재 열기');
{
  const up = slice(html, 'const UPLOAD_PARALLEL', 'if (!uploaded.length)');
  check('교재 업로드를 여러 장 동시에 올린다 (예전: 장수 × 왕복시간)', up.length > 200);
  check('동시 개수를 제한한다 (수업 영상 대역을 다 먹지 않게)',
        /UPLOAD_PARALLEL = [2-4]\b/.test(up),
        '무제한이면 강사 업로드 대역이 포화돼 수업 영상이 끊긴다');
  check('🔴 순서를 지킨다 — 완료 순서로 담으면 교재 장 순서가 뒤섞인다',
        /slots\[i\] = await pdfUploadOne/.test(up) && /slots\.filter\(Boolean\)/.test(html));
  check('진행 표시는 그대로 남아 있다', /업로드 중 /.test(up));

  check('pdf.js 가 조각(Range)으로 받는다 — 첫 페이지가 빨리 뜬다',
        /disableAutoFetch:\s*true/.test(html) && /rangeChunkSize/.test(html));
  check('다음 장을 미리 받아 둔다 (조각 받기의 대가를 상쇄)',
        /pdfDoc\.getPage\(_n\)\.catch/.test(html));
  check('미리 받기는 await 하지 않는다 (기다리면 지금 페이지가 늦어져 본말이 뒤집힌다)',
        !/await pdfDoc\.getPage\(_n\)/.test(html));
  check('🔴 라이브러리 교재(BTS·MES)도 Range 를 지원한다 — 정작 수업에서 더 많이 쓰는 쪽이 빠져 있었다',
        /lib_srv[\s\S]{0,2600}Content-Range/.test(idxTs));
  check('Content-Length 를 실어 준다 (없으면 pdf.js 가 조각 받기를 켜지 못한다)',
        /'Content-Length'\]\s*=\s*String\(obj\.size\)/.test(idxTs) ||
        /h\['Content-Length'\]/.test(idxTs));
}

console.log('\n──────────────────────────────────────────');
console.log(`  ${fail === 0 ? '✅' : '❌'} PASS ${pass}    ${fail ? '❌' : '✔'} FAIL ${fail}`);
console.log('──────────────────────────────────────────');
if (fail) { failures.forEach(f => console.log('   · ' + f)); process.exit(1); }
