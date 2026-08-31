/**
 * monitor_wall_harness.mjs — 🗼 수업 관제탑(/admin/monitor-wall.html) 회귀 감시 (2026-08-27)
 *
 * 왜 필요한가
 *   사장님 지시 「관리자가 전체 상황을 한눈에 + 최대한 가볍게 + 수업에 문제 없게」.
 *   이 화면의 가치는 «가벼움» 과 «수업 무영향» 이라, 그 두 성질이 조용히 무너지는 것을 잡는다:
 *   ① 무거워지는 방향(파일 비대·admin/ 밑 정적자산·새 API) ② 수업에 영향 주는 방향
 *   (상시 영상·폴링 미정지) ③ 과거에 실제로 밟은 함정들(오클릭·data-ko 갈아끼우기·404 위장).
 *
 * ⚠️ 부정 검사는 주석을 벗겨 낸 사본으로 한다(CLAUDE.md 2장 — 자기 주석을 잡는 함정).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'cloudflare-deploy', 'public');
const FILE = join(PUB, 'admin', 'monitor-wall.html');
const html = readFileSync(FILE, 'utf8');
const adminHtml = readFileSync(join(PUB, 'admin.html'), 'utf8');

/* 주석 제거 사본 — HTML 주석 + JS 블록/줄 주석 */
const strip = t => t
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^[ \t]*\/\/.*$/gm, '')
  .replace(/^[ \t]*\/\* .*$/gm, '');
const bare = strip(html);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
const no = (m) => { fail++; console.log(`  ❌ ${m}`); };
const check = (m, cond) => cond ? ok(m) : no(m);

console.log('monitor_wall_harness — 관제탑이 «가볍고, 수업에 무해하게» 남아 있는가');

/* ── ① 경량 — 한 파일 상한. 넘으면 «별도 화면으로 뺀 이유» 가 무너진 것 ── */
{
  const kb = statSync(FILE).size / 1024;
  check(`① 파일 한 개 40KB 이하 (실측 ${kb.toFixed(1)}KB) — admin.html 1.3MB 에 얹지 않는 설계의 핵심`, kb <= 40);
}

/* ── ② /admin/ 밑에 정적자산(js·css)을 만들지 않았는가 — index.ts isAdminPath 주석의 규칙.
       어기면 로그인 게이트가 그 자산 요청을 막아 «화면이 조용히 반쪽» 이 된다 ── */
{
  const nonHtml = readdirSync(join(PUB, 'admin')).filter(f => !/\.html$/i.test(f));
  check(`② public/admin/ 밑은 .html 뿐 (비-html: ${nonHtml.length}건)`, nonHtml.length === 0);
}

/* ── ③ 새 API 0개 — 기존 관문에 이미 등록된 경로만 부른다.
       모르는 /api/ 경로가 생기면 관문 3곳 등록 누락 → «자료가 없습니다» 위장 404 코스 ── */
{
  const ALLOW = new Set([
    '/api/active-rooms', '/api/admin/classes-now', '/api/admin/alerts',
    '/api/admin/live-classes', '/api/admin/ghost/start',
    /* 2026-08-30 2차 — 셋 다 «이미 있는» 경로다(새 경로가 아니다):
       · vc/quality  는 기존 엔드포인트에 live=1 모드만 더한 것 (/api/admin/vc/ 는 관문 3곳에 등록됨)
       · room/…/force-end 는 admin.html 의 «강제 종료» 가 쓰던 그 API
       · turn-config 는 로그인 없이 열려 있는 공개 경로 (헤더로 중계 상태만 읽는다) */
    '/api/admin/vc/quality', '/api/admin/room/', '/api/turn-config'
  ]);
  const used = [...new Set((bare.match(/\/api\/[a-z0-9\-\/]+/gi) || []))];
  const unknown = used.filter(u => ![...ALLOW].some(a => u === a || u.startsWith(a + '?')));
  check(`③ 부르는 API 가 전부 기존 5개 안 (사용 ${used.length}종, 미등록 ${unknown.length}건${unknown.length ? ': ' + unknown.join(', ') : ''})`,
        used.length > 0 && unknown.length === 0);
}

/* ── ④ 폴링이 «탭이 숨겨지면» 멈추는가 — 하루 종일 켜 놔도 부담 없게 한 약속 ── */
check('④ setInterval 틱이 document.hidden 을 확인한다',
      /function tick\(\)\{ if \(!document\.hidden\) load\(\); \}/.test(bare) && /setInterval\(tick/.test(bare));
check('④-2 탭이 돌아오면 즉시 갱신한다 (visibilitychange)',
      /visibilitychange/.test(bare) && /if \(!document\.hidden\) load\(\)/.test(bare));

/* ── ⑤ 상시 영상 금지 — 참관은 «클릭했을 때만» /?observe= 새 탭.
       <video>·getUserMedia·RTCPeerConnection 이 이 화면에 생기면 설계가 무너진 것 ── */
check('⑤ 화면 안에 상시 영상 요소가 없다 (video/getUserMedia/RTCPeerConnection 0건)',
      !/<video|getUserMedia|RTCPeerConnection/i.test(bare));
check('⑤-2 참관은 /?observe= 경로 (ghost-view.html?room= 빈 화면 함정 아님)',
      /\/\?observe=/.test(bare) && !/ghost-view\.html\?room=/.test(bare));
check('⑤-3 직접 입장은 카메라 꺼짐 + 확인창 (학생에게 보이므로)',
      /vc_cam=off/.test(bare) && /confirm\(/.test(bare));

/* ── ⑥ 오클릭 방지 — 2026-08-12 «자동 갱신이 조준한 행을 갈아치우던» 사고의 재발 방지 ── */
check('⑥ 마우스가 표 위에 있는 동안 재렌더하지 않는다 (pointerenter/leave + hoverGrid)',
      /pointerenter/.test(bare) && /pointerleave/.test(bare) && /hoverGrid/.test(bare));
check('⑥-2 클릭은 위임으로 «클릭된 요소» 의 data-room 을 읽는다',
      /closest\('\[data-room\]'\)/.test(bare) && /getAttribute\('data-room'\)/.test(bare));

/* ── ⑦ 404 위장 함정 — 판정은 «성공이라고 말했는가»(ok === true) ── */
check('⑦ classes-now 판정이 ok === true (undefined === false 통과 함정 회피)',
      /cn\.ok === true/.test(bare));

/* ── ⑧ i18n 갈아끼우기 함정 — JS 가 그리는 화면이라 data-ko/data-en 을 아예 안 쓴다 ── */
check('⑧ monitor-wall 에 data-ko/data-en 이 없다 (본문 갈아끼우기 함정)',
      !/data-ko|data-en/.test(bare));

/* ── ⑨ 표현 규칙 — «접속 기록 없음» 이라고만 말하고 «미접속» 으로 단정하지 않는다 ── */
check('⑨ «접속 기록 없음» 사용, «미접속» 단정 없음',
      /접속 기록 없음/.test(bare) && !/미접속/.test(bare));

/* ── ⑩ <style> 안에 CJK 홑낫표·전각이 없다 (983KB 한자 폰트 검사 함정) ── */
{
  const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('');
  check('⑩ <style> 안에 홑낫표(U+300C/D)가 없다', !/[「」]/.test(styles));
}

/* ── ⑪ 진입 링크 — admin.html 수업 관찰 카드에서 새 탭으로 연다 ── */
check('⑪ admin.html 에 관제탑 진입 링크가 있다 (href="/admin/monitor-wall.html")',
      /href="\/admin\/monitor-wall\.html"/.test(adminHtml));

/* ═══ 2026-08-30 2차 (사장님 「STEP 1 + 순회 참관」) ═══════════════════════ */

/* ── ⑫ 보다 「개설된 룸 목록」에서 가져온 것 — 검색·정렬·자동 새로고침 주기 ── */
check('⑫ 검색칸·정렬·자동 새로고침 주기 셀렉트가 있다',
      /id="q"/.test(html) && /id="sel-sort"/.test(html) && /id="sel-poll"/.test(html));
check('⑫-2 «안함»(0초)을 고르면 폴링 타이머를 걸지 않는다',
      /var ms = pollMs\(\);[\s\S]{0,80}?if \(ms\) timer = setInterval\(tick, ms\);/.test(bare));
check('⑫-3 표는 가로 스크롤 상자 안에 있다 (좁은 화면에서 문서가 옆으로 밀리지 않게)',
      /class="tablewrap"/.test(html) && /\.tablewrap\{[^}]*overflow-x:auto/.test(html));

/* ── ⑬ 순회 참관 — 창 하나를 재사용한다.
       🔴 noopener 를 주면 window.open 이 «null 을 돌려주도록» 표준에 정해져 있어,
          창은 열리는데 주소를 바꿀 손잡이가 없어진다 → 순회가 통째로 죽는다(에러도 없다). ── */
check('⑬ 순회용 창은 이름 있는 창으로 열고 noopener 를 주지 않는다',
      /window\.open\('about:blank', 'mangoiObserveRotate'\)/.test(bare)
      && !/openTab\('about:blank'\)/.test(bare));
check('⑬-2 방을 옮길 때마다 참관 기록을 남긴다 (기록 없이 들어가는 길을 만들지 않는다)',
      /function rotHop[\s\S]{0,600}?logObserve\(rot\.room/.test(bare));
check('⑬-3 사람이 그 창을 닫으면 순회가 멈춘다 (rot.win.closed 확인)',
      /rot\.win\.closed/.test(bare));
check('⑬-4 머물기·다음·정지 조작이 있다',
      /rb-hold/.test(bare) && /rb-next/.test(bare) && /rb-stop/.test(bare));
{
  /* 간격 최솟값 — 옮길 때마다 수업 화면을 새로 여느라 몇 초 걸린다. 너무 짧으면 로딩만 하다 끝난다 */
  const dwell = (html.match(/<select id="sel-dwell">[\s\S]*?<\/select>/) || [''])[0];
  const vals = [...dwell.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
  check(`⑬-5 순회 간격 최솟값이 15초 이상 (실측 ${vals.length ? Math.min(...vals) : '없음'}초)`,
        vals.length > 0 && Math.min(...vals) >= 15);
}

/* ── ⑭ 강제 종료 — 되돌릴 수 없는 조작이라 확인창 + 사유 두 단계 ── */
check('⑭ 강제 종료가 확인창과 사유 입력을 모두 거친다',
      /function endRoom[\s\S]{0,900}?confirm\(/.test(bare) && /function endRoom[\s\S]{0,900}?prompt\(/.test(bare));
check('⑭-2 강제 종료 성공 판정이 HTTP 상태와 ok 를 함께 본다 (404 위장 함정)',
      /!x\.r\.ok \|\| x\.b\.ok === false/.test(bare));

/* ── ⑮ 강사 차단 — 사이드바 href 항목은 역할 필터를 못 받으므로 화면이 스스로 막는다 ── */
check('⑮ classes-now 가 forbidden_teacher 면 목록을 그리지 않는다',
      /forbidden_teacher/.test(bare) && /state\.rooms = state\.forbidden \? \[\] : rooms/.test(bare));

/* ── ⑯ 입구 — 급할 때 어느 쪽에서 출발해도 닿아야 한다(카드 2곳 + 사이드바 + 자주 쓰는 기능) ── */
{
  const ia6 = readFileSync(join(PUB, 'js', 'adm-ia6.js'), 'utf8');
  const qa  = readFileSync(join(PUB, 'js', 'adm-quick-access.js'), 'utf8');
  const inAdmin = (adminHtml.match(/\/admin\/monitor-wall\.html/g) || []).length;
  check(`⑯ admin.html 안 입구 2곳 이상 (수업 관찰 카드 + 실시간 수업 현황 카드, 실측 ${inAdmin}곳)`, inAdmin >= 2);
  check('⑯-2 사이드바(adm-ia6.js)에 관제탑 항목이 있다', /monitor-wall\.html/.test(ia6));
  check('⑯-3 ⚡ 자주 쓰는 기능(adm-quick-access.js)에 관제탑 칸이 있다', /monitor-wall\.html/.test(qa));
}

/* ── ⑰ 회선 신호등 — 표본이 없을 때 «0%» 로 적지 않는다.
       0 으로 적으면 영상이 죽은 방이 «회선이 제일 좋은 방» 이 된다(CLAUDE.md 2장) ── */
check('⑰ 회선 표본이 없으면 «—» 로 둔다 (0 으로 채우지 않는다)',
      /if \(!q\) return '<span style="color:var\(--muted\)">—<\/span>'/.test(bare));
{
  const api = readFileSync(join(PUB, '..', 'src', 'api-admin.ts'), 'utf8');
  check('⑰-2 서버 집계가 음수 손실(영상 없던 틱)을 평균에서 뺀다 (avg_loss >= 0)',
        /live[\s\S]{0,900}?avg_loss >= 0/.test(api));
}

console.log(`\n  결과: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
