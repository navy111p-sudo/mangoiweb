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

  /* 📌 (2026-09-01 갱신) 예전에는 이 목록에 카페24 수업만 와서 「참관 버튼이 생기지 않습니다」가
     사실이었다. 지금은 수강신청 수업(망고아이 방이 있는 수업)도 함께 오므로 그쪽에는 버튼이 «있다».
     ⛔ 그래서 옛 문장을 글자 그대로 못 박지 않는다 — 물어야 할 것은 «두 갈래를 갈라 말하는가» 다
        (CLAUDE.md 2장 「검사가 옛 숫자·옛 식을 못 박아 두면 보장을 강화한 수리에 FAIL 이 난다」). */
  check('「지금 수업」 표 안내가 «참관» 도 함께 말한다',
        /참관할 수 있습니다/.test(admCore), 'adm-core.js _schedRowsHtml');
  check('그 안내가 «카페24 줄엔 참관 버튼이 없다» 까지 적는다',
        /참관 버튼도 생기지 않습니다/.test(admCore));
  check('영어 화면도 같은 뜻이다',
        /can still be observed/.test(admCore) && /no observe button/.test(admCore));

  check('「수업 관찰」 화면이 «화상방이 비었을 때 무엇을 보라» 고 말한다',
        /아래 «예약 기준 지금 수업» 을 보세요/.test(ghostView), 'ghost-view.html ghdLoadPicker');
  check('그 화면도 «수강신청은 참관 가능 · 카페24는 버튼 없음 · 고장이 아니다» 를 적는다',
        /수강신청 수업은 아무도 안 들어와도 방이 있어 참관 버튼이 있고/.test(ghostView)
        && /참관 버튼이 없습니다/.test(ghostView) && /고장이 아닙니다/.test(ghostView));
  check('영어 화면도 같은 뜻이다',
        /enrolment classes have an observe button/.test(ghostView) && /not a fault/.test(ghostView));

  // 안내와 화면이 어긋나지 않게 — «카페24» 줄에는 실제로 버튼을 그리지 않아야 한다
  const sched = admCore.slice(admCore.indexOf('function _schedRowsHtml'),
                              admCore.indexOf('async function loadActiveRooms'));
  check('참관 버튼은 observable(=망고아이 방이 있는 수업)일 때만 그린다',
        /c\.observable\s*\?\s*\(c\.room_id/.test(sched), '_schedRowsHtml');
  check('카페24 줄에는 참관할 방을 주지 않는다(빈 문자열 → 버튼 없음)',
        /c\.observable\s*\?\s*\(c\.room_id \|\| ''\)\s*:\s*''/.test(sched));
  /* 카페24 줄의 «접속이 잡힌 방»(live_room)으로도 참관 링크를 만들지 않는다 —
     그 값은 우리 방 번호가 맞지만, 이 표에서 참관 대상은 observable 하나로만 정한다.
     ⛔ 이 검사를 «빈 문자열을 재는» 식으로 쓰지 말 것(늘 통과한다 — 실제로 한 번 그렇게 썼다). */
  check('참관 대상을 live_room 으로 정하지 않는다',
        !/observeRoom\([^)]*live_room/.test(sched), '_schedRowsHtml');
  /* 🔘 버튼은 «화상방» 줄과 같은 방식이어야 한다 — 인라인 onclick + 새 class 로 만들면
     `details.menu-card button` 전역 !important 가 파란 알약을 씌워 칸을 밀어낸다(CLAUDE.md 2장). */
  check('참관 버튼이 표 위임(data-act="observe")과 rm-act 색 규칙을 쓴다',
        /data-act="observe"/.test(sched) && /rm-act-observe/.test(sched));
  check('그 줄에 data-room 을 실어 위임이 방 번호를 읽을 수 있다',
        /data-room="' \+ _esc\(obsRoom\)/.test(sched));
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
  /* 📦 (2026-09-02) 관제탑 화면 코드는 /js/monitor-wall.js 로 나갔다 — 두 파일을 합쳐서 본다. */
  const wall = read(join(PUB, 'admin', 'monitor-wall.html'))
             + '\n' + read(join(PUB, 'js', 'monitor-wall.js'));
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
  /* ⚠️ 파일 «끝까지» 자르면 뒤에 붙는 새 절이 딸려 들어온다 — 실제로 ⑪절을 넣자
     H⑭(«상주 setInterval 을 쓰지 않는다»)가 ⑪절의 타이머를 잡아 거짓 FAIL 이 났다.
     ⑩절 하나만 자른다: 다음 블록주석이 시작하는 자리에서 끊는다. */
  const mi = guard.indexOf('⑩ 참관자는');
  const ni = mi >= 0 ? guard.indexOf('⑪ 참관 화면', mi) : -1;
  const codeEnd = ni >= 0 ? guard.lastIndexOf('/*', ni) : guard.length;
  const code = mi >= 0 ? guard.slice(guard.lastIndexOf('/*', mi), codeEnd) : '';
  check('H④ ⑩절이 파일에 있다', code.length > 0);
  check('H④-2 ⑩절 조각에 뒤 절이 딸려 오지 않았다 (검사 범위가 파일 끝까지가 아니다)',
        code.length > 0 && !/⑪ 참관 화면/.test(code));

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

console.log('\n▶ I. 참관 화면이 «왜 검은지» 말한다 — 판정을 실제로 돌려서 확인');
{
  /* ⑪절만 오려 낸다. ⛔ 파일 끝까지 자르면 다음에 붙는 절이 딸려 온다(H④-2 참고). */
  const wi = guard.indexOf('⑪ 참관 화면');
  /* ⚠️ H④-2 와 같은 이유로 «파일 끝까지» 자르지 않는다. 지금은 ⑪절이 마지막이라 결과가 같지만,
     ⑫절이 붙는 순간 I④(MutationObserver 없음)·I⑤(vcRemovePeer 없음)가 거짓 FAIL 을 낸다. */
  const wj = wi >= 0 ? guard.indexOf('⑫ ', wi) : -1;
  const secEnd = wj >= 0 ? guard.lastIndexOf('/*', wj) : guard.length;
  const sec = wi >= 0 ? guard.slice(guard.lastIndexOf('/*', wi), secEnd) : '';
  check('I① ⑪절이 파일에 있다', sec.length > 0);

  const sc = strip(sec);
  /* 🔒 이 절의 안전장치 전부 — 수업 화면(학생 29,000명)에는 한 줄도 돌면 안 된다. */
  check('I② 참관 화면이 아니면 곧바로 반환한다 (?observe= 가 없으면 아무 일도 안 한다)',
        /observe=[\s\S]{0,80}test\(location\.search\)[\s\S]{0,40}return/.test(sc),
        '수업 화면에서 도는 코드가 되면 반경이 학생 전원이다');
  check('I③ 참관이 아니게 되면 타이머를 스스로 끈다 (상주 타이머를 남기지 않는다)',
        /if\s*\(!obs\(\)\)[\s\S]{0,120}clearInterval/.test(sc));
  check('I④ body class MutationObserver 를 쓰지 않는다 (홈 전체가 멎은 전력)',
        !/MutationObserver/.test(sc));
  check('I⑤ vcRemovePeer 를 부르지 않는다 (학생 화면에 「수업이 끝났어요」)',
        !/vcRemovePeer/.test(sc));

  /* ── 판정을 실제로 돌린다 ── */
  function cut(src, head) {
    const i = src.indexOf(head);
    if (i < 0) return '';
    const s0 = src.indexOf('{', i);
    let d = 0;
    for (let k = s0; k < src.length; k++) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
    }
    return '';
  }
  const stallLine = (sec.match(/var STALL_MS = \d+;/) || [''])[0];
  const framesFn  = cut(sec, 'function frames(v)');
  const stateFn   = cut(sec, 'function stateOf(box, now)');
  check('I⑥ 판정 함수를 오려 냈다 (전제 — 이게 비면 아래 검사가 통째로 헛돈다)',
        !!stallLine && !!framesFn && !!stateFn);

  if (stallLine && framesFn && stateFn) {
    /* ⚠️ 판정이 window.vcRemoteCamOff(기존 정본의 상태)와 document.hidden(배경 탭)을 읽는다.
       주입하지 않으면 그 두 줄이 예외로 빠져 검사가 헛돈다. */
    const mkStateOf = (winOverride, docOverride) => new Function(
      'window', 'document',
      stallLine + '\n' + framesFn + '\n' + stateFn + '\nreturn stateOf;'
    )(winOverride || { vcRemoteCamOff: {} }, docOverride || { hidden: false });
    const stateOf = mkStateOf();

    const mkVideo = o => ({
      paused: o.paused === true,
      srcObject: o.noStream ? null : { getVideoTracks: () => o.tracks || [] },
      getVideoPlaybackQuality: o.noFrames ? undefined : (() => ({ totalVideoFrames: o.f || 0 })),
    });
    const mkBox = o => ({
      id: 'vc-video-' + (o.uid || 'stu1'),
      video: mkVideo(o),
      querySelector(sel) {
        if (sel === 'video') return o.novideo ? null : this.video;
        if (sel === '.vc-connecting-hint') return o.hint ? {} : null;
        if (sel === '.vc-camoff-hint') return o.camoffHint ? {} : null;
        if (sel === '.vc-black-hint') return o.blackHint ? {} : null;
        if (sel === '.vc-ss-badge') return o.screenShare ? {} : null;
        if (sel === '.vc-aao-freeze') return o.aaoBand ? {} : null;
        return null;
      },
      /* 음성전용 상태 클래스 — js/idx-vc-qlog.js ⑤ 가 타일에 붙인다(vc-aao-on) */
      classList: { contains: (c) => c === 'vc-aao-on' ? !!o.aaoOn : false },
    });
    const live = { readyState: 'live', muted: false };

    /* «말한다» 쪽 */
    check('I⑦ 비디오 트랙이 하나도 없으면 「소리만」이라고 말한다',
          stateOf(mkBox({ tracks: [] }), 1000) === 'nocam');
    check('I⑧ 영상이 끊기면(muted) 말한다 — ⛔ 단, «껐다» 고 단정하지 않는다',
          stateOf(mkBox({ tracks: [{ readyState: 'live', muted: true }] }), 1000) === 'novideo');
    check('I⑨ 트랙이 live 가 아니어도 같은 말을 한다',
          stateOf(mkBox({ tracks: [{ readyState: 'ended', muted: false }] }), 1000) === 'novideo');
    /* ⚠️ 부정 검사는 «주석을 벗겨 낸» 사본으로 — 왜 그렇게 했는지 적은 주석이 그 낱말을
       갖고 있어 검사가 «자기 주석» 을 잡는다(CLAUDE.md 2장. 여기서 실제로 밟았다). */
    check('I⑨-2 문구가 «상대가 껐다» 로 단정하지 않는다 (AAO 는 회선 때문이지 사람이 끈 것이 아니다)',
          !/카메라를 껐/.test(strip(sec)) && /상대 영상이 오지 않습니다/.test(sec),
          'idx-main.js vcApplyRemoteCamHint 가 user/aao 를 갈라 말하는 정본이다');
    {
      const b = mkBox({ tracks: [live], f: 500 });
      const first = stateOf(b, 1000);          // 프레임 수를 처음 기억한다
      const later = stateOf(b, 1000 + 4000);   // 4초째 그대로
      check('I⑩ 프레임이 4초째 그대로면 「영상이 멈췄다」고 말한다',
            first === null && later === 'stall');
    }

    /* «말하지 않는다» 쪽 — 짝이 없으면 «항상 말하기» 도 통과한다 */
    {
      const b = mkBox({ tracks: [live], f: 500 });
      stateOf(b, 1000);
      b.video.getVideoPlaybackQuality = () => ({ totalVideoFrames: 560 });
      check('I⑪ 프레임이 늘고 있으면 아무 말도 안 한다 (정상 영상)',
            stateOf(b, 1000 + 4000) === null);
    }
    {
      /* ⚠️ 한 번만 부르면 헛돈다 — 첫 호출은 «프레임 수를 기억하는» 자리라 어차피 null 이다.
         「못 재면 말하지 않는다」가 실제로 일하는 곳은 4초 뒤 «두 번째» 호출이다
         (그 줄을 지우면 -1 이 -1 과 같아 모든 영상이 「멈췄다」가 된다 — 변이시험으로 확인). */
      const b = mkBox({ tracks: [live], noFrames: true });
      const first = stateOf(b, 1000);
      const later = stateOf(b, 1000 + 4000);
      check('I⑫ 프레임을 못 재는 브라우저에서는 「멈췄다」고 하지 않는다 (모르면 말하지 않는다)',
            first === null && later === null);
    }
    {
      const b = mkBox({ tracks: [live], paused: true, f: 500 });
      stateOf(b, 1000);
      check('I⑬ 자동재생에 막혀 멈춘 것은 말하지 않는다 (기존 「소리 켜기」 배너가 담당)',
            stateOf(b, 1000 + 4000) === null);
    }
    check('I⑭ 영상이 아직 안 붙었으면 말하지 않는다 (기존 「📷 연결 중…」이 담당)',
          stateOf(mkBox({ noStream: true }), 1000) === null);
    check('I⑮ 「📷 연결 중…」이 살아 있는 동안에는 손을 뗀다 (같은 말을 두 번 하지 않는다)',
          stateOf(mkBox({ tracks: [], hint: true }), 1000) === null);
    check('I⑯ <video> 가 아직 없으면 말하지 않는다',
          stateOf(mkBox({ novideo: true }), 1000) === null);

    /* ── 이미 있는 정본에 양보하는가 (함정 대조 2026-09-10) ──
       ⛔ 「상대가 카메라를 껐다」는 idx-main.js vcApplyRemoteCamHint 의 몫이다. 그것은 서버가
          실어 준 사유로 «사람이 껐다» 와 «회선이 약해 내려갔다(AAO)» 를 갈라 말한다.
          우리가 덧붙이면 AAO 에서 «사실이 아닌» 말이 하나 더 붙는다. */
    {
      const win = { vcRemoteCamOff: { stu9: 'aao' } };
      const so = mkStateOf(win, { hidden: false });
      check('I⑱ 정본이 «왜 꺼졌는지» 아는 칸에서는 손을 뗀다 (AAO 에 「껐다」를 덧붙이지 않는다)',
            so(mkBox({ uid: 'stu9', tracks: [{ readyState: 'live', muted: true }] }), 1000) === null);
      check('I⑲ 정본이 모르는 칸에서는 말한다 (짝 — 없으면 «전부 침묵» 도 통과한다)',
            so(mkBox({ uid: 'other', tracks: [{ readyState: 'live', muted: true }] }), 1000) === 'novideo');
    }
    check('I⑳ 기존 「카메라 꺼짐」 힌트가 붙어 있으면 손을 뗀다',
          stateOf(mkBox({ camoffHint: true, tracks: [{ readyState: 'live', muted: true }] }), 1000) === null);
    check('I㉑ 기존 「상대 영상 준비 중」 힌트가 붙어 있으면 손을 뗀다',
          stateOf(mkBox({ blackHint: true, tracks: [] }), 1000) === null);
    {
      /* 화면 공유는 «정지 화면» 이 정상이다 — 교재 한 장을 띄워 두면 프레임이 안 는다 */
      const b = mkBox({ screenShare: true, tracks: [live], f: 500 });
      check('I㉒ 화면 공유 타일은 「멈췄다」고 하지 않는다',
            stateOf(b, 1000) === null && stateOf(b, 1000 + 4000) === null);
    }
    {
      const so = mkStateOf({ vcRemoteCamOff: {} }, { hidden: true });
      const b = mkBox({ tracks: [live], f: 500 });
      check('I㉓ 배경 탭에서는 「멈췄다」고 하지 않는다 (관제탑 순회 참관이 창을 재사용한다)',
            so(b, 1000) === null && so(b, 1000 + 4000) === null);
    }

    /* ── 음성전용(AAO) «영상 멈춤» 에 양보하는가 (2026-09-11, main 의 PR #929·#932 반영) ──
       ⛔ 그 칸의 멈춤은 «고장» 이 아니라 «일부러» 다. js/idx-vc-qlog.js ⑤ 가 이미
          「📶 영상 멈춤 · 소리 정상 · N초 전」이라고 말하고 있으므로, 우리가 「다시 받는 중」을
          덧붙이면 사실이 아닌 말이 된다.
       ⚠️ «말하지 않는다» 만 두면 «전부 침묵» 도 통과한다 — 짝을 반드시 함께 둔다. */
    {
      const band = mkBox({ uid: 'a1', aaoBand: true, tracks: [live], f: 500 });
      check('I㉗ AAO 멈춤 띠가 붙은 칸에서는 「멈췄다」고 하지 않는다',
            stateOf(band, 1000) === null && stateOf(band, 1000 + 4000) === null);
      const onlyClass = mkBox({ uid: 'a2', aaoOn: true, tracks: [live], f: 500 });
      check('I㉗-2 띠가 아직·이미 없어도 상태 클래스(vc-aao-on)만으로 손을 뗀다',
            stateOf(onlyClass, 1000) === null && stateOf(onlyClass, 1000 + 4000) === null);
      check('I㉗-3 AAO 칸에서는 트랙이 muted 여도 「영상이 안 온다」고 하지 않는다',
            stateOf(mkBox({ uid: 'a3', aaoBand: true, tracks: [{ readyState: 'live', muted: true }] }), 1000) === null);
      const plain = mkBox({ uid: 'a4', tracks: [live], f: 500 });
      check('I㉘ AAO 가 아닌 칸에서는 그대로 말한다 (짝 — 없으면 «전부 침묵» 도 통과한다)',
            stateOf(plain, 1000) === null && stateOf(plain, 1000 + 4000) === 'stall');
    }
  }

  /* ⛔ [id^="vc-video-"] 로 전체를 훑으면 «칸이 아닌» #vc-video-pane·#vc-video-grid 가 걸린다 */
  {
    const tickBody = (() => {
      const i = sec.indexOf('function tick()');
      if (i < 0) return '';
      const s0 = sec.indexOf('{', i);
      let d = 0;
      for (let k = s0; k < sec.length; k++) {
        if (sec[k] === '{') d++;
        else if (sec[k] === '}') { d--; if (!d) return sec.slice(i, k + 1); }
      }
      return '';
    })();
    check('I㉔ tick() 을 잘라 냈다 (전제)', tickBody.length > 0);
    check('I㉕ 칸이 아닌 것을 훑지 않는다 (#vc-video-pane · #vc-video-grid 가 같은 접두사다)',
          tickBody.length > 0 && !/querySelectorAll\('\[id\^="vc-video-"\]'\)/.test(tickBody),
          'idx-main.js 도 같은 함정을 알고 id === \'pane\' 을 따로 거른다(1442행)');
    check('I㉖ 그리드의 «직계 .video-box» 만 훑는다 (정본 vcRemoteBlackWatch 와 같은 방식)',
          /:scope > \.video-box/.test(tickBody));
  }

  /* 화면이 그 파일을 «그 버전으로» 부르고 있는가 — 안 올리면 옛 사본이 캐시에 남는다 */
  check('I⑰ index.html 이 새 버전으로 가드를 싣는다 (immutable 캐시에 옛 사본이 남지 않게)',
        /vc-observe-guard\.js\?v=(\d+)/.test(indexHtml) && Number(RegExp.$1) >= 11,
        'CLAUDE.md — asset_version 원장과 짝');
}

/* ══════════════════════════════════════════════════════════════════════════
   J절 — ⑫ 이름을 «지어낸» 상대의 얼굴 칸은 만들지 않는다   (2026-09-11)
   ⚠️ 문자열로 「그 줄이 있는가」를 보면 아무것도 못 본다 — 함수도 값도 다 «있고»
      틀린 것은 «칸이 생기는가» 뿐이다. 그래서 절을 오려 내 **실제로 돌린다.**
   ⚠️ «안 만든다» 만 검사하면 «전부 안 만들기» 도 통과한다 — 반드시 짝으로 둔다.
   ══════════════════════════════════════════════════════════════════════════ */
{
  console.log('\n── J. 이름 없는 상대의 칸 (⑫절) ──');
  const mi = guard.indexOf('⑫ 이름을 «지어낸»');
  const sec = mi >= 0 ? guard.slice(guard.lastIndexOf('/*', mi)) : '';
  check('J① ⑫절을 오려 냈다 (전제 — 없으면 아래가 통째로 헛돈다)', sec.length > 500);

  /* 가짜 화면에서 절을 실제로 실행한다. 원본 셋은 «불렸는가» 를 기록만 한다. */
  const build = (boxes) => {
    const calls = { ensure: [], add: [], offer: [] };
    const win = {
      vcHandleOffer: (d) => { calls.offer.push(d); return 'orig-offer'; },
      vcEnsureParticipantBox: (id, nm) => { calls.ensure.push([id, nm]); boxes[id] = true; return { id }; },
      vcAddRemoteVideo: (id, nm, st) => { calls.add.push([id, nm, st]); boxes[id] = true; return 'orig-add'; },
    };
    const doc = { getElementById: (x) => (boxes[String(x).replace('vc-video-', '')] ? { id: x } : null) };
    new Function('window', 'document', sec)(win, doc);
    return { win, calls };
  };
  const stream = (live) => ({ getTracks: () => (live ? [{ readyState: 'live' }] : []) });

  /* ⓐ 참관자 — 서버가 이름을 «일부러» 비워 보낸다 */
  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'obs1', fromUsername: '', fromObserver: true });
    const r = win.vcEnsureParticipantBox('obs1', '참가자');
    check('J② 참관자의 칸은 만들지 않는다', r === null && calls.ensure.length === 0);
    check('J③ 그래도 answer 경로(원래 offer 처리)는 그대로 탄다 — 참관을 막는 절이 아니다',
          calls.offer.length === 1);
  }

  /* ⓑ 끊긴 소켓 — 서버가 「참가자」로 채워 보낸다 */
  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'gh1', fromUsername: '참가자' });
    check('J④ 「참가자」로 온 상대의 칸도 만들지 않는다',
          win.vcEnsureParticipantBox('gh1', '참가자') === null && calls.ensure.length === 0);
  }

  /* ⓒ 짝 — 진짜 참가자는 그대로 생겨야 한다 (없으면 «전부 안 만들기» 도 통과한다) */
  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'stu1', fromUsername: '김하늘' });
    check('J⑤ 이름이 있는 상대의 칸은 평소대로 만든다 (짝)',
          win.vcEnsureParticipantBox('stu1', '김하늘') !== null && calls.ensure.length === 1);
  }
  {
    const boxes = {}; const { win, calls } = build(boxes);
    check('J⑥ offer 를 아예 안 받은 id 는 손대지 않는다 (짝)',
          win.vcEnsureParticipantBox('stu2', '이바다') !== null && calls.ensure.length === 1);
  }

  /* ⓓ 짝 — 명단이 진짜 이름을 주면 그 순간 풀린다 */
  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'late1', fromUsername: '참가자' });
    check('J⑦ 먼저 이름 없이 왔어도 명단이 진짜 이름을 주면 칸이 생긴다 (짝)',
          win.vcEnsureParticipantBox('late1', '박서준') !== null && calls.ensure.length === 1);
    check('J⑧ 한 번 풀리면 그 뒤로는 계속 평소대로다',
          win.vcEnsureParticipantBox('late1', '참가자') !== null && calls.ensure.length === 2);
  }

  /* ⓔ 짝 — 영상이 «실제로» 오면 평소대로 */
  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'v1', fromUsername: '참가자' });
    win.vcAddRemoteVideo('v1', '참가자', stream(true));
    check('J⑨ 살아 있는 트랙이 오면 원래 그리기가 그대로 돈다 (짝 — 진짜 사람은 안 사라진다)',
          calls.add.length === 1);
    check('J⑩ 영상이 온 뒤에는 자리 만들기도 다시 열린다',
          win.vcEnsureParticipantBox('v1', '참가자') !== null);
  }
  {
    const boxes = {}; const { win } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'v2', fromUsername: '참가자' });
    win.vcAddRemoteVideo('v2', '참가자', stream(false));   // 빈 스트림
    check('J⑪ 줄 것이 없으면 그리기도 막는다 (offer 경로의 «진짜» 통로가 여기다)',
          win.__vcNamelessPeers.v2 === true && !boxes.v2);
  }

  {
    const boxes = {}; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'obs2', fromUsername: '', fromObserver: true });
    win.vcAddRemoteVideo('obs2', '참가자', stream(false));
    check('J⑪-2 참관자는 그리기 경로로도 칸이 안 생긴다 (⑩절과 이중으로 막는다)',
          calls.add.length === 0 && !boxes.obs2);
  }

  /* ⓕ 이미 생긴 칸은 건드리지 않는다 — 여기는 «안 만드는» 절이지 «지우는» 절이 아니다 */
  {
    const boxes = { old1: true }; const { win, calls } = build(boxes);
    win.vcHandleOffer({ fromUserId: 'old1', fromUsername: '참가자' });
    check('J⑫ 이미 있는 칸은 그대로 둔다 (지우지 않는다)',
          win.vcEnsureParticipantBox('old1', '참가자') !== null && calls.ensure.length === 1);
  }

  /* ⓖ 하면 안 되는 것 — 주석을 벗겨 낸 사본으로 판정한다(자기 주석을 잡지 않게) */
  {
    const bare = sec.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    check("J⑬ vcRemovePeer(id,'left') 를 부르지 않는다 (학생 화면에 「수업이 끝났어요」)",
          !/vcRemovePeer\s*\([^)]*['"]left['"]/.test(bare));
    check('J⑭ 상주 setInterval·MutationObserver 를 두지 않는다 (홈 정지 전력 2회)',
          !/setInterval\s*\(/.test(bare) && !/MutationObserver/.test(bare));
    check('J⑮ ?observe= 로 걸러 «수업 화면에서만 안 도는» 절이 되지 않았다',
          !/observe=/.test(bare),
          '⑩절과 같다 — 이 절은 참관을 «당하는» 쪽에서 돌아야 한다');
    check('J⑯ 서버 파일(공동 금지구역)에 기대지 않는다 — 화면만으로 성립한다',
          /UNKNOWN_NAMES/.test(sec));
  }
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
