// -*- coding: utf-8 -*-
// 🚪🔴 「오늘 수업」과 「지금 수업」 — 이름·자리 짝 맞음 감시            (2026-09-01)
//
//   왜 필요한가 —
//     사장님: 「오늘수업과 오늘의 수업이 헷갈려. 그리고 찾기도 어려워.」
//
//     코드로 확인해 보니 문제가 둘이었다 —
//       ① 이름이 «의» 한 글자 차이인데 서로 다른 화면이었다
//          (사이드바 항목 「오늘의 수업」 ↔ 카드 「오늘 수업 (바로 입장)」)
//       ② 「오늘 수업」은 «오늘» 그룹에 **아예 없었다** — 학생 관리 카드 안의 칸이라
//          손자 메뉴나 ⚡자주 쓰는 기능으로만 닿았다
//
//     B안(사장님 선택): 이름을 뜻대로 갈라 「오늘」 맨 위에 나란히 둔다.
//       · 오늘 수업 … 오늘 예약된 모든 수업(시간순)
//       · 지금 수업 … 지금 망고아이 화상방에 붙어 있는 것
//
//   이 하니스가 못 박는 것 — «다섯 곳이 서로 같은 말을 하는가»
//     사이드바(adm-ia6.js) · 카드 제목(admin.html) · ⚡자주 쓰는 기능 ·
//     이사표(RENAMED) · 구성표/지도 문서.
//     ⚠️ 한 곳만 고치면 에러 없이 어긋난다 — 이 저장소가 여러 번 밟은 자리다.
//
//   실행: node test-harness/today_menu_split_harness.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

let pass = 0, fail = 0;
const check = (n, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + n); }
  else { fail++; console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
};
/** 부정 검사는 주석을 벗긴 사본으로 — 「왜 바꿨는지」 적은 주석이 자기 검사에 걸린다. */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const ia6   = rd('../cloudflare-deploy/public/js/adm-ia6.js');
const html  = rd('../cloudflare-deploy/public/admin.html');
const qa    = rd('../cloudflare-deploy/public/js/adm-quick-access.js');
const docA  = rd('../cloudflare-deploy/public/admin/site-structure-admin.html');
const docM  = rd('../cloudflare-deploy/public/admin/site-structure-map.html');

const ALL   = '오늘 수업';
const LIVE  = '지금 수업';
const OLD   = '오늘의 수업';

/* GROUPS 를 «문자열로 훑지 않고» 실제로 평가해 읽는다 — 순서·openSub 같은 것은
   문자열 검사로는 볼 수 없다(구성표 대조 하니스와 같은 방식). */
function readGroups(src) {
  const i = src.indexOf('var GROUPS = [');
  const j = src.indexOf('\n  ];', i);
  if (i < 0 || j < 0) return null;
  let body = src.slice(i + 'var GROUPS = '.length, j + 4);
  body = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  try { return eval(body); } catch { return null; }
}
const G = readGroups(ia6);

console.log('\n════════ 「오늘 수업」·「지금 수업」 짝 맞음 ════════');
console.log('\n[ ① 사이드바 — 두 항목이 「오늘」 맨 위에 나란히 있는가 ]');
check('adm-ia6.js 의 GROUPS 를 읽었다', Array.isArray(G) && G.length > 0);

const today = Array.isArray(G) ? G.find((g) => g.key === 'today') : null;
check('「오늘」 그룹이 있다', !!today);
if (today) {
  const names = today.items.map((it) => it.ko);
  check(`맨 위 두 칸이 「${ALL}」·「${LIVE}」다 (실제: ${names.slice(0, 2).join(' · ')})`,
    names[0] === ALL && names[1] === LIVE, names.join(' · '));
  check(`⛔ 옛 이름 「${OLD}」이 항목으로 남아 있지 않다`, !names.includes(OLD), names.join(' · '));

  const a = today.items.find((it) => it.ko === ALL);
  const l = today.items.find((it) => it.ko === LIVE);

  console.log('\n[ ② 「오늘 수업」이 «그 칸» 을 가리키는가 ]');
  check('카드 안의 칸을 openSub 으로 가리킨다', !!a && a.openSub === 'sm-today-classes',
    a && String(a.openSub));
  check('그 앵커가 admin.html 에 실제로 있다 (없으면 카드 맨 위만 열린다)',
    /id="sm-today-classes"/.test(html));
  check('그 칸을 품은 카드를 편다 (card-students-mgmt)',
    !!a && Array.isArray(a.cards) && a.cards[0] === 'card-students-mgmt',
    a && JSON.stringify(a.cards));
  check('그 카드가 admin.html 에 있다', /id="card-students-mgmt"/.test(html));

  console.log('\n[ ③ 「지금 수업」이 실시간 카드를 가리키는가 ]');
  check('card-active-rooms 를 편다', !!l && Array.isArray(l.cards) && l.cards[0] === 'card-active-rooms',
    l && JSON.stringify(l.cards));
  check('⛔ 성격이 다른 초대 카드를 함께 묶지 않았다 (같은 것 둘이 되던 자리)',
    !!l && !l.cards.includes('card-room-invite'), l && JSON.stringify(l.cards));

  console.log('\n[ ④ 🔴 떼어 낸 카드가 «갈 곳» 을 잃지 않았는가 ]');
  /* card-room-invite 를 맡은 항목이 0개가 되면 토큰 발급·회수 화면이 메뉴에서 통째로 사라진다
     (이 저장소가 card-inquiry-mgmt 에서 실제로 밟은 사고다). */
  const owners = [];
  G.forEach((g) => g.items.forEach((it) => {
    if (Array.isArray(it.cards) && it.cards.includes('card-room-invite')) owners.push(g.ko + ' › ' + it.ko);
  }));
  check(`card-room-invite 를 맡은 항목이 정확히 하나다 (${owners.join(', ') || '없음'})`, owners.length === 1);
  check('그 카드가 admin.html 에 있다', /id="card-room-invite"/.test(html));

  console.log('\n[ ⑤ 이사표 — 어제 보던 화면이 아침에 딴 데로 튀지 않는가 ]');
  const ren = ia6.slice(ia6.indexOf('var RENAMED = {'), ia6.indexOf('};', ia6.indexOf('var RENAMED = {')));
  check(`「today:${OLD}」 을 옮겨 주는 줄이 있다`, ren.includes(`'today:${OLD}'`), ren.slice(0, 60));
  check(`그 줄이 「today:${LIVE}」 로 잇는다`, ren.includes(`'today:${LIVE}'`));
  /* 이사표의 «목적지» 가 실제로 있는 항목인지까지 본다 — 오타 한 글자면 조용히 미아가 된다. */
  const dests = [...ren.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);
  const allKeys = new Set();
  G.forEach((g) => g.items.forEach((it) => allKeys.add(g.key + ':' + it.ko)));
  const orphan = dests.filter((d) => !allKeys.has(d));
  check(`이사표가 가리키는 항목이 전부 실재한다${orphan.length ? ' — ' + orphan.join(', ') : ''}`,
    orphan.length === 0);

  console.log('\n[ ⑥ 항목 이름이 유일한가 (키가 «그룹:이름» 이라 겹치면 조용히 섞인다) ]');
  const dup = [];
  G.forEach((g) => {
    const seen = new Set();
    g.items.forEach((it) => { if (seen.has(it.ko)) dup.push(g.ko + ' › ' + it.ko); seen.add(it.ko); });
  });
  check(`한 그룹 안에 같은 이름이 없다${dup.length ? ' — ' + dup.join(', ') : ''}`, dup.length === 0);
}

console.log('\n[ ⑦ 카드 제목이 사이드바와 «같은 말» 인가 ]');
check('오늘 목록 카드 제목이 「오늘 수업 (전체 · 바로 입장)」이다',
  /data-ko="🚪 오늘 수업 \(전체 · 바로 입장\)"/.test(html));
check('실시간 카드 제목이 「지금 수업 (실시간)」이다',
  /data-ko="🔴 지금 수업 \(실시간\)"/.test(html));
check('⛔ 옛 카드 제목 「🔴 실시간 수업 현황」이 admin.html 에 남아 있지 않다',
  !/data-ko="🔴 실시간 수업 현황"/.test(html));
check('⛔ 옛 카드 제목 「🚪 오늘 수업 (바로 입장)」이 남아 있지 않다',
  !/data-ko="🚪 오늘 수업 \(바로 입장\)"/.test(html));
/* ⚠️ 권한 표(adm-core.js 의 realtime_class)의 «실시간 수업 현황» 은 다른 화면의 라벨이라
   일부러 그대로 두었다. 그것까지 지우려 들면 권한 화면과 그 번역표가 어긋난다. */
check('권한 표의 라벨은 건드리지 않았다 (다른 화면이다)',
  /name_ko: '실시간 수업 현황'/.test(rd('../cloudflare-deploy/public/js/adm-core.js')));

console.log('\n[ ⑧ ⚡자주 쓰는 기능도 같은 말인가 ]');
check(`라벨이 「${ALL}」이다`, qa.includes(`ko: '${ALL}'`), '');
check('가리키는 곳은 그대로다 (card-students-mgmt › sm-today-classes)',
  /card: 'card-students-mgmt', sub: 'sm-today-classes'/.test(qa));
/* key 를 바꾸면 사람이 쌓아 둔 사용기록(mangoi_qa_use)이 통째로 초기화된다 — 순서가 리셋된다. */
check('⛔ key 는 그대로다 (사용기록이 그 키로 쌓여 있다)', /key: '오늘수업'/.test(qa));

console.log('\n[ ⑨ 문서(구성표·지도)에 옛 이름이 남아 있지 않은가 ]');
/* 구성표는 사이드바를 손으로 옮겨 적은 문서다 — 낡으면 사람이 그 문서를 믿고 헤맨다.
   (개수·이름 대조 자체는 admin_site_structure_sync_harness 가 한다) */
check(`구성표에 「${ALL}」·「${LIVE}」가 둘 다 있다`,
  docA.includes(`"${ALL}"`) && docA.includes(`"${LIVE}"`));
check(`⛔ 구성표에 옛 항목 이름 「${OLD}」이 없다`, !docA.includes(`t: "${OLD}"`));
check(`⛔ 지도에도 옛 이름이 없다`, !docM.includes(`>${OLD}<`));
check('구성표에 「화상강의실 초대」 항목이 있다', docA.includes('t: "화상강의실 초대"'));

console.log('\n[ ⑩ 손자 메뉴 앵커가 그대로 살아 있는가 ]');
const r25 = rd('../cloudflare-deploy/public/js/adm-r25.js');
check('학생 명부 카드의 손자에 「🚪 오늘 수업」 앵커가 있다 (다른 길로도 닿는다)',
  /anchor:'sm-today-classes'/.test(r25));

console.log('\n[ ⑪ 🔴 같은 카드를 가리키는 항목이 둘일 때 «주인» 을 고르는가 ]');
/* 밖에서 카드로 오는 점프(⚡자주 쓰는 기능 · #card-… 딥링크 · ?smq= 검색 · 허브 · 홈 전체메뉴 ·
   AI 명령)는 전부 data-card 로 항목을 찾아 «대신 눌러» 준다. querySelector 는 **첫 매치**라,
   DOM 에서 앞선 그룹이 그 카드를 통째로 가져간다.
   2026-09-01 실측: 「오늘 수업」(오늘 그룹 = 맨 앞)이 card-students-mgmt 를 가리키게 되자
   「학생 목록」을 눌러도 «오늘 수업» 칸이 맨 위에 오고 학생 명부가 화면 위로 밀려났다(top −546).
   ✅ openSub(data-ia6-sub) 항목은 카드 «안의 칸» 을 가리키는 잎이지 주인이 아니다 — 뒤로 미룬다. */
{
  const ia6Code = strip(ia6);
  const qaCode  = strip(qa);
  check('adm-ia6.js 가 :not([data-ia6-sub]) 를 «먼저» 찾는다',
    /querySelector\(q \+ ':not\(\[data-ia6-sub\]\)'\) \|\| document\.querySelector\(q\)/.test(ia6Code));
  check('adm-quick-access.js 도 같은 순서로 찾는다',
    /querySelector\(q \+ ':not\(\[data-ia6-sub\]\)'\) \|\| document\.querySelector\(q\)/.test(qaCode));
  check('⛔ 「주인 아무거나 첫 매치」로 되돌아가지 않았다',
    !/querySelector\('#ph85-sidebar \[data-ia6-item\]\[data-card="' \+ card\.id \+ '"\]'\)/.test(ia6Code));
  /* 같은 카드를 둘 이상이 가리키는 자리를 세어 둔다 — 늘어나면 이 규칙이 더 중요해진다. */
  const owners = {};
  (G || []).forEach((g) => g.items.forEach((it) => {
    (it.cards || []).slice(0, 1).forEach((c) => { (owners[c] = owners[c] || []).push({ k: g.key + ':' + it.ko, sub: !!it.openSub }); });
  }));
  const shared = Object.entries(owners).filter(([, v]) => v.length > 1);
  check(`대표 카드를 여럿이 가리키는 곳: ${shared.map(([c, v]) => c + '×' + v.length).join(', ') || '없음'}`, true);
  /* 항목이 «전부» 잎(openSub)인 카드는 주인이 없다 — 그때는 첫 매치로 떨어지고, 그게 옛 동작이라
     안전하다. 다만 «새로» 그런 카드가 생기면 알아채야 하므로 아는 것만 통과시킨다.
     card-franchises: 대표지사·지사·대리점·본사 관리 넷이 한 카드의 서로 다른 칸을 가리킨다(2026-08-18). */
  const ALLOW_NO_OWNER = new Set(['card-franchises']);
  const noOwner = shared.filter(([c, v]) => v.every((x) => x.sub) && !ALLOW_NO_OWNER.has(c));
  check(`«주인» 이 없는 카드가 새로 생기지 않았다${noOwner.length ? ' — ' + noOwner.map(([c]) => c).join(', ') : ''}`,
    noOwner.length === 0);
  /* 🔴 그리고 이번 사고의 형태 — 주인이 «있는데» 잎이 앞에 서서 가로채는 상태. 선택자가 막지만,
     그 선택자를 되돌리면 곧바로 재현되므로 어느 카드가 그 상태인지 적어 둔다. */
  const risky = shared.filter(([, v]) => v.some((x) => x.sub) && v.some((x) => !x.sub))
    .map(([c, v]) => c + '(' + v.map((x) => (x.sub ? '잎 ' : '주인 ') + x.k).join(' · ') + ')');
  check(`주인과 잎이 같은 카드를 가리키는 곳을 알고 있다: ${risky.join(' / ') || '없음'}`, true);
}

/* \U0001f501 이사표가 «마지막으로 보던 항목» 말고 다른 저장소에도 닿는가 —
   ⭐고정(adm-quickfav)·최근 본 메뉴(adm-recent-menus)가 같은 꼴의 키를 따로 저장한다.
   안 닿으면 이름을 바꾼 순간 ⭐이 말없이 사라지고, 최근 칩은 눌러도 아무 데도 안 간다. */
console.log('\n[ ⑫ 이사표가 ⭐고정·최근 본 메뉴에도 닿는가 ]');
check('adm-ia6.js 가 renameKey 를 내보낸다', /renameKey:\s*function/.test(ia6));
check('⭐고정이 그것을 거쳐 항목을 찾는다',
  /mangoiIA6\.renameKey/.test(rd('../cloudflare-deploy/public/js/adm-quickfav.js')));
check('최근 본 메뉴도 그것을 거친다',
  /mangoiIA6\.renameKey/.test(rd('../cloudflare-deploy/public/js/adm-recent-menus.js')));

console.log('\n[ ⑬ 강사에게 403 이 «고장» 으로 보이지 않는가 ]');
/* 「오늘 수업」이 «오늘» 그룹 첫 항목 = 저장값이 없는 첫 방문의 기본 착지 지점이 됐다.
   그 칸은 열리자마자 /api/admin/classes/today 를 부르는데, 그 경로는 강사 차단(403)이다. */
{
  const tc = rd('../cloudflare-deploy/public/js/adm-today-classes.js');
  check('403 이면 «권한» 이라고 사실대로 말하고 끝낸다', /r\.status === 403/.test(strip(tc)));
  check('그때 빨간 «불러오기 실패» 상자를 그리지 않는다',
    /r\.status === 403[\s\S]{0,400}본사 관리자/.test(strip(tc)));
}

console.log('\n──────────────────────────────────────────');
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
