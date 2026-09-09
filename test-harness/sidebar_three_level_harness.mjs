// -*- coding: utf-8 -*-
// 🪜 사이드바가 «메뉴 ▸ 자식 ▸ 손자» 3단을 **모든 항목에서** 유지하는지 감시 (2026-08-19)
//   실행: node test-harness/sidebar_three_level_harness.mjs
//
//   배경 —
//     2026-08-19 사장님: 「자식 메뉴를 누르면 손자가 나오게. 모든 메뉴를 정산·매출처럼」
//     그때까지 43개 항목 중 7개가 손자 없는 «2단짜리» 였다.
//       · 잎 항목 5개(대표지사·지사·대리점·본사 관리·지사 정산) — 손자를 «일부러» 안 만들었다.
//         카드 «전체» 를 읽으면 넷이 똑같은 4줄을 보여 줬기 때문이다(2026-08-18 「중복」 지적).
//         → 이제 카드가 아니라 **그 칸 안**(scanLeaf)만 읽는다. 칸마다 안이 다르니 안 겹친다.
//       · 딴 페이지로 가는 항목 2개(수업 길이 변경·수강 운영) — 손자를 만들 재료가
//         이 화면에 없다(다른 문서다). → 그 페이지의 «구역 이름» 을 adm-ia6.js 에 적고
//         주소 뒤 #id 로 간다. **손으로 적은 목록이라 여기서 파일을 열어 대조한다.**
//
//   무엇을 지키나 —
//     ① 모든 항목이 갈 곳(cards/href)을 갖는다. href 항목은 손자 목록(secs)까지 갖는다.
//     ② secs 의 id 가 그 파일에 **진짜로 있다** — 없으면 눌러도 페이지 맨 위만 열린다(에러 0).
//     ③ 잎 항목이 가리키는 칸이 admin.html 에 있고, 그 칸 안에 손자가 될 «이름표» 가 있다.
//     ④ adm-r25.js 가 잎 손자(scanLeaf)와 «자식 클릭으로 열기» 를 잃지 않았다.
//     ⑤ 📱 「손자를 펴는 중이면 드로어를 닫지 않는다」 표시가 **네 곳에서 짝이 맞는다**.
//        세우는 곳 adm-r25.js · 읽는 곳 adm-s11.js · adm-ia6.js · admin.html.
//        한쪽만 고치면 휴대폰에서 손자가 «떴다가 바로 사라진다».
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const html = rd('../cloudflare-deploy/public/admin.html');
const ia6 = rd('../cloudflare-deploy/public/js/adm-ia6.js');
const r25 = rd('../cloudflare-deploy/public/js/adm-r25.js');
const s11 = rd('../cloudflare-deploy/public/js/adm-s11.js');

let PASS = 0, FAIL = 0; const FAILS = [];
const check = (name, cond) => {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
};

console.log('\n════════ 사이드바 3단 메뉴 감시 ════════');

console.log('\n[ ① 모든 항목이 갈 곳을 갖는다 ]');
check('adm-ia6.js 를 읽었다', ia6.length > 0);
check('adm-r25.js 를 읽었다', r25.length > 0);

/* GROUPS 의 항목 한 줄씩 — `{ ko: '…', en: '…', … }` 형태. 줄 단위로 읽는다
   (JS 를 실행하지 않는다: 하니스가 화면 스크립트를 부트하면 그것대로 또 깨진다). */
/* ⚠️ 손자 목록(secs)의 줄도 `{ ko: …` 로 시작한다. 그것들은 `id:` 를 갖고 항목은 안 갖는다 —
   구분하지 않으면 손자를 «갈 곳 없는 항목» 으로 오해해 FAIL 이 난다(처음에 실제로 밟았다). */
const itemLines = [...ia6.matchAll(/^\s*\{ ko: '((?:[^'\\]|\\.)*)',[^\n]*$/gm)]
  .map((m) => ({ ko: m[1], line: m[0] }))
  .filter((it) => !/\bid:\s*'/.test(it.line));
check(`사이드바 항목을 읽었다 (${itemLines.length}개)`, itemLines.length >= 40);

const noTarget = itemLines.filter((it) => !/cards:\s*\[/.test(it.line) && !/href:\s*'/.test(it.line));
check(`갈 곳(cards/href)이 없는 항목이 없다${noTarget.length ? ' — ' + noTarget.map((x) => x.ko).join(', ') : ''}`,
  noTarget.length === 0);

/* href 항목은 «딴 페이지» 라 손자를 화면에서 읽을 수 없다 → secs 가 반드시 있어야 3단이 된다.
   한 덩어리 = `{ ko: '…' … href: '…'` 부터 그 항목이 닫히는 `] },` 까지.
   ⚠️ secs 는 여러 줄이라 «항목 줄» 만 봐서는 보이지 않는다. */
const hrefItems = [...ia6.matchAll(/\{ ko: '((?:[^'\\]|\\.)*)',[^\n]*href: '([^']+)',?([\s\S]{0,1200}?)(?:\n\s*\] \},|\n\s*\},)/g)]
  .map((m) => ({ ko: m[1], href: m[2], body: m[3] || '' }));
check(`딴 페이지로 가는 항목을 찾았다 (${hrefItems.length}개)`, hrefItems.length >= 2);
for (const it of hrefItems) {
  check(`「${it.ko}」 — 손자 목록(secs)이 있다`, /secs:\s*\[/.test(it.body));
}

console.log('\n[ ② 손자가 가리키는 구역이 그 파일에 진짜로 있다 ]');
for (const it of hrefItems) {
  const page = it.href.split('#')[0].replace(/^\//, '');
  const src = rd('../cloudflare-deploy/public/' + page);
  check(`${page} 를 읽었다`, src.length > 0);
  const ids = [...it.body.matchAll(/id:\s*'([^']+)'/g)].map((m) => m[1]);
  check(`「${it.ko}」 — 구역을 하나 이상 적었다 (${ids.length}개)`, ids.length > 0);
  /* 구역을 가리키는 방법은 두 가지다 —
       · id="…"    보통 화면. 브라우저가 #해시로 알아서 스크롤한다
       · data-t="…" 탭 하나만 그리는 화면(enroll-ops.html). 그 파일이 해시를 보고 탭을 켠다 */
  const missing = ids.filter((id) => !src.includes(`id="${id}"`) && !src.includes(`data-t="${id}"`));
  check(`「${it.ko}」 — 적어 둔 구역이 ${page} 에 전부 있다${missing.length ? ' — 없는 것: ' + missing.join(', ') : ''}`,
    missing.length === 0);
}
check('enroll-ops.html 이 주소 뒤 #탭이름을 본다 (applyHashTab)',
  /function applyHashTab/.test(rd('../cloudflare-deploy/public/enroll-ops.html')));

console.log('\n[ ③ 잎 항목의 칸과 그 안 이름표 ]');
const leafIds = [...ia6.matchAll(/openSub:\s*'([^']+)'/g)].map((m) => m[1]);
check(`잎 항목(카드 안 한 칸을 가리키는 것)을 찾았다 (${leafIds.length}개)`, leafIds.length >= 4);
const leafMissing = leafIds.filter((id) => !html.includes(`id="${id}"`));
check(`잎이 가리키는 칸이 admin.html 에 전부 있다${leafMissing.length ? ' — 없는 것: ' + leafMissing.join(', ') : ''}`,
  leafMissing.length === 0);
/* 그 칸 «안» 에 손자가 될 것이 있어야 3단이 된다. 이름표(data-gc)를 그 구역 옆에 단다 —
   목록을 딴 파일에 적으면 화면이 바뀔 때 조용히 어긋난다(CLAUDE.md 2장). */
for (const label of ['🏛️ 대표지사 목록', '🏢 지사 목록', '🔎 지사 소속 대리점 찾기',
  '🏪 대리점 목록', '🏯 본사 목록', '💰 이번 달 요약', '🏢 지점별 정산 카드', '📊 지점별 매출 비교']) {
  check(`이름표가 admin.html 에 남아 있다 — 「${label}」`, html.includes(`data-gc="${label}"`));
}

console.log('\n[ ④ 손자를 만드는 코드가 되돌아가지 않았다 ]');
check('잎 안을 읽는다 (scanLeaf)', /function scanLeaf\s*\(/.test(r25));
check('잎에서 손자를 포기하지 않는다 — data-ia6-sub 를 보고 그 칸 «안» 을 읽는다',
  /data-ia6-sub[\s\S]{0,220}scanLeaf/.test(r25));
check('딴 페이지 구역을 손자로 만든다 (itemsFromSecs · data-ia6-secs)',
  /function itemsFromSecs\s*\(/.test(r25) && /data-ia6-secs/.test(r25));
check('adm-ia6.js 가 그 목록을 DOM 에 실어 준다 (data-ia6-secs)', /setAttribute\('data-ia6-secs'/.test(ia6));
check('자식 메뉴를 «눌러서» 손자를 열고, 다시 누르면 접는다 (openGc 여닫이)', /function openGc\s*\(/.test(r25));
/* ⚠️ «리스너 시작부터 훑는» 정규식은 쓰지 않는다 — 사이 어딘가에 window 리스너를 하나만 더
   넣어도(2026-08-19 그룹 접기 리스너) 엉뚱한 리스너를 물어 FAIL 난다.
   지키려는 것은 «자식 클릭이 여닫이로 열고, 그 리스너가 캡처다» 이므로 끝쪽만 본다. */
check('자식 클릭이 손자를 여닫는다 (openGc 여닫이)', /openGc\(sub, true\);/.test(r25));
check('그 리스너가 window 캡처다 — 사이드바에 걸면 ph97 이 삼킨다',
  /openGc\(sub, true\);[\s\S]{0,120}?\}, true\);/.test(r25));
check('그룹이 접혀 손자가 사라지지 않게 지킨다 (keepGroupOpen)', /function keepGroupOpen\s*\(/.test(r25));
/* 🔁 2026-08-19 사장님 「손자 메뉴도 다시 누르면 접히게」. 손자는 마지막 단계라 사이드바 안에는
   접을 것이 없어서, «본문의 그 칸» 을 접는다 — 그룹·자식과 규칙이 이어진다.
   ⚠️ «같은 손자를 연속으로» 누른 경우만 접는다(lastGo.desc === desc). 그 조건을 지우면
      다른 데를 보다가 돌아와 누른 것까지 접혀 「보러 왔는데 닫힌다」가 된다. */
check('같은 손자를 다시 누르면 본문의 그 칸이 접힌다 (lastGo)',
  /var lastGo = null;/.test(r25) &&
  /lastGo\.desc === desc[\s\S]{0,260}?prev\.open = false;/.test(r25));
check('다른 손자·딴 페이지·함수형은 접기 대상이 아니다 — 기억을 지운다',
  (r25.match(/lastGo = null;/g) || []).length >= 3);

console.log('\n[ ⑤ «방금 폈다» 표시가 다섯 곳에서 짝이 맞는다 ]');
/* 한쪽만 고치면 —
     📱 휴대폰: 손자가 떴다가 드로어와 함께 바로 사라진다
     🔗 딴 페이지 항목: 손자를 볼 새도 없이 페이지가 바뀐다
   둘 다 «에러 없이 안 보이는» 종류라 여기서 못 박는다. */
check('세우는 곳 — adm-r25.js 가 표시를 남긴다',
  /__ph125OpenedEl\s*=\s*sub/.test(r25) && /__ph125OpenedUntil\s*=\s*Date\.now\(\)/.test(r25));
check('거두는 곳 — closeDrawer 가 표시를 지운다 (손자로 갈 때는 닫아야 한다)',
  /function closeDrawer\(\)\{[\s\S]{0,220}__ph125OpenedUntil\s*=\s*0/.test(r25));
check('읽는 곳 ① adm-s11.js(ph97) — 📱 드로어를 닫지 않는다', /__ph125OpenedUntil > Date\.now\(\)/.test(s11));
check('읽는 곳 ② adm-ia6.js — 📱 드로어를 닫지 않는다', /__ph125OpenedUntil > Date\.now\(\)/.test(ia6));
check('읽는 곳 ③ admin.html 의 pointerdown 자동닫기', /__ph125OpenedUntil > Date\.now\(\)/.test(html));
check('읽는 곳 ④ adm-ia6.js — 딴 페이지 항목은 첫 누름에 이동하지 않는다',
  /data-ia6-secs'\)\s*&&\s*window\.__ph125OpenedEl === sub/.test(ia6));

console.log('\n[ ⑥ 이름 다듬기 — 보이는 글자만 손질한다 ]');
/* 2026-08-19 사장님 「손자 메뉴 이름들도 다 보기 좋게 정리해줘」.
   손질은 «보이는 글자» 에만 한다 — data-gc-name(설명 말풍선 사전 키)과 검색 색인은 원본이어야
   사전·검색이 안 어긋난다(CLAUDE.md 「ko 이름은 화면에 적힌 그대로」). 한쪽만 바꾸면 말풍선이 통째로 사라진다. */
check('보이는 글자를 다듬는다 (pretty)', /function pretty\s*\(/.test(r25));
check('한 목록에서 이름이 겹치면 그 줄만 원본으로 되돌린다 (prettyList)',
  /function prettyList\s*\(/.test(r25) && /count\[x\] > 1 \? raw\[i\]/.test(r25));
check('data-gc-name 은 «원본» 그대로다 — 사전 조회 키',
  /data-gc-name="' \+ esc\(it\.ko\)/.test(r25));
check('보이는 글자는 다듬은 것을 쓴다', /class="ph125-text">' \+ esc\(shown\[i\]\)/.test(r25));
check('이름 자르기는 pretty 안에서만 한다 — labelOf·cardTitle 은 원본을 그대로 돌려준다',
  !/slice\(0, 25\) \+ '…'/.test(r25) && /t\.slice\(0, 19\)/.test(r25));

console.log('\n[ ⑦ 손자 상자 색 — 사장님이 고른 «B 옅은 크림» ]');
/* 2026-08-19 사장님 선택. 되돌리면 사이드바(따뜻한 크림)와 계열이 어긋나 다시 겉돈다.
   ⚠️ 이 규칙은 특정성이 높은 자리(html[data-admin-theme][data-admin-tone])에 있어야 이긴다. */
const css = rd('../cloudflare-deploy/public/css/admin-inline-c.css');
check('아이보리+슬레이트 테마의 손자 상자가 따뜻한 크림(#fffaf3)이다',
  /\[data-admin-tone="slate"\][^{]*\.ph125-grandchildren\s*\{[^}]*background:\s*#fffaf3/.test(css));
check('푸른빛 흰색(#f6f9fd)으로 되돌아가지 않았다',
  !/\[data-admin-tone="slate"\][^{]*\.ph125-grandchildren\s*\{[^}]*background:\s*#f6f9fd/.test(css));

check('그룹을 접으면 그 안의 손자도 접는다 — 안 그러면 다시 펼 때 펼쳐진 채로 나온다',
  /ph85-head'\)[\s\S]{0,700}?ph85-sub\.ph125-open[\s\S]{0,120}?remove\('ph125-open'\)/.test(r25));
check('자식을 접어도 그룹은 열어 둔다 — ph97 의 «모든 그룹 접기» 를 조건 없이 되돌린다',
  /function keepGroupOpen[\s\S]{0,900}?var again = function\(\)\{ g\.classList\.add\('open'\); \};/.test(r25));

console.log('\n[ ⑧ 자식 메뉴 — 이름은 짧게, 설명은 툴팁으로 ]');
/* 2026-08-19 사장님 「자식 메뉴 이름도 같은 방식으로 정리해줘」.
   자식 이름은 이미 짧았고(전부 12자 이하) 진짜 문제는 **설명** 이었다 —
   툴팁을 붙이는 adm-s15.js 는 «대표 카드» 기준이라
     · 카드가 없는 항목(딴 페이지) → 설명이 비어 있고
     · 같은 카드의 다른 칸을 가리키는 항목(대표지사·지사·대리점·본사 관리·지사 정산)
       → 「🏬 가맹점·지사·대리점 관리」 한 줄이 네 번 똑같이 떴다(무엇이 다른지 알 수 없다).
   그래서 그런 항목은 adm-ia6.js 에서 «자기» 설명을 갖는다. 한쪽만 고치면 다시 비거나 겹친다. */
const s15 = rd('../cloudflare-deploy/public/js/adm-s15.js');
check('자식 이름에 «설명 괄호» 가 없다 — 설명은 툴팁으로 간다',
  itemLines.filter((it) => /\s[(（]/.test(it.ko)).length === 0);
check('adm-ia6.js 가 항목별 설명을 DOM 에 싣는다 (data-ia6-tip)',
  /setAttribute\('data-ia6-tip', it\.tip\)/.test(ia6) && /data-ia6-tip-en/.test(ia6));
check('adm-s15.js 가 항목별 설명을 «카드 툴팁보다» 우선한다',
  /data-ia6-tip-en'\)\)\s*\|\|\s*sub\.getAttribute\('data-ia6-tip'\)/.test(s15));
/* 카드 툴팁으로는 채울 수 없는 항목 — 딴 페이지(href)와 «카드 안 한 칸»(openSub)은
   반드시 자기 설명을 가져야 한다. 안 그러면 비거나 형제와 똑같아진다. */
/* 항목 한 덩어리 = `{ ko: '…` 부터 다음 `{ ko: '…` 직전까지. 항목 사이에 긴 주석이 끼어 있어서
   «닫는 괄호» 로 자르면 놓친다(처음에 7개 중 4개만 잡혔다). 시작점으로만 자른다. */
const chunks = ia6.split(/(?=\{ ko: ')/).filter((c) => /^\{ ko: '/.test(c));
const needTip = chunks
  .filter((c) => /(?:href|openSub):\s*'/.test(c.split('\n').slice(0, 12).join('\n')))
  .map((c) => ({ ko: (c.match(/^\{ ko: '((?:[^'\\]|\\.)*)'/) || [])[1] || '?', body: c }));
check(`카드 툴팁으로 못 채우는 항목을 찾았다 (${needTip.length}개)`, needTip.length >= 7);
const noTip = needTip.filter((it) => !/tip:\s*'/.test(it.body));
check(`그 항목들이 전부 자기 설명을 갖는다${noTip.length ? ' — 없는 것: ' + noTip.map((x) => x.ko).join(', ') : ''}`,
  noTip.length === 0);
check('「수강 운영」 이름을 바꿨으니 이사표에 한 줄 적혀 있다 — 없으면 마지막 화면이 「오늘의 수업」으로 튄다',
  /'teacher:수강 운영\(배율·정원\)':\s*'teacher:수강 운영'/.test(ia6));

console.log('\n[ ⑨ 메뉴 검색 — 복구 루프와 싸우지 않는다 ]');
/* 2026-08-19 수리. 검색이 **1.5초만 살아 있었다** — 「급여」를 치면 42개가 숨었다가 전부 되살아났다.
   범인은 admin.html 의 «강제 visible» 복구 루프(사이드바가 통째로 사라졌던 사고의 복구책)다.
   그 루프는 style.display 가 'none' 인 것을 되살리므로, 검색이 style 로 숨기면 반드시 진다.
   ⛔ 복구 루프를 지워서 풀지 말 것 — 그건 다른 사고를 되살린다.
   ✅ 검색은 «클래스» 로 숨긴다. 서로 보는 것이 달라 둘 다 살아 있다. */
check('검색이 style.display 로 숨기지 않는다 (복구 루프에 지는 방식)',
  !/s\.style\.display = \(q === ''/.test(html) && !/g\.style\.display = \(q === ''/.test(html));
check('검색 전용 숨김 클래스를 쓴다 (ph85-shide)', /var HIDE = 'ph85-shide'/.test(html));
check('그 클래스의 CSS 규칙이 있다', /\.ph85-shide[^{]*\{[^}]*display:\s*none\s*!important/.test(css));
/* 🪤 (2026-09-09) 예전에는 «손자 루프에서 400자 안에 data-gc-name 이 있는가» 로 물었다.
   그런데 그 대조를 `_gcText()` 헬퍼로 빼내자(영문 이름 `__gc.en` 까지 함께 보려고)
   그 이름이 창 밖(약 40줄 위)으로 나가 **보장은 오히려 세졌는데 검사만** 빨간불이 났다.
   CLAUDE.md 2장 「하니스가 «객체 모양» 을 정규식으로 못 박아 두어 칸 하나 늘렸더니 FAIL」.
   ✅ 이제 «뜻» 으로 묻는다 — ⓐ 손자 글자를 만드는 자리가 원본 이름을 보는가
                              ⓑ 손자 루프가 실제로 그것을 쓰는가. 짝으로 본다
      (ⓐ만 두면 헬퍼는 있는데 아무도 안 부르는 상태가 통과한다). */
const gcTextBody = (function () {
  const i = html.indexOf('function _gcText(');
  if (i < 0) return '';
  const s0 = html.indexOf('{', i);
  let d = 0;
  for (let j = s0; j < html.length; j++) {
    if (html[j] === '{') d++;
    else if (html[j] === '}') { d--; if (!d) return html.slice(s0, j + 1); }
  }
  return '';
})();
check('손자 글자를 만드는 자리가 원본 이름(data-gc-name)을 본다',
  /data-gc-name/.test(gcTextBody));
check('손자 루프가 실제로 그것을 쓴다',
  /ph125-grandchildren'\)[\s\S]{0,600}?_gcText\(/.test(html));
check('걸린 손자가 있으면 그 목록을 펴 준다', /gcHit > 0[\s\S]{0,120}?ph125-open/.test(html));
check('검색을 지우면 검색 때문에 편 것을 되돌린다 (ph85-sopen)',
  /var OPENED = 'ph85-sopen'/.test(html) && /classList\.remove\('ph125-open', OPENED\)/.test(html));
check('다시 그려도 검색어가 남아 있으면 다시 입힌다',
  /setInterval\(function\(\)\{ if \(search\.value\.trim\(\)\) runSearch\(\); \}/.test(html));
check('«강제 visible» 복구 루프는 그대로 살아 있다 — 지우지 않았다',
  /el\.style\.display === 'none'\)\s*el\.style\.display = ''/.test(html));

console.log('\n[ ⑨ 캐시 번호 ]');
for (const [file, min] of [['adm-r25', 21], ['adm-ia6', 41], ['adm-s11', 5], ['adm-s15', 4]]) {
  const m = html.match(new RegExp(`${file}\\.js\\?v=(\\d+)`));
  check(`admin.html 의 ${file}.js 버전이 ${min} 이상`, !!m && Number(m[1]) >= min);
}
check('admin.html 의 admin-inline-c.css 버전이 32 이상 — 색을 바꿨으면 캐시도 갈아야 한다',
  (() => { const m = html.match(/admin-inline-c\.css\?v=(\d+)/); return !!m && Number(m[1]) >= 33; })());

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
