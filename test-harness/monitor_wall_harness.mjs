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
    '/api/admin/live-classes', '/api/admin/ghost/start'
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

console.log(`\n  결과: PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
