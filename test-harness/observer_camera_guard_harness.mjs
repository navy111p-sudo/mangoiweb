/**
 * 👁 참관자 카메라·마이크 안전장치 회귀 하니스 (2026-08-20)
 *
 * [사고] 필리핀 매니저 제보 — 「MangoEye 관리자 화면에서 수업을 보는 중에 카메라가 자동으로
 *        보인다. 수업 중간에 누가 들어오면 학생이 혼란스럽다.」
 *        원인은 두 갈래였다.
 *          ① 참관 모드(/?observe=)는 미디어를 안 보내게 잘 만들어져 있었는데, 하단 조작 독의
 *             마이크·카메라·화면공유 버튼이 그대로 보였다. idx-main.js 가 숨기려던
 *             #vc-bottom-toolbar 는 어느 HTML 에도 없는 옛 id 였다(독은 #vc-dock 으로 바뀜).
 *             게다가 vcToggleMic 은 트랙이 없으면 마이크를 «새로 획득» 해 모든 피어에 붙인다
 *             → 참관자가 버튼 한 번으로 수업에 등장할 수 있었다.
 *          ② 관리자 화면의 «직접 입장» 은 참관이 아니라 실제 참가자다. 카메라가 켜진 채
 *             들어가 학생 화면에 낯선 얼굴이 갑자기 떴다.
 *
 * [고친 방식] 화면 코드는 js/vc-observe-guard.js 한 파일에 모았다(defer — 학생 29,000명이 받는
 *        idx-main.js 를 안 건드리려고. 첫 화면 예산과 캐시를 지킨다).
 *
 * 여기서 못 박는 것
 *   A. 안전장치 파일이 실제로 화면에 붙어 있는가
 *   B. 숨김이 «클래스 + !important» 인가 (인라인 style 은 독이 다시 그려지면 날아간다)
 *   C. 마이크·카메라 함수 자체에 가드가 걸렸는가 (버튼 말고 함수 — 호출 경로가 여럿이다)
 *   D. 서버·클라이언트의 «투명 유령» 참관 설계가 그대로인가 (되돌아가면 참관자가 보인다)
 *   E. 「직접 입장」 이 카메라를 끈 채로 들어가는가 + 참관 링크는 여전히 /?observe= 인가
 *
 * ⚠️ 부정 검사(«이 단어가 없어야 한다»)는 반드시 주석을 벗긴 사본으로 한다 —
 *    설명 주석에 그 단어가 들어가면 자기 주석을 잡는다(CLAUDE.md 2장의 그 함정).
 *
 * 실행: node test-harness/observer_camera_guard_harness.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.env.MANGOI_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}
const read = p => (existsSync(p) ? readFileSync(p, 'utf8') : '');
/** 주석 제거 — 부정 검사 전용 */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const indexHtml = read(join(PUB, 'index.html'));
const guard     = read(join(PUB, 'js', 'vc-observe-guard.js'));
const guardCode = strip(guard);
const idxMain   = read(join(PUB, 'js', 'idx-main.js'));
const admS1     = read(join(PUB, 'js', 'adm-s1.js'));
const admToday  = read(join(PUB, 'js', 'adm-today-classes.js'));
const admCore   = read(join(PUB, 'js', 'adm-core.js'));
const doRoom    = read(join(SRC, 'video-call-room.ts'));

/* ── A. 안전장치가 화면에 붙어 있는가 ─────────────────────────────── */
console.log('\n▶ A. 참관 안전장치가 화면에 붙어 있는가');
{
  check('js/vc-observe-guard.js 파일이 있다', guard.length > 0);
  const tag = (indexHtml.match(/<script[^>]*vc-observe-guard\.js[^>]*>/) || [''])[0];
  check('index.html 이 그 파일을 불러온다', !!tag, tag ? '' : '<script src="/js/vc-observe-guard.js?v=…" defer> 가 없다');
  check('defer 로 붙였다(첫 화면을 막지 않는다)', /\bdefer\b/.test(tag), tag);
  check('?v= 캐시 버전이 붙어 있다', /vc-observe-guard\.js\?v=\d+/.test(tag), tag);
}

/* ── B. 숨김은 클래스 + !important ────────────────────────────────── */
console.log('\n▶ B. 참관 중 «보내는» 버튼 숨김');
{
  check('body.vc-observer 클래스를 쓴다(인라인 style 아님)', /classList\.toggle\('vc-observer'/.test(guardCode));
  for (const id of ['vc-dock-mic', 'vc-dock-cam', 'vc-dock-share', 'vc-btn-mic', 'vc-btn-cam']) {
    check(`#${id} 를 숨긴다`, new RegExp('body\\.vc-observer #' + id).test(guardCode));
  }
  check('display:none 을 !important 로 건다(독 CSS 를 이겨야 한다)',
        /display:none\s*!important/.test(guardCode));
  /* 나가기·채팅은 남아야 한다 — 참관자도 나가야 하고, 보기는 해야 한다.
     ⚠️ «그 이름이 파일에 아예 없다» 로 검사하면 안 된다. 2026-08-26 에 참관 중 채팅
        버튼의 이름표를 «귓속말» 로 바꾸느라 그 id 를 «읽기만» 하는 코드가 생기자
        곧바로 거짓 FAIL 이 났다 — 숨긴 적이 없는데도. 물어야 할 것은 «숨기는가» 다.
        → 숨김 규칙(body.vc-observer #아이디)의 «대상 목록» 안에 있는지로 판정한다.
        (CLAUDE.md 2장 「부정 검사가 자기 주석을 잡는다」와 같은 뿌리다) */
  const hideTargets = (guardCode.match(/body\.vc-observer #[\w-]+/g) || []).join(' ');
  check('나가기 버튼은 숨기지 않는다', !/vc-dock-leave/.test(hideTargets));
  check('채팅 버튼은 숨기지 않는다', !/vc-dock-chat/.test(hideTargets),
        '참관자는 귓속말을 그 버튼으로 연다 — 숨기면 보낼 방법이 아예 없어진다');
}

/* ── C. 함수 자체 가드 ────────────────────────────────────────────── */
console.log('\n▶ C. 마이크·카메라 함수 가드 (버튼 말고 «함수»)');
{
  check('vcToggleMic 을 감싼다', /wrap\('vcToggleMic'\)/.test(guardCode));
  check('vcToggleCam 을 감싼다', /wrap\('vcToggleCam'\)/.test(guardCode));
  check('참관이 아니면 원본을 그대로 부른다(평소 동작 불변)', /orig\.apply\(this, arguments\)/.test(guardCode));
  check('참관 판정은 _vcObserverMode 를 본다(vcIsObserver 는 idx-main 안의 let 이라 window 에 없다)',
        /_vcObserverMode\s*===\s*true/.test(guardCode));
  check('막았을 때 «왜 안 되는지» 안내를 띄운다', /blockedNote|참관 중/.test(guard));
}

/* ── D. «투명 유령» 참관 설계가 그대로인가 ────────────────────────── */
console.log('\n▶ D. 참관은 원래 미디어를 안 보낸다 — 그 설계가 그대로인가');
{
  check('서버: 참관자는 joined:false 로 둔다(인원수·입퇴장 방송에 안 나온다)',
        /role:\s*'observer',\s*joined:\s*false/.test(doRoom),
        'video-call-room.ts handleJoinObserve');
  check('클라이언트: 참관자 피어는 recvonly (트랙을 안 붙인다)',
        /if \(vcIsObserver\)[\s\S]{0,400}addTransceiver\('video',\s*\{\s*direction:\s*'recvonly'/.test(idxMain));
  check('클라이언트: 참관자는 빈 스트림으로 입장한다',
        /vcJoinAsObserver[\s\S]{0,900}vcLocalStream = new MediaStream\(\)/.test(idxMain));
  check('클라이언트: 참관자의 내 얼굴 타일은 숨긴다',
        /vcJoinAsObserver[\s\S]{0,1200}localBox\.style\.display = 'none'/.test(idxMain));
}

/* ── D-2. 참관자는 «녹화» 도 하지 않는다 ────────────────────────────────
   (2026-08-26 사장님 지시 「관찰자는 녹화 안 하게 해줘」)
   자동녹화는 «수업 화면에 들어왔는가»(body.vc-in-call)만 보고 돌아서 참관자도 함께
   녹화를 켰다. 실측: `class-943` 에 「관찰자」 이름의 녹화 두 건이 30분 넘게 「● 녹화중」
   으로 남아 있었다 — 참관자가 창을 닫을 때 종료 신호가 안 가 크론이 12시간 뒤에야 정리한다.
   ⚠️ 판정은 **이름(「관찰자」)이 아니라** vc-observe-guard 의 observing() 과 같은 근거로.
      이름은 사람이 바꿀 수 있는 표시일 뿐이다. */
console.log('\n▶ D-2. 참관 중에는 녹화하지 않는다');
{
  const rec = read(join(PUB, 'js', 'mango-rec.js'));
  const recCode = strip(rec);
  check('mango-rec.js 에 참관 판정이 있다', /function isObserverNow\s*\(/.test(recCode));
  check('판정 근거가 guard 와 같다(_vcObserverMode · vcIsObserver · body.vc-observer)',
        /_vcObserverMode\s*===\s*true/.test(recCode) &&
        /vcIsObserver\s*===\s*true/.test(recCode) &&
        /classList\.contains\('vc-observer'\)/.test(recCode));
  check('startRecording 입구에서 막는다 (자동·수동·앞으로 생길 경로 전부)',
        /async function startRecording[\s\S]{0,400}if \(isObserverNow\(\)\)[\s\S]{0,300}return;/.test(recCode));
  check('자동녹화 폴링이 참관 중에는 시작하지 않는다',
        /!_observing[\s\S]{0,120}!isRecording[\s\S]{0,80}!autoRecStarted/.test(recCode));
  check('참관자에게는 «녹화 꺼짐 · 눌러서 시작» 배지도 안 띄운다',
        /!_observing[\s\S]{0,120}showRecBadge\(\)/.test(recCode));
  check('⛔ 이름(「관찰자」)으로 가르지 않는다',
        !/teacher_name[\s\S]{0,40}관찰자/.test(recCode) && !/=== *'관찰자'/.test(recCode));
}

/* ── E. 「직접 입장」 과 「참관」 이 갈라져 있는가 ─────────────────── */
console.log('\n▶ E. 직접 입장은 카메라를 끄고, 참관은 그대로 참관');
{
  check('참관 링크는 여전히 /?observe= 다', /'\/\?observe='/.test(admCore), 'adm-core.js observeRoom');
  check('실시간 수업 현황의 직접 입장이 카메라를 끈다', /vc_autojoin=1&vc_cam=off/.test(admS1), 'adm-s1.js ghEnterRoom');
  check('오늘 수업 목록의 직접 입장이 카메라를 끈다', /vc_autojoin=1&vc_cam=off/.test(admToday), 'adm-today-classes.js tcEnterClass');
  check('직접 입장 확인창이 카메라 상태를 알려 준다', /카메라는 꺼진 채로 입장/.test(admS1) && /카메라는 꺼진 채로 입장/.test(admToday));

  check('안전장치가 vc_cam=off 를 읽는다', /vc_cam=off/.test(guardCode));
  check('트랙을 «지우지» 않고 끄기만 한다(나중에 버튼으로 켜야 하므로)',
        !/getVideoTracks\(\)[\s\S]{0,120}\.stop\(\)/.test(guardCode));
  check('앱 자신의 vcToggleCam 을 불러 내부 상태까지 맞춘다(두 번 눌러야 켜지는 것 방지)',
        /window\.vcToggleCam\(\)/.test(guardCode));
  check('상대에게 «내가 껐다» 를 알린다(검은 화면 오인 → 재협상 폭주 방지)',
        /vcBroadcastCamState\(false/.test(guardCode));
}

/* ── F. 색이 «화면에» 나오는가 — 세 겹의 덮어쓰기 ────────────────────
   [뜻] 보라 = 참관(학생에게 안 보임) · 주황 = 직접 입장(학생에게 보임) · 빨강 = 위험.
   [사고] 2026-08-21 헤드리스 실측 — 인라인 style 로 준 색이 «한 개도» 화면에 안 나왔다.
     ① admin-inline-c.css 3279행 details.menu-card button:not(…) → 파랑 그라데이션 !important
     ② 같은 파일 9072행 [id^="card-"] button:not([class])        → #ffffff !important
     ③ adm-light-surfaces.js 페인터 → 어두운 배경을 인라인 !important 로 밝게(파랑이 흰색이 됐다)
   그래서 ①②는 클래스 + 특이성 (0,8,1) CSS 로, ③은 SKIP_SEL 등재로 막는다.
   ⛔ 색을 JS 인라인으로 되돌리면 화면에서 조용히 사라진다 — 그래서 «인라인 금지» 도 검사한다. */
console.log('\n▶ F. 참관/직접입장 색이 화면에 실제로 나오는가');
{
  const css = read('cloudflare-deploy/public/css/admin-inline-c.css');
  const painter = read('cloudflare-deploy/public/js/adm-light-surfaces.js');

  // ⓐ JS 는 «클래스만» 붙인다 — 색을 인라인으로 주면 위 ①②③ 에 먹힌다
  const btnLine = (t, mark) => (t.match(new RegExp('^.*' + mark + '.*$', 'm')) || [''])[0];
  const noInlineBg = l => !/style="[^"]*background/.test(l);
  check('실시간 수업 현황 [GHOST 참관] 은 클래스만 쓴다(인라인 색 없음)',
        /class="rm-act rm-act-observe"/.test(admCore) && noInlineBg(btnLine(admCore, 'rm-act-observe')));
  check('같은 표의 [강제 종료]·[연장]·[즉시 개입]도 클래스만 쓴다',
        ['rm-act-end', 'rm-act-extend', 'rm-act-intervene'].every(c =>
          new RegExp('class="rm-act ' + c + '"').test(admCore) && noInlineBg(btnLine(admCore, c))));
  check('수업 관찰 카드 두 버튼도 클래스만 쓴다',
        /class="gh-act gh-act-observe"/.test(admS1) && /class="gh-act gh-act-enter"/.test(admS1)
        && noInlineBg(btnLine(admS1, 'gh-act-observe')) && noInlineBg(btnLine(admS1, 'gh-act-enter')));
  check('오늘 수업 두 버튼도 클래스만 쓴다',
        /class="tc-act tc-act-enter"/.test(admToday) && /class="tc-act tc-act-observe"/.test(admToday)
        && noInlineBg(btnLine(admToday, 'tc-act-enter')) && noInlineBg(btnLine(admToday, 'tc-act-observe')));

  // ⓑ 색의 정본은 CSS 한 곳 — 뜻대로 칠해져 있는가
  const rule = sel => {
    const i = css.indexOf(sel);
    return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
  };
  check('CSS: 참관은 보라(#8b5cf6)', /#8b5cf6/.test(rule('button.rm-act-observe:not(')));
  check('CSS: 직접 입장은 주황(245,158,11)', /245,\s*158,\s*11/.test(rule('button.gh-act-enter:not('))
        && /245,\s*158,\s*11/.test(rule('button.tc-act-enter:not(')));
  check('CSS: 카드 안 참관 칩은 보라(139,92,246)', /139,\s*92,\s*246/.test(rule('button.gh-act-observe:not('))
        && /139,\s*92,\s*246/.test(rule('button.tc-act-observe:not(')));
  check('CSS: 강제 종료는 빨강(#dc2626) — 되돌릴 수 없는 행위', /#dc2626/.test(rule('button.rm-act-end:not(')));
  check('CSS: 참관과 직접 입장이 «다른» 색이다',
        !/#8b5cf6/.test(rule('button.gh-act-enter:not(')) && !/245,\s*158,\s*11/.test(rule('button.rm-act-observe:not(')));

  // ⓒ 특이성 — «맨 끝 + !important» 만으로는 ① 을 못 이긴다(실측)
  const strong = sel => (rule(sel).match(/:not\(/g) || []).length >= 5;
  check('CSS 선택자에 특이성 꼬리(:not() 5개 이상)가 붙어 있다',
        ['button.rm-act-observe:not(', 'button.gh-act-enter:not(', 'button.tc-act-observe:not('].every(strong));
  check('CSS 규칙이 파랑 그라데이션 규칙(3279행)보다 «뒤»에 있다',
        css.indexOf('button.rm-act-observe:not(') > css.indexOf('details.table-card.menu-card button:not('));
  check('클래스 이름이 «-btn» 으로 끝나지 않는다([class$="-btn"] 규칙 회피)',
        !/class="[^"]*-btn"/.test(btnLine(admCore, 'rm-act-observe')));

  // ⓓ 페인터가 이 버튼들을 밝게 눌러 색을 지우지 못하게
  check('페인터 SKIP_SEL 에 세 계열이 등재돼 있다',
        /'\.rm-act'/.test(painter) && /'\.gh-act'/.test(painter) && /'\.tc-act'/.test(painter),
        'adm-light-surfaces.js');

  // ⓔ 색맹·흑백 출력 대비 — 글자로도 갈라진다
  check('직접 입장은 «(보임)» 글자로도 구분된다',
        /직접 입장\(보임\)/.test(admS1) && /입장\(보임\)/.test(admToday));

  // ⓕ 행 템플릿 안 HTML 주석 금지(행마다 DOM 에 주석 노드가 박힌다)
  check('행 템플릿 안에 HTML 주석을 넣지 않았다', !/return `<tr[\s\S]{0,1500}<!--/.test(admCore));
}

/* ── G. «참관할 수업이 없을 때» 화면이 그렇게 말하는가 ────────────────
   [사고] 2026-08-21 사장님이 「지금 수업 11 · 화상방 접속 0」 화면을 보시고
   «참관 버튼이 안 보인다» 고 하셨다. 고장이 아니라 카페24 예약 수업이라 참관 대상이
   없는 것인데, 안내문이 «종료·연장할 대상이 없다» 고만 말해 참관을 찾는 사람에게는
   답이 되지 않았다. 아래 카페24 줄에 버튼이 «원래» 없다는 사실도 어디에도 없었다. */
console.log('\n▶ G. 참관 대상이 없을 때의 안내문');
{
  const ghostView = read('cloudflare-deploy/public/admin/ghost-view.html');

  check('「지금 수업」 표 안내가 «참관» 도 함께 말한다',
        /종료·연장·참관할 대상은 없습니다/.test(admCore), 'adm-core.js _schedRowsHtml');
  check('그 안내가 «카페24 줄엔 참관 버튼이 없다» 까지 적는다',
        /참관 버튼도 생기지 않습니다/.test(admCore));
  check('영어 화면도 같은 뜻이다',
        /nothing to end, extend or observe/.test(admCore) && /no observe button/.test(admCore));

  check('「수업 관찰」 화면도 «지금은 참관할 수업이 없다» 고 말한다',
        /참관할 수업이 없다는 뜻입니다/.test(ghostView), 'ghost-view.html ghdLoadPicker');
  check('그 화면도 «카페24는 참관 버튼이 없다 · 고장이 아니다» 를 적는다',
        /참관 버튼이 없습니다/.test(ghostView) && /고장이 아닙니다/.test(ghostView));
  check('영어 화면도 같은 뜻이다',
        /no class to observe/.test(ghostView) && /not a fault/.test(ghostView));

  // 안내와 화면이 어긋나지 않게 — 카페24 줄에는 실제로 버튼을 그리지 않아야 한다
  const sched = admCore.slice(admCore.indexOf('function _schedRowsHtml'),
                              admCore.indexOf('async function loadActiveRooms'));
  check('카페24 줄에는 실제로 버튼을 그리지 않는다(안내와 화면 일치)',
        !/<button/.test(sched), '_schedRowsHtml');
  check('카페24 방 번호로 참관 링크를 만들지 않는다(번호 체계가 다르다)',
        !/observe=/.test(sched) && !/observeRoom\(/.test(sched));
}

/* ═══ G절 · STEP 2 — 🎧 소리만 참관 · 💬 귓속말 패널 (2026-08-31) ═══════════
   이 둘은 «화면을 가리는» 기능이 아니라 «협상과 순서» 를 건드리는 기능이라,
   문자열이 다 맞아도 조용히 헛돌 수 있다. 그 조용한 실패 지점만 못 박는다. */
{
  const guard = read(join(PUB, 'js', 'vc-observe-guard.js'));
  const g = strip(guard);

  check('G① 소리만은 «영상 미수신 감시» 를 먼저 끈다 (안 끄면 릴레이 강제 + offer 재전송)',
        /__vcObserveMediaWatching = true/.test(g) && /__vcObserveRetried = true/.test(g),
        'vc-observe-guard.js ⑦절');
  check('G② offer 를 만들기 «전» 에 끈다 — vcCreatePeer 를 감싸 video 트랜시버를 inactive 로',
        /window\.vcCreatePeer = function/.test(g) && /direction = 'inactive'/.test(g));
  check('G③ 실제로 껐을 때만 «소리만» 이라고 말한다 (못 껐으면 배너를 안 그린다)',
        /if \(n\) \{[^}]*__vcAudioOnlyOn = true;[^}]*showAudioNote\(\)/.test(g));
  /* ⚠️ 검사는 «그 글자가 있는가» 가 아니라 «뜻» 으로 — 되돌리기 주소를 어떻게 만들든,
     audio 를 다시 싣지 않고 observe 는 유지하면 맞는 것이다(G⑭ 가 조립 방식을 본다). */
  check('G④ 도중 전환은 재협상 대신 «audio 없이 다시 열기» (이 앱에는 자동 재협상이 없다)',
        /'\?observe=' \+ encodeURIComponent\(observeRoom/.test(g) && !/q \+= '&audio=1'/.test(g));
  check('G⑤ 귓속말 패널은 vcOpenChat 으로 연다 (vcToggleChat 이면 두 번째 호출이 도로 닫는다)',
        /vcOpenChat\(\)/.test(g) && !/vcToggleChat\(\)/.test(g));
  check('G⑥ 참관 화면(?observe=)에서만 동작한다',
        /qs\.get\('observe'\)/.test(g));
  check('G⑦ index.html 이 그 파일을 새 ?v= 로 부른다 (안 올리면 옛 파일이 캐시에서 나온다)',
        /vc-observe-guard\.js\?v=([89]|[1-9][0-9])/.test(indexHtml));

  /* ⑨ 참관 주소에 ?room= 이 남으면 새로고침이 «실제 참가자» 로 입장시킨다 (2026-08-31 실측) */
  check('G⑫ 참관 중에는 주소에 ?room= 을 쓰지 못하게 막는다 (F5 = 카메라 켜고 등장 방지)',
        /history\.replaceState = function/.test(g) && /searchParams\.delete\('room'\)/.test(g));
  check('G⑬ 상주 setInterval 로 지우지 않는다 (홈을 멎게 한 전력)',
        !/setInterval\([^)]*room/.test(g));
  check('G⑭ «영상도 보기» 는 지금 주소를 물려받지 않고 새로 조립한다 (?room= 을 딸려 보내지 않게)',
        /location\.origin \+ location\.pathname \+ q/.test(g));

  /* 관제탑 — 세 갈래가 «같은 참관» 이고 기록 사유만 다르다 */
  const wall = read(join(PUB, 'admin', 'monitor-wall.html'));
  const w = strip(wall);
  check('G⑧ 관제탑에 귓속말·소리만 버튼이 있다',
        /data-act="observe-whisper"/.test(w) && /data-act="observe-audio"/.test(w));
  check('G⑨ 각각 &whisper=1 · &audio=1 로 연다',
        /'&whisper=1'/.test(w) && /'&audio=1'/.test(w));
  check('G⑩ 모드마다 감사 기록 사유가 다르다 (로그만 보고 무엇을 하려던 참관인지 남는다)',
        /참관 \+ 귓속말/.test(w) && /소리만 참관/.test(w) && /logObserve\(roomId, reason\)/.test(w));
  check('G⑪ 참관 계열 버튼은 보라 계열 — 입장(주황)·종료(빨강)와 섞이지 않는다',
        /\.acts \.go2\{[^}]*var\(--violet\)/.test(wall));
}

/* ── H. 참관자는 «얼굴 칸» 도 만들지 않는다 (2026-09-01 사장님 「참가자가 안 보이게」) ──
   문자열로 «가드가 있다» 만 보면 헛돕니다 — 이 절은 ⑩절을 **오려 내 실제로 돌립니다**.
   가짜 window/document 를 물려, 참관자 id 와 진짜 학생 id 를 둘 다 넣어 봅니다.
   («막는다» 검사만 두면 가드가 전부를 막아도 초록입니다 → «진짜 학생은 만든다» 를 짝으로.) */
console.log('\n▶ H. 참관자 얼굴 칸 가드 — 실제로 돌려서 확인');
{
  /* 서버: 참관자의 offer 에 표시가 실리는가 (판정 근거 자체) */
  const oi = doRoom.indexOf('private handleOffer(');
  let block = '';
  if (oi >= 0) {
    const s0 = doRoom.indexOf('{', oi);
    let d = 0;
    for (let i = s0; i < doRoom.length; i++) {
      if (doRoom[i] === '{') d++;
      else if (doRoom[i] === '}') { d--; if (!d) { block = doRoom.slice(s0, i + 1); break; } }
    }
  }
  const bc = strip(block);
  /* ⚠️ «fromObserver 라는 글자가 있는가» 로 물으면 `const fromObserver = …` 선언만 남아도
     통과한다(변이시험에서 실제로 그랬다). «보내는 묶음 안에» 있는지를 묻는다. */
  check('H① 서버 handleOffer 가 참관자 offer 에 fromObserver 를 «실어 보낸다»',
        /sendTo\([\s\S]*fromObserver/.test(bc), 'video-call-room.ts handleOffer');
  check('H② 판정은 소켓 attachment 의 role 로 한다 (본문 값이 아니라)',
        /role/.test(bc) && /observer/.test(bc));
  check('H③ 참관자에게는 이름을 지어내지 않는다 («참가자» 폴백은 참관자가 아닐 때만)',
        /fromObserver \?\s*''\s*:/.test(bc), '참관자 분기에서 이름을 비우지 않는다');

  /* 화면: ⑩절만 오려 내 진짜로 실행 */
  const mi = guard.indexOf('⑩ 참관자는');
  const code = mi >= 0 ? guard.slice(guard.lastIndexOf('/*', mi)) : '';
  check('H④ ⑩절이 파일에 있다', code.length > 0);

  function boot() {
    const boxes = new Map();
    const removed = [];
    const timers = [];
    const calls = { offer: [], ensure: [], add: [], removePeer: [], grid: 0 };
    const parent = { removeChild(b) { boxes.delete(b.id); removed.push(b.id); } };
    const mkBox = id => { const b = { id, parentNode: parent }; boxes.set(id, b); return b; };
    const doc = { getElementById: id => boxes.get(id) || null };
    const win = {
      vcHandleOffer(data) { calls.offer.push(data); },
      vcEnsureParticipantBox(uid) { calls.ensure.push(uid); return mkBox('vc-video-' + uid); },
      vcAddRemoteVideo(uid) { calls.add.push(uid); return mkBox('vc-video-' + uid); },
      vcRemovePeer(uid, reason) { calls.removePeer.push(uid + ':' + reason); },
      vcUpdateGridCount() { calls.grid++; },
    };
    new Function('window', 'document', 'setTimeout', code)(win, doc, fn => { timers.push(fn); return timers.length; });
    return { win, boxes, removed, timers, calls, mkBox, flush: () => timers.splice(0).forEach(f => f()) };
  }

  if (code) {
    /* ① 진짜 학생은 그대로 만든다 — 가드가 전부를 막고 있지 않은가 */
    {
      const t = boot();
      t.win.vcHandleOffer({ fromUserId: 'stu1', fromUsername: '김민수' });
      t.flush();
      const box = t.win.vcEnsureParticipantBox('stu1', '김민수');
      check('H⑤ 참관자가 아닌 사람의 얼굴 칸은 그대로 만들어진다', !!box && t.boxes.has('vc-video-stu1'));
      check('H⑥ 원래 vcHandleOffer 가 그대로 이어서 불린다 (answer 를 보내야 참관이 성립)',
            t.calls.offer.length === 1);
    }
    /* ② 참관자는 만들지 않는다 */
    {
      const t = boot();
      t.win.vcHandleOffer({ fromUserId: 'obs1', fromUsername: '', fromObserver: true });
      t.flush();
      const box = t.win.vcEnsureParticipantBox('obs1', '참가자');
      check('H⑦ 참관자 id 는 vcEnsureParticipantBox 가 칸을 만들지 않는다',
            box === null && !t.boxes.has('vc-video-obs1'));
      t.win.vcAddRemoteVideo('obs1');
      check('H⑧ 참관자 id 는 vcAddRemoteVideo 로도 칸이 남지 않는다', !t.boxes.has('vc-video-obs1'));
      check('H⑨ 참관자 offer 도 원래 처리로 이어진다 (참관 자체를 막는 것이 아니다)',
            t.calls.offer.length === 1);
    }
    /* ③ 이미 만들어져 있던 칸은 걷어낸다 (offer 가 늦게 온 경우) */
    {
      const t = boot();
      t.mkBox('vc-video-obs2');
      t.win.vcHandleOffer({ fromUserId: 'obs2', fromObserver: true });
      t.flush();
      check('H⑩ 이미 있던 참관자 칸은 걷어낸다', !t.boxes.has('vc-video-obs2') && t.removed.includes('vc-video-obs2'));
      check('H⑪ 걷어낼 때 vcRemovePeer(…, \'left\') 를 쓰지 않는다 (학생 화면에 「수업이 끝났어요」)',
            t.calls.removePeer.length === 0);
      check('H⑫ 걷어낸 뒤 인원 칸 수를 다시 센다', t.calls.grid > 0);
    }
    /* ④ 표시가 없으면 아무것도 기억하지 않는다 — «이름이 참가자면 지운다» 로 넓히지 않았는가 */
    {
      const t = boot();
      t.win.vcHandleOffer({ fromUserId: 'stu2', fromUsername: '참가자' });
      t.flush();
      const box = t.win.vcEnsureParticipantBox('stu2', '참가자');
      check('H⑬ 이름이 「참가자」여도 서버 표시가 없으면 지우지 않는다 (진짜 학생 보호)',
            !!box && t.boxes.has('vc-video-stu2'));
    }
  }
  check('H⑭ 상주 setInterval 로 감시하지 않는다 (홈 전체가 멎은 전력)',
        !/setInterval/.test(strip(code)));
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
