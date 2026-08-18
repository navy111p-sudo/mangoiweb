// -*- coding: utf-8 -*-
// 🧭 사이드바 «손자 메뉴» 가 거짓말하지 않는지 감시 (2026-08-18)
//   실행: node test-harness/admin_grandchild_menu_harness.mjs
//
//   배경 —
//     사이드바 3단계(「학생 명부 ▸」 를 펴면 나오는 목록)는 adm-r25.js(ph125)의 MAP 이 그린다.
//     그런데 그 MAP 머리말이 스스로 «데모 매핑» 이라고 적어 두었다 —
//     카드에 그런 칸이 없어도 **메뉴가 비어 보이지 않게 이름만 지어 넣은 것**이다.
//     그래서 이름과 실제로 열리는 칸이 어긋나 있었다(2026-08-18 사장님 지적):
//       「2 학생 상세 프로필」을 누르면 실제로는 「⏰ 만료 임박 학생」이 열렸다.
//       옛 방식이 «카드 안 N번째 details» 로 점프하기 때문인데, 에러가 안 나서 죽은 줄도 몰랐다.
//
//   그래서 무엇을 지키나 —
//     ① 객체 형태({ko,en,anchor/card})가 가리키는 id 가 admin.html 에 **실제로 있는가**.
//        한쪽만 고치면 조용히 «카드 전체만 반짝» 으로 되돌아간다. 화면엔 에러가 안 뜬다.
//     ② 「학생 명부」는 지어낸 이름으로 되돌아가지 않았는가(문자열 목록 금지).
//     ③ 손자 메뉴를 실제로 그리는 파일이 adm-r25.js 하나인가 —
//        adm-q11.js 에 같은 이름의 죽은 매핑이 한 벌 더 있어서, 그쪽을 고치고
//        «고쳤다» 고 착각하는 사고를 막는다(그 파일의 flyout 은 `return;` 으로 막혀 있다).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const r25  = rd('../cloudflare-deploy/public/js/adm-r25.js');
const q11  = rd('../cloudflare-deploy/public/js/adm-q11.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
};

console.log('\n════════ 사이드바 손자 메뉴 감시 ════════');

console.log('\n[ ① 가리키는 곳이 실제로 있는가 ]');
check('adm-r25.js 를 읽었다', r25.length > 0);
check('admin.html 을 읽었다', html.length > 0);

const anchors = [...r25.matchAll(/anchor:\s*'([^']+)'/g)].map((m) => m[1]);
const cards   = [...r25.matchAll(/card:\s*'([^']+)'/g)].map((m) => m[1]);
check(`anchor 를 하나 이상 쓰고 있다 (${anchors.length}개)`, anchors.length > 0);

const missingAnchor = anchors.filter((a) => !html.includes(`id="${a}"`));
check(`anchor 가 가리키는 id 가 admin.html 에 전부 있다${missingAnchor.length ? ' — 없는 것: ' + missingAnchor.join(', ') : ''}`,
  missingAnchor.length === 0);

const missingCard = cards.filter((c) => !html.includes(`id="${c}"`));
check(`card 가 가리키는 id 가 admin.html 에 전부 있다${missingCard.length ? ' — 없는 것: ' + missingCard.join(', ') : ''}`,
  missingCard.length === 0);

console.log('\n[ ② 「학생 명부」가 지어낸 이름으로 되돌아가지 않았다 ]');
const smBlock = (r25.match(/'card-students-mgmt':\s*\[([\s\S]*?)\n\s*\],/) || [])[1] || '';
check('card-students-mgmt 항목을 찾았다', smBlock.length > 0);
check('객체 형태({ko,…})로 적혀 있다 — 문자열 목록으로 되돌리면 이름이 다시 어긋난다',
  /\{\s*ko:/.test(smBlock));
// 옛 «데모» 이름들이 되살아나지 않았는지. 카드 안에 그런 칸이 없어서 전부 엉뚱한 곳이 열렸다.
for (const ghost of ['학생 상세 프로필', '학생 그룹 관리', '학년별 통계', '비활성 학생']) {
  check(`지어낸 이름이 되살아나지 않았다 — 「${ghost}」`, !smBlock.includes(ghost));
}
const smAnchors = [...smBlock.matchAll(/anchor:\s*'([^']+)'/g)].map((m) => m[1]);
check(`항목마다 갈 곳이 있다 (anchor ${smAnchors.length}개 / 항목 ${(smBlock.match(/\{\s*ko:/g) || []).length}개)`,
  smAnchors.length > 0 && smAnchors.length === (smBlock.match(/\{\s*ko:/g) || []).length);

console.log('\n[ ③ 실제로 그리는 파일은 adm-r25.js 하나 ]');
check('adm-r25.js 가 손자 메뉴를 그린다 (ph125Build)', /function ph125Build\s*\(/.test(r25));
check('adm-q11.js 의 플라이아웃은 여전히 막혀 있다 (`return;`)',
  /function showFlyoutV2[\s\S]{0,400}?\breturn;/.test(q11));
check('adm-q11.js 에 «여기는 죽은 매핑» 표지가 남아 있다 — 엉뚱한 파일을 고치는 사고 방지',
  q11.includes('adm-r25.js') && /죽어 있다|죽은 매핑/.test(q11));

console.log('\n[ ④ 캐시 번호 ]');
check('admin.html 의 adm-r25.js 버전이 9 이상',
  (() => { const m = html.match(/adm-r25\.js\?v=(\d+)/); return m && Number(m[1]) >= 9; })());

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
