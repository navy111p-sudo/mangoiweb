/**
 * 💬 채팅 안전지대 가드 (2026-08-10)
 *
 * 무엇을 지키는가 — 「떠 있는 영상창이 채팅창을 가려서 강사가 학생 메시지를 못 봤다」
 * 는 사고의 재발 방지. 브라우저 없이 «불변식» 만 검사한다(그래서 --fast 에서도 돈다).
 *
 *  1. 안전지대 블록(#vc-chat-clearzone-css + 비켜서기 스크립트)이 살아 있는가
 *  2. 채팅 패널 z-index 가 떠 있는 창들(.vc-pip-overlay / .vp-floating)보다 «높은가»
 *     → 누가 나중에 PIP z-index 를 올리면 여기서 잡힌다
 *  3. 비켜서기 대기시간이 채팅 패널 «슬라이드 시간»보다 긴가
 *     → 실제로 이걸 어겨서 한 번 안 먹었다. 60ms 에 재면 패널이 아직 화면 밖이다
 *  4. 하단 컨트롤 독(#vc-dock)은 «절대» 안 밀린다는 예외가 남아 있는가
 *  5. 사람이 직접 옮긴 창은 되돌리지 않는다는 유예가 남아 있는가
 *
 * 실행: node test-harness/vc_chat_clearzone_harness.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'cloudflare-deploy', 'public', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');

let fail = 0;
function chk(name, ok, extra) {
  if (ok) console.log('✅ ' + name);
  else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

// ── 블록 추출 ──────────────────────────────────────────────
const cssStart = html.indexOf('<style id="vc-chat-clearzone-css">');
const block = cssStart < 0 ? '' : html.slice(cssStart, html.indexOf('</script>', cssStart));

chk('1. 안전지대 블록이 index.html 에 있다', cssStart >= 0);
chk('1b. 비켜서기(dodge)·원복(restore) 둘 다 있다',
  /function\s+dodge\s*\(/.test(block) && /function\s+restore\s*\(/.test(block));

// ── z-index 불변식 ────────────────────────────────────────
function zOf(selectorLiteral) {
  // "selectorLiteral" 이 나온 뒤 첫 z-index 값
  const i = html.indexOf(selectorLiteral);
  if (i < 0) return null;
  const m = /z-index:\s*(\d+)/.exec(html.slice(i, i + 900));
  return m ? Number(m[1]) : null;
}
const zChat = zOf('#vc-chat-panel.chat-panel {');
const zPip = zOf('.vc-pip-overlay {');
const zMini = zOf('.vp-floating {');

chk('2a. 채팅 패널(데스크톱) z-index 를 읽을 수 있다', zChat != null, 'null');
chk('2b. 채팅 > 📌PIP 오버레이', zChat != null && zPip != null && zChat > zPip, `chat=${zChat} pip=${zPip}`);
chk('2c. 채팅 > 미니 플레이어', zChat != null && zMini != null && zChat > zMini, `chat=${zChat} mini=${zMini}`);

// ── 타이밍 불변식 ─────────────────────────────────────────
// .chat-panel { transition: transform 0.3s ease; }  vs  sync 기본 대기
const trM = /\.chat-panel\s*\{[^}]*transition:\s*transform\s*([\d.]+)s/.exec(html);
const slideMs = trM ? Math.round(parseFloat(trM[1]) * 1000) : null;
const dlM = /delay\s*==\s*null\s*\?\s*(\d+)\s*:\s*delay/.exec(block);
const waitMs = dlM ? Number(dlM[1]) : null;

chk('3a. 채팅 패널 슬라이드 시간을 읽을 수 있다', slideMs != null, 'null');
chk('3b. 비켜서기 기본 대기를 읽을 수 있다', waitMs != null, 'null');
chk('3c. 대기(≥슬라이드+50ms) — 패널이 다 들어온 뒤에 잰다',
  slideMs != null && waitMs != null && waitMs >= slideMs + 50, `slide=${slideMs}ms wait=${waitMs}ms`);
chk('3d. transitionend 로도 한 번 더 확인한다', /transitionend/.test(block));

// ── 안 건드리는 것들 ──────────────────────────────────────
chk('4. 하단 컨트롤 독(#vc-dock)은 비켜서기 대상에서 제외', /vc-dock/.test(block));
chk('5. 사람이 방금 만진 창은 안 옮긴다(pointerdown 유예)',
  /pointerdown/.test(block) && /USER_GRACE/.test(block));
chk('6. 전체화면 오버레이·큰 판때기는 안 옮긴다(0.8 / 0.6 가드)',
  /innerWidth\s*\*\s*0\.8/.test(block) && /innerHeight\s*\*\s*0\.6/.test(block));
chk('7. 채팅을 닫으면 원위치(transform 원복)', /m\.el\.style\.transform\s*=\s*m\.prev/.test(block));

console.log(fail === 0 ? '\n🎉 채팅 안전지대 가드 통과' : `\n⚠ 실패 ${fail}건`);
process.exit(fail === 0 ? 0 : 1);
