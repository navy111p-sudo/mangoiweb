// -*- coding: utf-8 -*-
// ⭐ 사이드바 «자주 쓰는 메뉴»(고정 + 최근 본) 감시 (2026-08-19)
//   실행: node test-harness/sidebar_quickfav_harness.mjs
//
//   배경 — 사용성 점검 2번. 목적지까지 늘 3번 눌러야 했다(그룹 → 자식 → 손자).
//   매일 쓰는 대여섯 개를 3번 → 1번으로 줄이려고 검색창 아래에 «고정 + 최근» 목록을 얹었다.
//   아래 그룹 목록은 그대로 둔다 — 없애는 게 아니라 «위에 한 칸 더하기» 다.
//
//   여기서 못 박는 것은 전부 **이 저장소에서 실제로 밟았던 함정**이다.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const js   = rd('../cloudflare-deploy/public/js/adm-quickfav.js');
const html = rd('../cloudflare-deploy/public/admin.html');
const css  = rd('../cloudflare-deploy/public/css/admin-inline-c.css');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => { if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`); };

console.log('\n════════ ⭐ 자주 쓰는 메뉴 감시 ════════');

console.log('\n[ ① 파일과 등록 ]');
check('adm-quickfav.js 를 읽었다', js.length > 0);
check('admin.html 이 그 파일을 부른다', /adm-quickfav\.js\?v=\d+/.test(html));
check('CSS 규칙이 있다', /#ph85-sidebar \.qf-box\{/.test(css));

console.log('\n[ ② 이동을 «새로 만들지» 않는다 ]');
/* 원본 사이드바 항목을 찾아 .click() 해야 ph97·adm-ia6·adm-r25 가 하던 일
   (카드 열기·스크롤·드로어 닫기·최근 기록)이 그대로 일어난다.
   ⛔ 여기서 location 이나 jumpToMenu 를 직접 부르면 그 셋과 어긋나기 시작한다. */
check('원본 항목을 찾아 그대로 누른다 (el.click())', /el\.click\(\);/.test(js));
check('이동을 직접 만들지 않는다 — location·jumpToMenu 를 부르지 않는다',
  !/location\.(href|assign)/.test(js) && !/jumpToMenu\s*\(/.test(js));
check('접힌 그룹 안이면 먼저 펴 준다 (숨은 요소를 누르면 아무 일도 안 난다)',
  /classList\.contains\('open'\)\)\s*g\.classList\.add\('open'\)/.test(js));

console.log('\n[ ③ 이 저장소의 함정들 ]');
check('리스너가 window 캡처다 — 사이드바에 걸면 ph97 이 삼킨다',
  /window\.addEventListener\('click',[\s\S]*?\}, true\);/.test(js));
/* style.display 로 숨기면 admin.html 의 «강제 visible» 복구 루프가 1.5초 뒤 되살린다.
   메뉴 검색이 그 이유로 오래 고장나 있었다(2026-08-19 수리). 같은 실수를 반복하지 않는다. */
check('숨김을 style.display 로 하지 않는다 (복구 루프에 지는 방식)',
  !/style\.display\s*=/.test(js));
check('숨김은 클래스로 한다 (qf-empty · qf-searching)',
  /qf-empty/.test(js) && /qf-searching/.test(js) &&
  /\.qf-empty[\s\S]{0,80}display:\s*none\s*!important/.test(css));
/* 우리 상자에 .ph85-group/.ph85-sub 이름을 쓰면 그룹 갯수 배지·역할 필터·메뉴 검색이
   이 줄까지 세거나 거른다. 고유 클래스(qf-)만 쓴다. */
check('사이드바 기존 클래스 이름을 재사용하지 않는다',
  !/class="[^"]*ph85-(group|sub)/.test(js));
check('역할로 감춰진 항목은 목록에 넣지 않는다 (눌러도 아무 일 없는 줄 방지)',
  /ia6-role-hide/.test(js) && /rbac-hide/.test(js));
check('다시 그려도 상자를 되살린다 (IA6·ph86·ph118 이 사이드바를 다시 그린다)',
  /__admSettleRun/.test(js) && /getElementById\('qf-box'\)\) run\(\)/.test(js));

console.log('\n[ ④ 사람이 정한 것을 지킨다 ]');
check('고정(★)과 최근을 따로 저장한다', /mangoi_menu_fav/.test(js) && /mangoi_menu_recent/.test(js));
check('localStorage 가 막혀도 죽지 않는다 (사파리 프라이빗 등)',
  /try \{ localStorage\.setItem/.test(js) && /catch \(e\) \{/.test(js));
check('고정한 것은 최근 목록에 겹쳐 나오지 않는다',
  /favs\.indexOf\(k\) < 0/.test(js));
check('처음 쓰는 사람에게 빈 상자를 보이지 않는다',
  /qf-empty', favs\.length === 0 && recents\.length === 0/.test(js));

console.log('\n[ ⑤ 📱 손가락 크기 ]');
/* 보고서 4번과 같은 규칙 — 보이는 모양은 작아도 «누르는 범위» 는 44px. */
check('휴대폰에서 ★ 버튼의 누르는 범위가 44px 다',
  /@media \(max-width: 1023px\)[\s\S]{0,320}\.qf-star\{[^}]*width:\s*44px/.test(css));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
