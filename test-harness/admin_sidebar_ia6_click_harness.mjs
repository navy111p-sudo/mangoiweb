// -*- coding: utf-8 -*-
// 🧭 관리자 사이드바(6그룹) 클릭 배선 하네스 (2026-08-08)
//   실행: node test-harness/admin_sidebar_ia6_click_harness.mjs
//
//   신고: 「사이드바에서 레벨테스트를 눌러도 그 메뉴로 안 간다. 다른 것들도 마찬가지다.」
//
//   🔴 원인 — `adm-ia6.js` 가 리스너를 **사이드바(#ph85-sidebar)** 에 달았다.
//      그런데 `adm-s11.js`(ph97)가 **window 캡처**에서 `.ph85-sub`·`.ph85-head` 를 가로채
//      `e.stopPropagation()` 을 부른다(그 파일 주석: «어떤 stopPropagation 도 막을 수 없음»).
//      캡처는 window → … → 사이드바 순서라, window 에서 끊기면 이벤트가 사이드바까지
//      **내려오지 않는다.** 실측: 사이드바 버블 리스너 발화 **0회** / window 캡처 **1회**.
//      → 클릭은 ph97 만 처리했고, ph97 은 인라인 `style.display=''` 로 카드를 되살리려 하는데
//        ia6 는 `.ia6-hide{display:none !important}` 로 감춘다. **인라인은 !important 를 못 이긴다.**
//        그래서 «카드는 열렸는데 화면엔 안 보이고, 스크롤도 안 움직이는» 상태가 됐다. 에러 0.
//
//   🔴 두 번째 — 필터가 걸려도 대시보드 머리(hero·KPI·빠른메뉴 ≈ 1,200px)는 카드가 아니라
//      감춰지지 않는다. 그래서 `window.scrollTo(0,0)` 로는 카드가 화면 밖(top 1203px)에 남았다.
//      → 대표 카드를 `scrollIntoView` 로 올린다.
//   🪤 그 스크롤을 **rAF 로 하면 안 된다** — 백그라운드/숨은 탭에서 rAF 는 아예 안 돈다(실측 0회).
//      타이머는 돈다. (CLAUDE.md 의 «백그라운드 탭에서 rAF 가 멈춘다» 와 같은 함정)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const rd = (p) => { try { return readFileSync(resolve(__dir, p), 'utf8'); } catch { return ''; } };

const ia6  = rd('../cloudflare-deploy/public/js/adm-ia6.js');
const s11  = rd('../cloudflare-deploy/public/js/adm-s11.js');
const html = rd('../cloudflare-deploy/public/admin.html');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

console.log('\n[ ① 전제 — ph97 은 정말 window 캡처에서 전파를 끊는가 ]');
check('adm-s11.js(ph97)가 window 캡처 click 을 건다',
  /window\.addEventListener\('click'/.test(s11) && /\}, true\);\s*\/\/ CAPTURE phase/.test(s11));
check('그 안에서 .ph85-sub 를 가로챈다', /closest\('#ph85-sidebar \.ph85-sub'\)/.test(s11));
check('그리고 stopPropagation 을 부른다 — 사이드바에 단 리스너는 굶는다', /e\.stopPropagation\(\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*\}, true\);/.test(s11));

console.log('\n[ ② 그래서 ia6 는 window 캡처로 들어야 한다 ]');
check('🔴 사이드바(bar)에 직접 달지 않는다 — 이걸로 되돌리면 전 메뉴가 죽는다',
  !/bar\.addEventListener\('click'/.test(ia6));
check('window 에 건다', /window\.addEventListener\('click'/.test(ia6));
check('캡처 단계다 (마지막 인자 true)', /window\.addEventListener\('click'[\s\S]{0,3000}?\}, true\);/.test(ia6));
check('중복 등록 가드가 window 기준이다 (bar 가 다시 그려져도 유지)', /window\.__ia6Deleg/.test(ia6));
{
  // 주석에는 설명으로 등장하므로 «실행되는 줄» 만 골라서 본다.
  const body = (ia6.match(/function wireDelegate\([\s\S]*?\n  \}/) || [''])[0]
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  check('우리는 stopPropagation 하지 않는다 — 아래 리스너를 굶기지 않기 위해',
    body.length > 50 && !/e\.stopPropagation\(\)/.test(body));
}

console.log('\n[ ③ 아코디언을 두 번 토글하지 않는다 (서로 상쇄되면 영영 안 열린다) ]');
check('그룹 헤더 토글은 ph97 에게 맡긴다 — ia6 는 .ph85-group 의 open 을 건드리지 않는다',
  !/wasOpen/.test(ia6) && !/querySelectorAll\('\.ph85-group'\)/.test(ia6));
check('ia6 가 헤더에서 맡는 것은 「전체 보기」 하나뿐', /data-ia6-head'\)\s*===\s*'__all'/.test(ia6));

console.log('\n[ ④ 고른 카드를 «화면에» 올린다 ]');
check('대표 카드를 붙잡아 둔다 (lead)', /var lead = null;/.test(ia6));
check('scrollIntoView 로 올린다', /lead\.scrollIntoView\(\{ behavior: 'auto'/.test(ia6));
check('🪤 rAF 를 쓰지 않는다 — 숨은 탭에서 안 돌아 스크롤이 영영 안 일어난다',
  !/requestAnimationFrame/.test(ia6));
check('배치가 끝난 뒤 보정한다 (타이머 2번)', (ia6.match(/setTimeout\(toLead/g) || []).length >= 2);
check('smooth 금지 규칙을 지킨다', !/behavior:\s*'smooth'/.test(ia6));
check('대표 카드를 못 찾을 때만 맨 위로 (무동작 금지)', /\} else \{\s*\n\s*try \{ window\.scrollTo\(0, 0\)/.test(ia6));

console.log('\n[ ⑤ 감추기는 class + !important — 인라인 display 로는 못 되돌린다 ]');
check('ia6 는 class 로만 감춘다 (DOM 에서 빼지 않는다)', /classList\.add\(HIDE\)/.test(ia6) && !/\.remove\(\)/.test(ia6));
check('그 CSS 가 !important 다', /HIDE \+ '\{display:none !important\}|\.' \+ HIDE \+ '\{display:none !important\}/.test(ia6));

console.log('\n[ ⑥ 캐시 — 고친 js 가 실제로 내려가야 한다 ]');
{
  const m = html.match(/adm-ia6\.js\?v=(\d+)/);
  check(`admin.html 이 adm-ia6.js 를 버전과 함께 부른다 (?v=${m ? m[1] : '없음'})`, !!m);
  check('버전이 3 이상 (이번 수정 반영 — ?v= 를 안 올리면 옛 파일이 캐시에서 나온다)', !!m && Number(m[1]) >= 3);
}

/* 🐞 (2026-08-13 수정요청 #04) 버그·문의 화면에 «신규상담 → 등록 전환» 이 같이 떴다.
   원인은 GROUPS 의 한 항목이 두 카드를 함께 맡고 있던 것 하나뿐이다(다른 코드는 정상).
   항목을 둘로 쪼개 고쳤으니, 「다시 한 칸으로 묶으면 신고가 되돌아온다」를 여기서 막는다.
   ⚠️ 「card-inquiry-mgmt 를 통째로 지운다」로 고치는 것도 막는다 — 그러면 요구사항 2
      (신규상담 기능은 다른 화면에서 그대로 유지)를 어기고 메뉴에서 아예 사라진다. */
console.log('\n[ ⑦ 버그 화면과 신규상담 화면은 따로다 (2026-08-13 #04) ]');
{
  const start = ia6.indexOf('var GROUPS = [');
  const end = ia6.indexOf('\n  ];', start);
  const G = start >= 0 && end > start ? eval(ia6.slice(start + 'var GROUPS = '.length, end + 4)) : [];
  const items = G.flatMap(g => g.items.map(it => ({ key: g.key + ':' + it.ko, cards: it.cards || [] })));
  const owners = (id) => items.filter(it => it.cards.indexOf(id) >= 0);
  const inq = owners('card-inquiry-mgmt'), bug = owners('card-bug-reports');

  check('GROUPS 를 읽어냈다 (아래 검사의 전제)', items.length > 0);
  check('💌 신규상담 카드를 맡은 항목이 있다 — 없으면 메뉴에서 사라진다', inq.length > 0);
  check('🐞 버그 카드를 맡은 항목이 있다', bug.length > 0);
  check('🔴 둘을 같은 항목이 맡지 않는다 — 같이 맡으면 한 화면에 함께 뜬다',
    !items.some(it => it.cards.indexOf('card-inquiry-mgmt') >= 0 && it.cards.indexOf('card-bug-reports') >= 0));
  check('🐞 버그 카드가 «대표 카드(cards[0])» 다 — 점프·딥링크가 제 항목을 찾는다',
    bug.some(it => it.cards[0] === 'card-bug-reports'));
}

/* 🔁 항목 이름이 곧 localStorage 키다. 이름을 바꿔 놓고 이사를 안 시키면
   쓰던 사람이 다음 접속에 「오늘의 수업」으로 튄다 — «메뉴가 없어졌다» 신고가 된다. */
console.log('\n[ ⑧ 이름이 바뀐 항목은 옛 키를 새 키로 옮긴다 ]');
check('RENAMED 이사표가 있다', /var RENAMED = \{/.test(ia6));
check('옛 「문의·버그」 키를 잇는다', /'today:문의·버그'\s*:\s*'today:신규상담'/.test(ia6));
check('옮긴 값을 localStorage 에 다시 적는다 (다음 접속에도 유지)',
  /RENAMED\[want\][\s\S]{0,220}?localStorage\.setItem\(LS_KEY, want\)/.test(ia6));

console.log(`\n─────────────────────────────────────────────`);
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log(`─────────────────────────────────────────────\n`);
process.exit(FAIL ? 1 : 0);
