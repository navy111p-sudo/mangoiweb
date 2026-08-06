#!/usr/bin/env node
/**
 * 🔄 수업 중 새로고침 = 그 수업 화면으로 되돌아오기 (2026-08-06 사장님 지시)
 *
 * 사고 내용
 *   사장님: "새로고침하면 홈페이지로 나가는 게 아니라 그 화면 안에서 다시 새로고침이 되게 해줘."
 *
 *   원인 — 로비에서 방 코드를 넣고 들어오면 주소는 그냥 `/` 였다.
 *   즉 «지금 이 방에 있다»는 사실이 주소에도, 저장소에도 아무 데도 없었다.
 *   그래서 새로고침은 «앱을 처음 여는 것»과 완전히 같았고 홈으로 떨어졌다.
 *   (알림톡 `?room=` 링크로 들어온 사람만 우연히 되돌아왔다)
 *
 * 이 하니스가 지키는 것
 *   - 수업에 들어가면 주소(?room=)와 탭 기록(sessionStorage) 두 곳에 방을 남길 것
 *   - 나가면 둘 다 지울 것 (나간 뒤 새로고침은 예전처럼 홈)
 *   - 끝난 수업으로 되돌아가지 않도록 기록에 유효시간이 있을 것
 *   - 아이디/비번을 저장하지 않은 사람도 홈 로그인 정보로 마저 입장할 것
 *   - ↻ 버튼(캐시 삭제)이 sessionStorage 를 비우면서 그 기록까지 날리지 않을 것
 *   - 회의방(?meet=)은 전용 블록 담당 — 여기서 손대지 않을 것
 *
 * ⚠️ 실제 배포되는 index.html 원문을 검사한다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const HTML = readFileSync(join(ROOT, 'cloudflare-deploy/public/index.html'), 'utf8');

const BLOCK = (() => {
  const s = HTML.indexOf('<script id="vc-refresh-stay-in-class">');
  return s < 0 ? '' : HTML.slice(s, HTML.indexOf('</script>', s));
})();

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, ok) => { if (ok) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); } };

console.log('\n════════ 수업 중 새로고침 · 그 화면으로 복귀 ════════\n');

console.log('▶ 1. 블록 존재');
check('① vc-refresh-stay-in-class 블록이 있다', BLOCK.length > 500);

console.log('\n▶ 2. 수업에 들어가면 «어디에 있는지»를 남긴다');
{
  check('② 주소창에 ?room= 을 새로고침 없이 남긴다 (history.replaceState)',
    /searchParams\.set\('room', room\)[\s\S]{0,200}history\.replaceState/.test(BLOCK));
  check('③ 탭 기록(sessionStorage)에도 남긴다', /sessionStorage\.setItem\(KEY/.test(BLOCK));
  check('④ 방 id 는 화면(#vc-room-name)에서 읽는다 (vcRoomId 는 let 이라 window 에 없다)',
    /getElementById\('vc-room-name'\)/.test(BLOCK));
  check('⑤ 관찰 중 꼬리표를 떼어낸다 (관찰자 방 id 오염 방지)', /관찰 중/.test(BLOCK));
  check('⑥ 긴 수업도 «방금까지 수업 중»으로 유지 (주기 갱신)',
    /setInterval\(function\(\)\{ if \(inCall\(\)\) mark\(\); \}/.test(BLOCK));
}

console.log('\n▶ 3. 나가면 지운다 (나간 뒤 새로고침 = 홈)');
{
  check('⑦ 기록 삭제', /sessionStorage\.removeItem\(KEY\)/.test(BLOCK));
  check('⑧ 주소의 room 파라미터도 삭제', /searchParams\.delete\('room'\)/.test(BLOCK));
  check('⑨ body 의 vc-in-call 하나로 들어감/나감을 판정 (퇴장 경로가 여러 갈래)',
    /attributeFilter:\['class'\][\s\S]{0,200}/.test(BLOCK) && /else forget\(\)/.test(BLOCK));
  // vcLeaveRoom 400ms 안전망이 room 파라미터를 보면 location.href='/' 로 튕긴다 → 먼저 지워야 한다
  check('⑩ vcLeaveRoom 안전망의 room 파라미터 검사가 그대로 있다 (지우는 쪽과 짝)',
    /hasRoomParam = \/\[\?&\]\(room\|r\)=\//.test(HTML));
}

console.log('\n▶ 4. 끝난 수업으로 끌려가지 않는다');
{
  check('⑪ 기록에 유효시간(MAX_AGE)이 있다', /MAX_AGE\s*=\s*\d+\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(BLOCK));
  check('⑫ 만료된 기록은 무시하고 지운다', /> MAX_AGE\)\s*\{\s*forget\(\); return; \}/.test(BLOCK));
}

console.log('\n▶ 5. 아이디/비번을 저장 안 한 사람도 마저 입장');
{
  check('⑬ 홈 로그인 정보(mangoi_logged_user)로 이름칸을 채운다',
    /armAutoEnter[\s\S]{0,1400}mangoi_logged_user/.test(BLOCK));
  check('⑭ 비로그인이면 로비에 그대로 둔다 (강제 입장 금지)',
    /raw === 'null'[\s\S]{0,80}clearInterval/.test(BLOCK));
  check('⑮ 이미 입장했으면 두 번 들어가지 않는다 (유령 참가자 방지)',
    /if \(inCall\(\)\) \{ clearInterval\(timer\); return; \}/.test(BLOCK) &&
    /__vcLobbyAutoJoined\) \{ clearInterval\(timer\); return; \}/.test(BLOCK));
  check('⑯ 주소에 ?room= 이 이미 있으면 자기가 또 입장시키지 않는다 (기존 경로에 양보)',
    /if \(urlRoom\) \{[\s\S]{0,200}armAutoEnter\(urlRoom\);\s*return;/.test(BLOCK));
}

console.log('\n▶ 6. ↻ 버튼(캐시 삭제)과의 관계');
{
  check('⑰ 수업 중에는 «이 수업으로 다시 들어갑니다» 로 안내한다 (한/영)',
    /_inCall[\s\S]{0,300}수업 화면으로 다시 들어갑니다[\s\S]{0,200}come back into this class/.test(HTML));
  check('⑱ sessionStorage.clear() 전에 복귀 기록을 백업한다',
    /_rejoin = sessionStorage\.getItem\('mangoi_vc_rejoin'\)/.test(HTML));
  check('⑲ 비운 뒤 복귀 기록을 되돌려 놓는다',
    /if \(_rejoin\) sessionStorage\.setItem\('mangoi_vc_rejoin', _rejoin\)/.test(HTML));
  check('⑳ 새로고침 URL 은 현재 주소를 유지한다 (?room= 이 살아 있어야 복귀됨)',
    /var u = new URL\(window\.location\.href\);[\s\S]{0,120}_cb[\s\S]{0,120}location\.replace/.test(HTML));
}

console.log('\n▶ 7. 회의방(?meet=)은 건드리지 않는다');
{
  check('㉑ meet 파라미터가 있으면 기록도 복귀도 하지 않는다',
    /hasMeetParam\(\)\) return;/.test(BLOCK) && /if \(!inCall\(\) \|\| hasMeetParam\(\)\) return;/.test(BLOCK));
}

console.log(`\n─────────────────────────────────────────────`);
console.log(`  ✅ PASS ${PASS}    ⚠ FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
