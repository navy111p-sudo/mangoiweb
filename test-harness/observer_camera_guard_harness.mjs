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
  // 나가기·채팅은 남아야 한다 — 참관자도 나가야 하고, 보기는 해야 한다
  check('나가기 버튼은 숨기지 않는다', !/vc-dock-leave/.test(guardCode));
  check('채팅 버튼은 숨기지 않는다', !/vc-dock-chat/.test(guardCode));
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

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
